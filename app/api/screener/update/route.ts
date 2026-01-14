import { NextResponse } from 'next/server'
import { Pool } from 'pg'
import { fetchScreenerBatchData } from '@/lib/screener/batch-data-fetcher'
import { calculateAllMetrics, PriceDataPoint } from '@/lib/asset-screener/metrics-calculations'
import { fetchHistoricalData } from '@/lib/portfolio/unified-price-api'
import { getHistoricalDataBatch, getDividendDataBatch, insertDividendData, DividendRecord } from '@/lib/portfolio/db-client'
import { syncAllPSXLivePrices } from '@/lib/portfolio/psx-bulk-service'

// Re-use existing DB connection logic or create new for this batch job
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

/**
 * CRON JOB: Update Screener Metrics (OPTIMIZED)
 * 
 * Frequency: Frequent (e.g. every 15 mins)
 * 
 * Logic:
 * 1. "Time Budget" Execution: Run for max 50s.
 * 2. "Staleness" Priority: Fetch symbols updated longest ago (or never).
 * 3. "Batch" Processing: Use optimized DB queries instead of HTTP requests.
 */
export const maxDuration = 60 // Max 60s for Vercel Hobby, but we constrain to 50s internally

export async function GET(request: Request) {
  // Verify cron secret (optional but recommended for production)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect()
  const startTime = Date.now()
  const TIME_LIMIT_MS = 45000 // 45 seconds safety limit (Max duration is 60s)

  try {
    // 0. High-Speed Price Sync (Always Run)
    // Sync all PSX prices via Market Watch - works during AND after market hours
    // PSX Market Watch data becomes static/EOD after market close, still valid for today's prices
    console.log('[Screener Update] Syncing all PSX prices via Bulk Scraper...');
    const syncCount = await syncAllPSXLivePrices();
    console.log(`[Screener Update] Bulk Sync complete. Updated ${syncCount} symbols.`);


    // Parse params
    const url = new URL(request.url)
    const limitParams = url.searchParams.get('limit')
    const limit = limitParams ? parseInt(limitParams) : 30 // Default 30 symbols per run (reduced to prevent timeout)

    // 1. Get Stale Symbols (Prioritize oldest updated)
    //    Use GROUP BY instead of DISTINCT to allow ordering by joined column
    const staleQuery = `
      SELECT h.symbol
      FROM historical_price_data h
      LEFT JOIN screener_metrics s ON h.symbol = s.symbol AND s.asset_type = 'pk-equity'
      WHERE h.asset_type = 'pk-equity'
      GROUP BY h.symbol, s.updated_at
      ORDER BY s.updated_at ASC NULLS FIRST, h.symbol ASC
      LIMIT $1
    `
    const { rows: priceSymbols } = await client.query(staleQuery, [limit])
    const allSymbols = priceSymbols.map(p => p.symbol)

    if (allSymbols.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'No symbols found or all up to date' })
    }



    // Determine base URL
    const baseUrl = url.origin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    // 2. Fetch Benchmark Data (KSE100) for Beta Calculation (3 Years)
    const endDate = new Date().toISOString().split('T')[0]
    const threeYearsAgo = new Date()
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)
    const startDate = threeYearsAgo.toISOString().split('T')[0]

    // We still fetch KSE100 via API or DB once (it's fast)
    let benchmarkData: PriceDataPoint[] = []
    try {
      // Direct DB fetch for KSE100 is better
      const kseRes = await getHistoricalDataBatch('indices', ['KSE100'], startDate, endDate)
      if (kseRes['KSE100']) {
        benchmarkData = kseRes['KSE100'].map(d => ({ date: d.date, close: d.close }))
      } else {
        // Fallback to API if not in DB yet
        const kseData = await fetchHistoricalData('indices', 'KSE100', startDate, endDate, baseUrl)
        if (kseData && kseData.data) {
          benchmarkData = kseData.data.map(d => ({ date: d.date, close: d.close }))
        }
      }
    } catch (e) {
      console.error('[Screener Update] Failed to fetch KSE100 benchmark:', e)
    }

    // 3. Process Symbols in Batches
    // Optimized: Increased batch size since heavy calculation moved out of loop
    const BATCH_SIZE = 20
    let processedCount = 0
    let skippedCount = 0

    for (let i = 0; i < allSymbols.length; i += BATCH_SIZE) {
      // TIME CHECK: Stop if we are running out of time
      const elapsedTime = Date.now() - startTime
      if (elapsedTime > TIME_LIMIT_MS) {

        break
      }

      const batchSymbols = allSymbols.slice(i, i + BATCH_SIZE)

      const batchStart = Date.now()

      try {
        // A. Batch Fetch Basic Data (Price, Profile, Financials)
        console.time(`Batch ${i} Basic Data`)
        const batchDataPromise = fetchScreenerBatchData(batchSymbols, 'pk-equity', baseUrl)
          .then(res => { console.timeEnd(`Batch ${i} Basic Data`); return res; })

        // B. Batch Fetch Historical Price (3 Years) -> DIRECT DB QUERY
        console.time(`Batch ${i} History`)
        const historyPromise = getHistoricalDataBatch('pk-equity', batchSymbols, startDate, endDate)
          .then(res => { console.timeEnd(`Batch ${i} History`); return res; })

        // C. Batch Fetch Dividend History -> DIRECT DB QUERY
        console.time(`Batch ${i} Dividends`)
        const dividendPromise = getDividendDataBatch('pk-equity', batchSymbols)
          .then(res => { console.timeEnd(`Batch ${i} Dividends`); return res; })

        // Execute all fetches in parallel
        const [batchBasicData, batchHistory, batchDividends] = await Promise.all([
          batchDataPromise,
          historyPromise,
          dividendPromise
        ])


        // Process each symbol in memory (CPU bound, fast)
        const batchUpsertData: any[] = []

        batchSymbols.forEach((symbol) => {
          try {
            const data = batchBasicData[symbol]
            // Skip if critical price data missing
            if (!data || !data.price) return

            const { price, profile, financials } = data
            const historicalData = batchHistory[symbol] || []
            let dividends = (batchDividends[symbol] || []).map(d => ({ ...d, dividend_amount: d.dividend_amount || 0 }))

            // Calculate Dividend Metrics
            let dividendYield = 0
            let dividendPayoutRatio = null

            if (dividends.length > 0) {
              dividends.sort((a, b) => b.date.localeCompare(a.date))
              const oneYearAgoDate = new Date()
              oneYearAgoDate.setFullYear(oneYearAgoDate.getFullYear() - 1)
              const oneYearAgoStr = oneYearAgoDate.toISOString().split('T')[0]
              const lastYearDividends = dividends.filter(d => d.date >= oneYearAgoStr)
              const totalDividend = lastYearDividends.reduce((sum, d) => sum + d.dividend_amount, 0)
              if (price.price > 0) {
                dividendYield = (totalDividend / price.price) * 100
              }
            }

            // Calculate Financial Metrics (TTM EPS)
            let ttmEps = 0
            let peRatio = null
            if (financials && financials.length > 0) {
              const last4 = financials.slice(0, 4)
              ttmEps = last4.reduce((sum, row) => sum + (row.eps_diluted || row.eps_basic || 0), 0)
              if (ttmEps !== 0) {
                peRatio = price.price / ttmEps
              }
              if (ttmEps > 0 && dividendYield > 0 && price.price > 0) {
                const ttmDividend = (dividendYield / 100) * price.price
                dividendPayoutRatio = (ttmDividend / ttmEps) * 100
              }
            }

            // Calculate Technical Metrics (3-Year)
            let beta3y = null
            let sharpe3y = null
            let sortino3y = null
            let maxDrawdown3y = null
            let ytdReturn = null

            if (historicalData.length > 0) {
              const histPoints: PriceDataPoint[] = historicalData.map(h => ({ date: h.date, close: h.close }))
              const metricsFull = calculateAllMetrics(
                price.price,
                histPoints,
                'pk-equity',
                benchmarkData,
                { us: 2.5, pk: 15.0 },
                undefined,
                histPoints
              )
              beta3y = metricsFull.beta3Year || null
              sharpe3y = metricsFull.sharpeRatio3Year || null
              sortino3y = metricsFull.sortinoRatio3Year || null
              maxDrawdown3y = metricsFull.maxDrawdown3Year || null
              ytdReturn = metricsFull.ytdReturn || null
            }

            batchUpsertData.push({
              symbol,
              sector: profile?.sector || 'Unknown',
              industry: profile?.industry || 'Unknown',
              price: price.price,
              price_date: price.date,
              peRatio,
              dividendYield,
              dividendPayoutRatio,
              beta3y,
              sharpe3y,
              sortino3y,
              maxDrawdown3y,
              ytdReturn,
              marketCap: profile?.market_cap
            })

            processedCount++
          } catch (err) {
            console.error(`Error calculating metrics for ${symbol}`, err)
            skippedCount++
          }
        })

        // BATCH UPSERT: One query instead of N
        if (batchUpsertData.length > 0) {
          const values = batchUpsertData.flatMap(d => [
            'pk-equity', d.symbol, d.sector, d.industry, d.price, d.price_date,
            d.peRatio, d.dividendYield, d.dividendPayoutRatio,
            d.beta3y, d.sharpe3y, d.sortino3y, d.maxDrawdown3y, d.ytdReturn,
            d.marketCap
          ]);

          const placeholders = batchUpsertData.map((_, idx) => {
            const offset = idx * 15;
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, NOW())`;
          }).join(',');

          await client.query(`
            INSERT INTO screener_metrics 
            (
              asset_type, symbol, sector, industry, price, price_date, 
              pe_ratio, dividend_yield, dividend_payout_ratio,
              beta_3y, sharpe_3y, sortino_3y, max_drawdown_3y, ytd_return,
              market_cap, updated_at
            )
            VALUES ${placeholders}
            ON CONFLICT (asset_type, symbol)
            DO UPDATE SET
              price = EXCLUDED.price,
              price_date = EXCLUDED.price_date,
              pe_ratio = EXCLUDED.pe_ratio,
              dividend_yield = EXCLUDED.dividend_yield,
              dividend_payout_ratio = EXCLUDED.dividend_payout_ratio,
              beta_3y = EXCLUDED.beta_3y,
              sharpe_3y = EXCLUDED.sharpe_3y,
              sortino_3y = EXCLUDED.sortino_3y,
              max_drawdown_3y = EXCLUDED.max_drawdown_3y,
              ytd_return = EXCLUDED.ytd_return,
              market_cap = EXCLUDED.market_cap,
              updated_at = NOW()
          `, values);
        }
      } catch (err) {
        console.error(`Batch failed`, err)
      }
    }

    // --- NEW: Calculate Sector PE (Atomic SQL Method) ---
    // This replaces Node.js loops with a single DB-native aggregation.
    // Efficiently handles negative earnings by aggregating totals before division.
    try {
      await client.query(`
        WITH sector_stats AS (
          SELECT 
            sector,
            SUM(market_cap) as total_mcap,
            SUM(CASE WHEN pe_ratio != 0 THEN market_cap / pe_ratio ELSE 0 END) as total_earnings
          FROM screener_metrics
          WHERE asset_type = 'pk-equity' AND sector IS NOT NULL AND market_cap > 0
          GROUP BY sector
        )
        UPDATE screener_metrics m
        SET 
          sector_pe = s.total_mcap / NULLIF(s.total_earnings, 0),
          relative_pe = CASE 
            WHEN s.total_earnings != 0 AND m.pe_ratio IS NOT NULL 
            THEN m.pe_ratio / (s.total_mcap / s.total_earnings)
            ELSE NULL 
          END,
          updated_at = NOW()
        FROM sector_stats s
        WHERE m.sector = s.sector AND m.asset_type = 'pk-equity'
      `)
      console.log(`[Screener Update] Optimized: Updated all Sector PE and Relative PE values via single SQL query.`)
    } catch (sectorErr) {
      console.error('[Screener Update] Sector PE aggregation failed:', sectorErr)
    }

    const duration = Date.now() - startTime


    return NextResponse.json({
      success: true,
      processed: processedCount,
      skipped: skippedCount,
      duration_ms: duration,
      partial_update: processedCount < allSymbols.length
    })

  } catch (error: any) {
    console.error('[Screener Update] Critical Failure:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  } finally {
    client.release()
  }
}
