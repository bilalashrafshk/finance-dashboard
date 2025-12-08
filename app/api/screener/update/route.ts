import { NextResponse } from 'next/server'
import { Pool } from 'pg'
import { fetchScreenerBatchData } from '@/lib/screener/batch-data-fetcher'
import { calculateAllMetrics, PriceDataPoint } from '@/lib/asset-screener/metrics-calculations'
import { fetchHistoricalData } from '@/lib/portfolio/unified-price-api'
import { getHistoricalDataBatch, getDividendDataBatch, insertDividendData, DividendRecord } from '@/lib/portfolio/db-client'

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
  const TIME_LIMIT_MS = 50000 // 50 seconds safety limit

  try {
    console.log('[Screener Update] Starting optimized update...')

    // Parse params
    const url = new URL(request.url)
    const limitParams = url.searchParams.get('limit')
    const limit = limitParams ? parseInt(limitParams) : 50 // Default 50 symbols per run

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

    console.log(`[Screener Update] Processing ${allSymbols.length} stale symbols...`)

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
    const BATCH_SIZE = 25
    let processedCount = 0
    let skippedCount = 0

    for (let i = 0; i < allSymbols.length; i += BATCH_SIZE) {
      // TIME CHECK: Stop if we are running out of time
      if (Date.now() - startTime > TIME_LIMIT_MS) {
        console.log(`[Screener Update] Time limit reached (${Date.now() - startTime}ms). Stopping early.`)
        break
      }

      const batchSymbols = allSymbols.slice(i, i + BATCH_SIZE)
      console.log(`[Screener Update] Batch ${i / BATCH_SIZE + 1}: ${batchSymbols.length} symbols`)

      try {
        // A. Batch Fetch Basic Data (Price, Profile, Financials) -> Already optimized to use Service direct calls
        //    NOTE: distinct 'fetchScreenerBatchData' implementation usually calls batch-price-service which uses DB or API
        const batchDataPromise = fetchScreenerBatchData(batchSymbols, 'pk-equity', baseUrl)

        // B. Batch Fetch Historical Price (3 Years) -> DIRECT DB QUERY
        const historyPromise = getHistoricalDataBatch('pk-equity', batchSymbols, startDate, endDate)

        // C. Batch Fetch Dividend History -> DIRECT DB QUERY
        const dividendPromise = getDividendDataBatch('pk-equity', batchSymbols)

        // Execute all fetches in parallel
        const [batchBasicData, batchHistory, batchDividends] = await Promise.all([
          batchDataPromise,
          historyPromise,
          dividendPromise
        ])

        // Process each symbol in memory (CPU bound, fast)
        const updatePromises = batchSymbols.map(async (symbol) => {
          try {
            const data = batchBasicData[symbol]
            // Skip if critical price data missing
            if (!data || !data.price) return

            const { price, profile, financials } = data
            const historicalData = batchHistory[symbol] || []
            let dividends = (batchDividends[symbol] || []).map(d => ({ ...d, dividend_amount: d.dividend_amount || 0 }))

            // Dividend Logic: If DB empty, try fetching api (fallback), but don't block heavily
            // For now, we rely on DB being populated by separate workers or lazy loading. 
            // If missing, we skip dividend calc or assume 0 until next run. 
            // (To keep it fast, we do NOT fetch from API here individually unless absolutely necessary)

            // Calculate Dividend Metrics
            let dividendYield = 0
            let dividendPayoutRatio = null

            if (dividends.length > 0) {
              // Sort descending
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

            // Calculate Financial Metrics
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
              // Convert to PriceDataPoint format
              const histPoints: PriceDataPoint[] = historicalData.map(h => ({ date: h.date, close: h.close }))

              // Run calculations
              const metricsFull = calculateAllMetrics(
                price.price,
                histPoints, // Full history (filtered by query)
                'pk-equity',
                benchmarkData,
                { us: 2.5, pk: 15.0 },
                undefined,
                histPoints // We passed 3y range
              )

              beta3y = metricsFull.beta3Year || null
              sharpe3y = metricsFull.sharpeRatio3Year || null
              sortino3y = metricsFull.sortinoRatio3Year || null
              maxDrawdown3y = metricsFull.maxDrawdown3Year || null
              ytdReturn = metricsFull.ytdReturn || null
            }

            // UPSERT Query
            await client.query(`
              INSERT INTO screener_metrics 
              (
                asset_type, symbol, sector, industry, price, price_date, 
                pe_ratio, dividend_yield, dividend_payout_ratio,
                beta_3y, sharpe_3y, sortino_3y, max_drawdown_3y, ytd_return,
                market_cap, updated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
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
            `, [
              'pk-equity',
              symbol,
              profile?.sector || 'Unknown',
              profile?.industry || 'Unknown',
              price.price,
              price.date,
              peRatio,
              dividendYield,
              dividendPayoutRatio,
              beta3y,
              sharpe3y,
              sortino3y,
              maxDrawdown3y,
              ytdReturn,
              profile?.market_cap
            ])

            processedCount++
          } catch (err) {
            console.error(`Error processing ${symbol}`, err)
            skippedCount++
          }
        })

        await Promise.all(updatePromises)

      } catch (err) {
        console.error(`Batch failed`, err)
      }
    }

    // 4. Update Macros (Only if we have time, or skipped if frequent updates)
    //    We can make this conditional or separate cron
    if (Date.now() - startTime < TIME_LIMIT_MS) {
      console.log('[Screener Update] Checking macro indicators...')
      try {
        const { ensureSBPEconomicData, MACRO_KEYS } = await import('@/lib/portfolio/sbp-service')
        // Only update one macro key per run to save time? Or check all if fast
        // For now, check all but handle errors
        await Promise.all(MACRO_KEYS.map(async (key) => {
          try { await ensureSBPEconomicData(key) } catch (e) { }
        }))
      } catch (e) { console.error('Macro update failed', e) }
    }

    const duration = Date.now() - startTime
    console.log(`[Screener Update] Finished in ${duration}ms. Processed: ${processedCount}.`)

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
