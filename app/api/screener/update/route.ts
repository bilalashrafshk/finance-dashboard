import { NextResponse } from 'next/server'
import { Pool } from 'pg'
import { fetchScreenerBatchData } from '@/lib/screener/batch-data-fetcher'

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
    
    // 1. Get all PK Equity symbols that have price data
    // This ensures we process all assets with price data, even if they don't have company_profiles yet
    const { rows: priceSymbols } = await client.query(`
      SELECT DISTINCT symbol 
      FROM historical_price_data 
      WHERE asset_type = 'pk-equity'
      ORDER BY symbol
    `)
    const allSymbols = priceSymbols.map(p => p.symbol)
    
    if (allSymbols.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'No PK equity symbols with price data found' })
    }
    
    console.log(`[Screener Update] Found ${allSymbols.length} symbols with price data`)
    
    // 2. Fetch all data using centralized batch function
    // Pass baseUrl so it can make internal API calls
    const url = new URL(request.url)
    const baseUrl = url.origin || 
                    process.env.NEXT_PUBLIC_APP_URL || 
                    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const batchData = await fetchScreenerBatchData(allSymbols, 'pk-equity', baseUrl)
    
    console.log(`[Screener Update] Received data for ${Object.keys(batchData).length} symbols`)
    
    // 3. Calculate Metrics per Company
    // Process ALL stocks with price data, even if profile/financials are missing
    const companyMetrics = []
    
    for (const [symbol, data] of Object.entries(batchData)) {
      const { price, profile, financials } = data
      
      // Require price (critical), but allow missing profile/financials
      if (!price) {
        console.log(`[Screener Update] Skipping ${symbol}: No price data`)
        continue
      }
      
      // Calculate TTM EPS from last 4 quarters (if available)
      let ttmEps = 0
      let peRatio = null
      
      if (financials && financials.length === 4) {
        // Calculate TTM EPS
        ttmEps = financials.reduce((sum, row) => sum + (row.eps_diluted || row.eps_basic || 0), 0)
        
        if (ttmEps > 0) {
          peRatio = price.price / ttmEps
        }
      }
      
      // Note: Dividend yield calculation removed as per user request
      // Screener doesn't need dividends

      // Create entry with whatever data we have
      companyMetrics.push({
        symbol: symbol,
        sector: profile?.sector || 'Unknown',
        industry: profile?.industry || 'Unknown',
        price: price.price,
        priceDate: price.date,
        peRatio: peRatio, // Can be null if financials missing
        dividendYield: 0, // Not calculated anymore
        marketCap: profile?.market_cap || null
      })
    }
    
    console.log(`[Screener Update] Processing ${companyMetrics.length} companies (${companyMetrics.filter(m => m.peRatio !== null).length} with P/E ratios)`)
    
    // 3. Calculate Sector Averages (Median P/E)
    // Median is robust against outliers (e.g. one company with P/E 500)
    const sectorGroups = new Map() // Sector -> [PEs]
    const industryGroups = new Map() // Industry -> [PEs]
    
    companyMetrics.forEach(m => {
       if (m.peRatio && m.peRatio > 0 && m.peRatio < 500) { // Filter valid positive P/Es
         // Group by sector
         if (!sectorGroups.has(m.sector)) sectorGroups.set(m.sector, [])
         sectorGroups.get(m.sector).push(m.peRatio)
         
         // Group by industry
         if (!industryGroups.has(m.industry)) industryGroups.set(m.industry, [])
         industryGroups.get(m.industry).push(m.peRatio)
       }
    })
    
    const sectorAverages = new Map()
    sectorGroups.forEach((pes, sector) => {
       pes.sort((a: number, b: number) => a - b)
       const mid = Math.floor(pes.length / 2)
       const median = pes.length % 2 !== 0 ? pes[mid] : (pes[mid - 1] + pes[mid]) / 2
       sectorAverages.set(sector, median)
    })
    
    const industryAverages = new Map()
    industryGroups.forEach((pes, industry) => {
       pes.sort((a: number, b: number) => a - b)
       const mid = Math.floor(pes.length / 2)
       const median = pes.length % 2 !== 0 ? pes[mid] : (pes[mid - 1] + pes[mid]) / 2
       industryAverages.set(industry, median)
    })
    
    // 4. Prepare Final Data & Upsert
    // Create entries for ALL stocks with price data, even if P/E is NULL
    let upsertCount = 0
    let skippedCount = 0
    
    for (const metric of companyMetrics) {
       // Calculate sector/industry averages only if we have valid P/E ratios
       const sectorPe = sectorAverages.get(metric.sector) || null
       const industryPe = industryAverages.get(metric.industry) || null
       
       let relativePe = null
       if (metric.peRatio && sectorPe) {
         relativePe = metric.peRatio / sectorPe
       }
       
       let relativePeIndustry = null
       if (metric.peRatio && industryPe) {
         relativePeIndustry = metric.peRatio / industryPe
       }
       
       // Upsert to DB - create entry even if P/E is NULL
       // This ensures all stocks with price data appear in screener
       try {
         await client.query(`
           INSERT INTO screener_metrics 
           (asset_type, symbol, sector, industry, price, price_date, pe_ratio, dividend_yield, sector_pe, relative_pe, industry_pe, relative_pe_industry, market_cap, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
           ON CONFLICT (asset_type, symbol)
           DO UPDATE SET
             price = EXCLUDED.price,
             price_date = EXCLUDED.price_date,
             pe_ratio = EXCLUDED.pe_ratio,
             dividend_yield = EXCLUDED.dividend_yield,
             sector_pe = EXCLUDED.sector_pe,
             relative_pe = EXCLUDED.relative_pe,
             sector = EXCLUDED.sector,
             industry = EXCLUDED.industry,
             industry_pe = EXCLUDED.industry_pe,
             relative_pe_industry = EXCLUDED.relative_pe_industry,
             market_cap = EXCLUDED.market_cap,
             updated_at = NOW()
         `, [
           'pk-equity',
           metric.symbol,
           metric.sector,
           metric.industry,
           metric.price,
           metric.priceDate,
           metric.peRatio,
           metric.dividendYield,
           sectorPe,
           relativePe,
           industryPe,
           relativePeIndustry,
           metric.marketCap
         ])
         upsertCount++
       } catch (error: any) {
         console.error(`[Screener Update] Failed to upsert ${metric.symbol}:`, error.message)
         skippedCount++
       }
    }
    
    console.log(`[Screener Update] Successfully updated metrics for ${upsertCount} companies. ${skippedCount > 0 ? `${skippedCount} failed.` : ''}`)
    return NextResponse.json({ 
      success: true, 
      count: upsertCount,
      skipped: skippedCount,
      withPE: companyMetrics.filter(m => m.peRatio !== null).length,
      withoutPE: companyMetrics.filter(m => m.peRatio === null).length
    })
    
  } catch (error: any) {
    console.error('[Screener Update] Failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  } finally {
    client.release()
  }
}

