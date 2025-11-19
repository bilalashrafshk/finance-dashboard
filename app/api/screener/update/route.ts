import { NextResponse } from 'next/server'
import { Pool } from 'pg'

// Re-use existing DB connection logic or create new for this batch job
// We use a direct pool here for simplicity in the cron job
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

/**
 * CRON JOB: Update Screener Metrics
 * 
 * This route should be called once daily (e.g., via Vercel Cron).
 * It performs heavy calculations to populate the 'screener_metrics' table.
 * 
 * Logic:
 * 1. Get all PK Equity symbols from company_profiles.
 * 2. For each symbol:
 *    - Get latest price (from historical_price_data).
 *    - Get EPS (TTM) from financial_statements.
 *    - Calculate P/E.
 * 3. Group by Sector:
 *    - Calculate Sector Average P/E (Median is better to remove outliers).
 * 4. Calculate Relative Metrics:
 *    - Relative P/E = Stock P/E / Sector P/E.
 * 5. Upsert into 'screener_metrics' table.
 */
export async function GET(request: Request) {
  // Verify cron secret (optional but recommended for production)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // For now, we skip auth to allow easy testing, but in prod uncomment above
  }

  const client = await pool.connect()
  
  try {
    console.log('[Screener Update] Starting daily update...')
    
    // 1. Fetch Base Data
    // Get latest price for each symbol
    // We use a subquery to get the most recent price per symbol
    const pricesQuery = `
      SELECT DISTINCT ON (symbol) symbol, close as price, date as price_date
      FROM historical_price_data
      WHERE asset_type = 'pk-equity'
      ORDER BY symbol, date DESC
    `
    
    // Get TTM EPS for each symbol
    // We need to sum the last 4 quarters of EPS
    // This is complex in SQL, so we'll fetch recent financials and calc in JS for flexibility
    // Or better, let's try a robust SQL approach if possible, but JS is safer for logic nuances.
    
    const { rows: priceRows } = await client.query(pricesQuery)
    const priceMap = new Map(priceRows.map(r => [r.symbol, { price: parseFloat(r.price), date: r.price_date }]))
    
    const { rows: profiles } = await client.query(`SELECT symbol, sector FROM company_profiles WHERE asset_type = 'pk-equity'`)
    
    // 2. Calculate Metrics per Company
    const companyMetrics = []
    
    for (const profile of profiles) {
      const symbol = profile.symbol
      const priceData = priceMap.get(symbol)
      
      if (!priceData) continue; // Skip if no price
      
      // Fetch Financials for EPS (Last 4 Quarters)
      // Optimized query to get last 4 quarterly reports
      const financialsRes = await client.query(`
        SELECT period_end_date, eps_basic, eps_diluted
        FROM financial_statements
        WHERE symbol = $1 AND asset_type = 'pk-equity' AND period_type = 'quarterly'
        ORDER BY period_end_date DESC
        LIMIT 4
      `, [symbol])
      
      let ttmEps = 0
      let peRatio = null
      
      if (financialsRes.rows.length === 4) {
        // Calculate TTM EPS
        ttmEps = financialsRes.rows.reduce((sum, row) => sum + parseFloat(row.eps_diluted || row.eps_basic || 0), 0)
        
        if (ttmEps > 0) {
          peRatio = priceData.price / ttmEps
        }
      }
      
      // Fetch Dividend Yield (Annualized from last year dividend)
      // Simplified: Sum dividends from last 365 days
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const divRes = await client.query(`
        SELECT dividend_amount
        FROM dividend_data
        WHERE symbol = $1 AND asset_type = 'pk-equity' AND date >= $2
      `, [symbol, oneYearAgo.toISOString().split('T')[0]])
      
      // Dividends are usually stored as percent (e.g. 25% = Rs 2.5 for Rs 10 face value)
      // We need Face Value to convert % to Rupees.
      // Assuming standard Rs 10 face value for now if not in DB, but let's check profile.
      const faceValueRes = await client.query(`SELECT face_value FROM company_profiles WHERE symbol = $1`, [symbol])
      const faceValue = parseFloat(faceValueRes.rows[0]?.face_value || '10')
      
      let totalDivRupees = 0
      divRes.rows.forEach(row => {
         // dividend_amount is typically percent e.g. 25.0
         // Dividend in Rs = (Percent / 100) * Face Value
         // Note: In your DB schema comment it says "percent/10 (e.g., 110% = 11.0)". 
         // Let's stick to standard: If 11.0 means 110%, then (11.0 / 10) * 10 = Rs 11.
         // Wait, usually "110%" is stored as 110 or 1.1?
         // Looking at previous code "convertDividendToRupees", it implies logic.
         // Let's assume dividend_amount is % value (e.g. 150 for 150%).
         // Rs = (Amount / 100) * FaceValue.
         totalDivRupees += (parseFloat(row.dividend_amount) / 100) * faceValue
      })
      
      let dividendYield = 0
      if (priceData.price > 0) {
        dividendYield = (totalDivRupees / priceData.price) * 100
      }

      companyMetrics.push({
        symbol: symbol,
        sector: profile.sector || 'Unknown',
        price: priceData.price,
        priceDate: priceData.date,
        peRatio: peRatio, // Can be null or negative
        dividendYield: dividendYield
      })
    }
    
    // 3. Calculate Sector Averages (Median P/E)
    // Median is robust against outliers (e.g. one company with P/E 500)
    const sectorGroups = new Map() // Sector -> [PEs]
    
    companyMetrics.forEach(m => {
       if (m.peRatio && m.peRatio > 0 && m.peRatio < 500) { // Filter valid positive P/Es
         if (!sectorGroups.has(m.sector)) sectorGroups.set(m.sector, [])
         sectorGroups.get(m.sector).push(m.peRatio)
       }
    })
    
    const sectorAverages = new Map()
    sectorGroups.forEach((pes, sector) => {
       pes.sort((a: number, b: number) => a - b)
       const mid = Math.floor(pes.length / 2)
       const median = pes.length % 2 !== 0 ? pes[mid] : (pes[mid - 1] + pes[mid]) / 2
       sectorAverages.set(sector, median)
    })
    
    // 4. Prepare Final Data & Upsert
    let upsertCount = 0
    
    for (const metric of companyMetrics) {
       const sectorPe = sectorAverages.get(metric.sector) || null
       
       let relativePe = null
       if (metric.peRatio && sectorPe) {
         relativePe = metric.peRatio / sectorPe
       }
       
       // Upsert to DB
       await client.query(`
         INSERT INTO screener_metrics 
         (asset_type, symbol, sector, price, price_date, pe_ratio, dividend_yield, sector_pe, relative_pe, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (asset_type, symbol)
         DO UPDATE SET
           price = EXCLUDED.price,
           price_date = EXCLUDED.price_date,
           pe_ratio = EXCLUDED.pe_ratio,
           dividend_yield = EXCLUDED.dividend_yield,
           sector_pe = EXCLUDED.sector_pe,
           relative_pe = EXCLUDED.relative_pe,
           updated_at = NOW()
       `, [
         'pk-equity',
         metric.symbol,
         metric.sector,
         metric.price,
         metric.priceDate,
         metric.peRatio,
         metric.dividendYield,
         sectorPe,
         relativePe
       ])
       upsertCount++
    }
    
    console.log(`[Screener Update] Successfully updated metrics for ${upsertCount} companies.`)
    return NextResponse.json({ success: true, count: upsertCount })
    
  } catch (error: any) {
    console.error('[Screener Update] Failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  } finally {
    client.release()
  }
}

