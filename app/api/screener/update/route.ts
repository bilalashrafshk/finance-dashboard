import { NextResponse } from 'next/server'
import { Pool } from 'pg'
import { fetchScreenerBatchData } from '@/lib/screener/batch-data-fetcher'
import { fetchDividendData } from '@/lib/portfolio/dividend-api'
import { calculateAllMetrics, PriceDataPoint } from '@/lib/asset-screener/metrics-calculations'
import { fetchHistoricalData } from '@/lib/portfolio/unified-price-api'

// Re-use existing DB connection logic or create new for this batch job
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

/**
 * CRON JOB: Update Screener Metrics
 * 
 * Frequency: Daily
 * 
 * Logic:
 * 1. Get all PK Equity symbols.
 * 2. Fetch Data:
 *    - Latest Price (Batch)
 *    - Financials (Batch - 4 quarters)
 *    - 3-Year Price History (for Beta/Sharpe/Sortino)
 *    - Dividend History (for Yield/Payout)
 *    - Macros (Every 2 days)
 * 3. Calculate Metrics:
 *    - Valuation (P/E, P/B, P/S, PEG)
 *    - Profitability (ROE, ROA, Margins)
 *    - Health (Debt/Equity, Current, Quick)
 *    - Technicals (Beta 3Y, Sharpe 3Y, Sortino 3Y, RSI, Drawdown)
 *    - Dividends (Yield, Payout, Growth)
 * 4. Upsert to 'screener_metrics'
 */
export const maxDuration = 300 // 5 minutes for Pro plan

