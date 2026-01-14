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

    // --- NEW: Calculate Sector PE (Aggregate Method) ---
    // Moved outside the main loop to run only once per job, significantly improving performance.
    // Formula: Sum(Market Cap) / Sum(Net Income)
    // This handles negative PE stocks correctly by Aggregating Earnings.
    try {
      // 1. Fetch all metrics for the updated sectors to ensure we have a full picture
      const metricsRes = await client.query(`
          SELECT symbol, sector, market_cap, pe_ratio 
          FROM screener_metrics 
          WHERE asset_type = 'pk-equity' 
            AND sector IS NOT NULL 
            AND market_cap > 0
        `)

      const sectorGroups: Record<string, { totalMCap: number, totalEarnings: number }> = {}

      // 2. Aggregate Data
      metricsRes.rows.forEach(row => {
        const mcap = parseFloat(row.market_cap) || 0
        const pe = parseFloat(row.pe_ratio) || 0
        const sector = row.sector

        if (!sectorGroups[sector]) {
          sectorGroups[sector] = { totalMCap: 0, totalEarnings: 0 }
        }

        sectorGroups[sector].totalMCap += mcap

        if (pe !== 0) {
          const earnings = mcap / pe
          sectorGroups[sector].totalEarnings += earnings
        }
      })

      // 3. Update Database with Sector PE
      const sectorUpdates = Object.entries(sectorGroups).map(async ([sector, data]) => {
        let sectorPE = 0
        if (data.totalEarnings !== 0) {
          sectorPE = data.totalMCap / data.totalEarnings
        }

        await client.query(`
            UPDATE screener_metrics
            SET 
              sector_pe = $1,
              relative_pe = CASE 
                WHEN $1::numeric != 0 AND pe_ratio IS NOT NULL THEN pe_ratio / $1::numeric
                ELSE NULL 
              END,
              updated_at = NOW()
            WHERE sector = $2 AND asset_type = 'pk-equity'
          `, [sectorPE, sector])
      })

      await Promise.all(sectorUpdates)
      console.log(`[Screener Update] Optimized: Updated Sector PE for ${sectorUpdates.length} sectors once.`)
    } catch (sectorErr) {
      console.error('[Screener Update] Sector PE aggregation failed:', sectorErr)
    }

    // 4. Update Macros (THROTTLED & PRIORITIZED)
    //    Use existing DB connection to find stale keys, then update top 5.
    if (Date.now() - startTime < TIME_LIMIT_MS) {
      try {
        const { ensureSBPEconomicData, MACRO_KEYS } = await import('@/lib/portfolio/sbp-service')

        // Fetch metadata for all keys to determine staleness
        // We use the existing 'client' from the pool
        const metaRes = await client.query(
          `SELECT series_key, last_updated FROM sbp_economic_metadata WHERE series_key = ANY($1)`,
          [MACRO_KEYS]
        )

        const lastUpdatedMap = new Map<string, number>()
        metaRes.rows.forEach((row: any) => {
          // updated_at is likely a Date object from pg, but handle string case safely
          const dateVal = row.last_updated instanceof Date ? row.last_updated : new Date(row.last_updated)
          lastUpdatedMap.set(row.series_key, dateVal.getTime())
        })

        // Sort keys by staleness (oldest/missing first)
        const sortedKeys = [...MACRO_KEYS].sort((a, b) => {
          const timeA = lastUpdatedMap.get(a) || 0 // 0 if missing (highest priority)
          const timeB = lastUpdatedMap.get(b) || 0
          return timeA - timeB
        })

        // Pick top 1 stale key to update (reduced from 3 to prevent timeout)
        const keysToUpdate = sortedKeys.slice(0, 1)

        if (keysToUpdate.length > 0) {
          console.log(`[Screener Update] Prioritized Macro Update: Updating ${keysToUpdate.length} keys: ${keysToUpdate.join(', ')}`)

          await Promise.all(keysToUpdate.map(async (key) => {
            try {
              // ensureSBPEconomicData checks cache internally too, effectively double-checking but harmless
              await ensureSBPEconomicData(key)
            } catch (e) {
              console.error(`[Screener Update] Failed to update macro ${key}`, e)
            }
          }))
        }
      } catch (e) {
        console.error('[Screener Update] Macro update block failed', e)
      }
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