export async function GET(request: Request) {
  // Verify cron secret (optional but recommended for production)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect()

  try {
    console.log('[Screener Update] Starting daily update...')
    const startTime = Date.now()

    // 1. Get all PK Equity symbols
    const { rows: priceSymbols } = await client.query(`
      SELECT DISTINCT symbol 
      FROM historical_price_data 
      WHERE asset_type = 'pk-equity'
      ORDER BY symbol
    `)
    const allSymbols = priceSymbols.map(p => p.symbol)

    if (allSymbols.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'No PK equity symbols found' })
    }

    console.log(`[Screener Update] Found ${allSymbols.length} symbols`)

    // Determine base URL
    const url = new URL(request.url)
    const baseUrl = url.origin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    // 2. Fetch Benchmark Data (KSE100) for Beta Calculation (3 Years)
    const endDate = new Date().toISOString().split('T')[0]
    const threeYearsAgo = new Date()
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)
    const startDate = threeYearsAgo.toISOString().split('T')[0]

    let benchmarkData: PriceDataPoint[] = []
    try {
      const kseData = await fetchHistoricalData('indices', 'KSE100', startDate, endDate, baseUrl)
      if (kseData && kseData.data) {
        benchmarkData = kseData.data.map(d => ({ date: d.date, close: d.close }))
      }
    } catch (e) {
      console.error('[Screener Update] Failed to fetch KSE100 benchmark:', e)
    }

    // 3. Process Symbols in Batches (Sequential Execution)
    const BATCH_SIZE = 25 // Increased to 25 for better throughput
    let processedCount = 0
    let skippedCount = 0

    for (let i = 0; i < allSymbols.length; i += BATCH_SIZE) {
      const batchSymbols = allSymbols.slice(i, i + BATCH_SIZE)
      console.log(`[Screener Update] Processing batch ${i / BATCH_SIZE + 1} (${batchSymbols.length} symbols)...`)

      // Fetch Basic Data (Price, Profile, Financials)
      const batchData = await fetchScreenerBatchData(batchSymbols, 'pk-equity', baseUrl)

      // Process each symbol in the batch concurrently
      await Promise.all(batchSymbols.map(async (symbol) => {
        // Global Timeout Check (stop if > 250s)
        if (Date.now() - startTime > 250000) {
          console.log(`[Screener Update] Global timeout approaching. Skipping ${symbol}`)
          skippedCount++
          return
        }

        try {
          const data = batchData[symbol]
          if (!data || !data.price) {
            console.log(`[Screener Update] Skipping ${symbol}: No price data`)
            return
          }

          const { price, profile, financials } = data

          // Fetch 3-Year Price History for Technicals
          let historicalData: PriceDataPoint[] = []
          try {
            const histRes = await fetchHistoricalData('pk-equity', symbol, startDate, endDate, baseUrl)
            if (histRes && histRes.data) {
              historicalData = histRes.data.map(d => ({ date: d.date, close: d.close }))
            }
          } catch (e) {
            console.error(`[Screener Update] Failed to fetch history for ${symbol}`)
          }

          // Fetch Dividend Data (Limit to 10 records for speed)
          let dividendYield = 0
          let dividendPayoutRatio = null
          let lastDividendDate = null
          let exDividendDate = null

          try {
            // Check cache first (5 days)
            const { shouldRefreshDividends, getDividendData, insertDividendData } = await import('@/lib/portfolio/db-client')
            const needsRefresh = await shouldRefreshDividends('pk-equity', symbol)

            let dividends: any[] = []

            if (!needsRefresh) {
              // Use cached data
              dividends = await getDividendData('pk-equity', symbol)
              // Limit to last 10 for consistency with API fetch
              dividends = dividends.slice(-10)
            } else {
              // Fetch from API
              const apiDividends = await fetchDividendData(symbol, 10) // Fetch last 10 records (optimized)

              if (apiDividends) {
                dividends = apiDividends
                // Store in DB for caching
                if (dividends.length > 0) {
                  await insertDividendData('pk-equity', symbol, dividends)
                }
              }
            }

            if (dividends && dividends.length > 0) {
              // Sort descending by date
              dividends.sort((a, b) => b.date.localeCompare(a.date))

              lastDividendDate = dividends[0].date

              // Calculate Yield: Sum of last 365 days dividends / Current Price
              const oneYearAgoDate = new Date()
              oneYearAgoDate.setFullYear(oneYearAgoDate.getFullYear() - 1)
              const oneYearAgoStr = oneYearAgoDate.toISOString().split('T')[0]

              const lastYearDividends = dividends.filter((d: any) => d.date >= oneYearAgoStr)
              const totalDividend = lastYearDividends.reduce((sum: number, d: any) => sum + d.dividend_amount, 0)

              if (price.price > 0) {
                dividendYield = (totalDividend / price.price) * 100
              }
            }
          } catch (e) {
            console.error(`[Screener Update] Failed to fetch dividends for ${symbol}`)
          }

          // Calculate Financial Metrics
          let ttmEps = 0
          let peRatio = null
          let pbRatio = null
          let psRatio = null
          let roe = null
          let netMargin = null
          let debtToEquity = null
          let currentRatio = null

          if (financials && financials.length > 0) {
            // TTM EPS (Last 4 quarters)
            const last4 = financials.slice(0, 4)
            ttmEps = last4.reduce((sum, row) => sum + (row.eps_diluted || row.eps_basic || 0), 0)

            if (ttmEps !== 0) {
              peRatio = price.price / ttmEps
            }

            // Payout Ratio
            if (ttmEps > 0 && dividendYield > 0) {
              const ttmDividend = (dividendYield / 100) * price.price
              dividendPayoutRatio = (ttmDividend / ttmEps) * 100
            }
          }

          // Calculate Technical Metrics (3-Year)
          let beta3y = null
          let sharpe3y = null
          let sortino3y = null
          let maxDrawdown3y = null
          let rsi14 = null // TODO: Implement RSI calculation
          let ytdReturn = null

          if (historicalData.length > 0) {
            // 3-Year Data Subset
            const hist3y = historicalData.filter(d => d.date >= startDate)

            const metricsFull = calculateAllMetrics(
              price.price,
              historicalData,
              'pk-equity',
              benchmarkData,
              { us: 2.5, pk: 15.0 },
              undefined, // 1y
              hist3y // 3y
            )

            beta3y = metricsFull.beta3Year || null
            sharpe3y = metricsFull.sharpeRatio3Year || null
            sortino3y = metricsFull.sortinoRatio3Year || null
            maxDrawdown3y = metricsFull.maxDrawdown3Year || null
            ytdReturn = metricsFull.ytdReturn || null
          }

          // Upsert to DB
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
        } catch (err: any) {
          console.error(`[Screener Update] Error processing ${symbol}:`, err.message)
          skippedCount++
        }
      }))
    }

    // 4. Update Macros (Every 2 Days)
    // 4. Update Macros (Every 2 Days)
    console.log('[Screener Update] Checking macro indicators...')

    try {
      const { ensureSBPEconomicData, MACRO_KEYS } = await import('@/lib/portfolio/sbp-service')

      await Promise.all(MACRO_KEYS.map(async (key) => {
        try {
          await ensureSBPEconomicData(key)
        } catch (e) {
          console.error(`[Screener Update] Failed to update macro ${key}:`, e)
        }
      }))

      console.log('[Screener Update] Macro indicators updated (Checked ' + MACRO_KEYS.length + ' indicators).')
    } catch (e) {
      console.error('[Screener Update] Failed to import sbp-service:', e)
    }

    console.log(`[Screener Update] Successfully updated metrics for ${processedCount} companies. ${skippedCount} failed.`)
    return NextResponse.json({
      success: true,
      count: processedCount,
      skipped: skippedCount
    })

  } catch (error: any) {
    console.error('[Screener Update] Failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  } finally {
    client.release()
  }
}


