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

    // Determine base URL
    const baseUrl = url.origin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    let processedCount = 0
    let skippedCount = 0

    // ============================================================
    // PASS 1 (cheap, every run): price / PE / dividend yield / market cap.
    // No 3-year history fetch involved, so this is safe to run at the
    // original cadence (cycles all symbols roughly every ~3 hours).
    // ============================================================
    const cheapQuery = `
      WITH symbols AS (
        SELECT DISTINCT symbol FROM historical_price_data WHERE asset_type = 'pk-equity'
      )
      SELECT sy.symbol
      FROM symbols sy
      LEFT JOIN screener_metrics s ON sy.symbol = s.symbol AND s.asset_type = 'pk-equity'
      ORDER BY s.updated_at ASC NULLS FIRST, sy.symbol ASC
      LIMIT $1
    `
    const { rows: cheapRows } = await client.query(cheapQuery, [limit])
    const cheapSymbols = cheapRows.map(p => p.symbol)

    const CHEAP_BATCH_SIZE = 20
    for (let i = 0; i < cheapSymbols.length; i += CHEAP_BATCH_SIZE) {
      const elapsedTime = Date.now() - startTime
      if (elapsedTime > TIME_LIMIT_MS) break

      const batchSymbols = cheapSymbols.slice(i, i + CHEAP_BATCH_SIZE)

      try {
        console.time(`Cheap Batch ${i} Basic Data`)
        const batchDataPromise = fetchScreenerBatchData(batchSymbols, 'pk-equity', baseUrl)
          .then(res => { console.timeEnd(`Cheap Batch ${i} Basic Data`); return res; })

        console.time(`Cheap Batch ${i} Dividends`)
        const dividendPromise = getDividendDataBatch('pk-equity', batchSymbols)
          .then(res => { console.timeEnd(`Cheap Batch ${i} Dividends`); return res; })

        const [batchBasicData, batchDividends] = await Promise.all([
          batchDataPromise,
          dividendPromise
        ])

        const batchUpsertData: any[] = []

        batchSymbols.forEach((symbol) => {
          try {
            const data = batchBasicData[symbol]
            // Skip if critical price data missing
            if (!data || !data.price) return

            const { price, profile, financials } = data
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
              const validFinancials = financials.filter(row => (row.eps_diluted !== null && row.eps_diluted !== undefined) || (row.eps_basic !== null && row.eps_basic !== undefined))
              const last4 = (validFinancials.length > 0 ? validFinancials : financials).slice(0, 4)
              ttmEps = last4.reduce((sum, row) => sum + (row.eps_diluted || row.eps_basic || 0), 0)
              if (ttmEps !== 0) {
                peRatio = price.price / ttmEps
              }
              if (ttmEps > 0 && dividendYield > 0 && price.price > 0) {
                const ttmDividend = (dividendYield / 100) * price.price
                dividendPayoutRatio = (ttmDividend / ttmEps) * 100
              }
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
              marketCap: profile?.market_cap
            })

            processedCount++
          } catch (err) {
            console.error(`Error calculating cheap metrics for ${symbol}`, err)
            skippedCount++
          }
        })

        // BATCH UPSERT: One query instead of N. Only touches cheap-tier columns -
        // beta_3y/sharpe_3y/etc are left untouched on conflict (not in SET clause).
        if (batchUpsertData.length > 0) {
          const values = batchUpsertData.flatMap(d => [
            'pk-equity', d.symbol, d.sector, d.industry, d.price, d.price_date,
            d.peRatio, d.dividendYield, d.dividendPayoutRatio, d.marketCap
          ]);

          const placeholders = batchUpsertData.map((_, idx) => {
            const offset = idx * 10;
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, NOW())`;
          }).join(',');

          await client.query(`
            INSERT INTO screener_metrics
            (
              asset_type, symbol, sector, industry, price, price_date,
              pe_ratio, dividend_yield, dividend_payout_ratio, market_cap, updated_at
            )
            VALUES ${placeholders}
            ON CONFLICT (asset_type, symbol)
            DO UPDATE SET
              sector = EXCLUDED.sector,
              industry = EXCLUDED.industry,
              price = EXCLUDED.price,
              price_date = EXCLUDED.price_date,
              pe_ratio = EXCLUDED.pe_ratio,
              dividend_yield = EXCLUDED.dividend_yield,
              dividend_payout_ratio = EXCLUDED.dividend_payout_ratio,
              market_cap = EXCLUDED.market_cap,
              updated_at = NOW()
          `, values);
        }
      } catch (err) {
        console.error(`Cheap batch failed`, err)
      }
    }

    // ============================================================
    // PASS 2 (expensive, gated to ~once/day per symbol): beta/sharpe/
    // sortino/max-drawdown/YTD. Requires the 3-year history refetch
    // (600+ rows/symbol), which barely moves within a day - this gate
    // is the dominant fix for DB egress (was cycling all symbols every
    // ~3 hours = ~8x/day).
    // ============================================================
    const expensiveQuery = `
      WITH symbols AS (
        SELECT DISTINCT symbol FROM historical_price_data WHERE asset_type = 'pk-equity'
      )
      SELECT sy.symbol
      FROM symbols sy
      LEFT JOIN screener_metrics s ON sy.symbol = s.symbol AND s.asset_type = 'pk-equity'
      WHERE s.metrics_updated_at IS NULL OR s.metrics_updated_at < NOW() - INTERVAL '20 hours'
      ORDER BY s.metrics_updated_at ASC NULLS FIRST, sy.symbol ASC
      LIMIT $1
    `
    const { rows: expensiveRows } = await client.query(expensiveQuery, [limit])
    const expensiveSymbols = expensiveRows.map(p => p.symbol)

    if (expensiveSymbols.length > 0) {
      // Fetch Benchmark Data (KSE100) for Beta Calculation (3 Years)
      const endDate = new Date().toISOString().split('T')[0]
      const threeYearsAgo = new Date()
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3)
      const startDate = threeYearsAgo.toISOString().split('T')[0]

      let benchmarkData: PriceDataPoint[] = []
      try {
        // Direct DB fetch for KSE100 is better
        const kseRes = await getHistoricalDataBatch('indices', ['KSE100'], startDate, endDate, ['close', 'adjusted_close'])
        if (kseRes['KSE100']) {
          benchmarkData = kseRes['KSE100'].map(d => ({ date: d.date, close: d.adjusted_close ?? d.close }))
        } else {
          // Fallback to API if not in DB yet
          const kseData = await fetchHistoricalData('indices', 'KSE100', startDate, endDate, baseUrl)
          if (kseData && kseData.data) {
            benchmarkData = kseData.data.map((d: any) => ({ date: d.date, close: d.adjusted_close ?? d.close }))
          }
        }
      } catch (e) {
        console.error('[Screener Update] Failed to fetch KSE100 benchmark:', e)
      }

      const BATCH_SIZE = 20
      for (let i = 0; i < expensiveSymbols.length; i += BATCH_SIZE) {
        // TIME CHECK: Stop if we are running out of time
        const elapsedTime = Date.now() - startTime
        if (elapsedTime > TIME_LIMIT_MS) break

        const batchSymbols = expensiveSymbols.slice(i, i + BATCH_SIZE)

        try {
          // A. Batch Fetch Basic Data (Price) - needed as the calc's current-price input
          console.time(`Batch ${i} Basic Data`)
          const batchDataPromise = fetchScreenerBatchData(batchSymbols, 'pk-equity', baseUrl)
            .then(res => { console.timeEnd(`Batch ${i} Basic Data`); return res; })

          // B. Batch Fetch Historical Price (3 Years) -> DIRECT DB QUERY
          console.time(`Batch ${i} History`)
          const historyPromise = getHistoricalDataBatch('pk-equity', batchSymbols, startDate, endDate, ['close', 'adjusted_close'])
            .then(res => { console.timeEnd(`Batch ${i} History`); return res; })

          // Execute all fetches in parallel
          const [batchBasicData, batchHistory] = await Promise.all([
            batchDataPromise,
            historyPromise
          ])

          // Process each symbol in memory (CPU bound, fast)
          const batchUpsertData: any[] = []

          batchSymbols.forEach((symbol) => {
            try {
              const data = batchBasicData[symbol]
              // Skip if critical price data missing
              if (!data || !data.price) return

              const { price } = data
              const historicalData = batchHistory[symbol] || []

              // Calculate Technical Metrics (3-Year)
              let beta3y = null
              let sharpe3y = null
              let sortino3y = null
              let maxDrawdown3y = null
              let ytdReturn = null

              if (historicalData.length > 0) {
                // Create price points for calculations, using adjusted_close to handle stock splits
                const histPoints: PriceDataPoint[] = historicalData.map(h => ({ date: h.date, close: h.adjusted_close ?? h.close }))

                // Sort by date ascending for calculations
                histPoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
                beta3y,
                sharpe3y,
                sortino3y,
                maxDrawdown3y,
                ytdReturn
              })

              processedCount++
            } catch (err) {
              console.error(`Error calculating metrics for ${symbol}`, err)
              skippedCount++
            }
          })

          // BATCH UPSERT: One query instead of N. Only touches expensive-tier columns -
          // price/pe_ratio/dividend_yield/updated_at are left untouched on conflict.
          if (batchUpsertData.length > 0) {
            const values = batchUpsertData.flatMap(d => [
              'pk-equity', d.symbol,
              d.beta3y, d.sharpe3y, d.sortino3y, d.maxDrawdown3y, d.ytdReturn
            ]);

            const placeholders = batchUpsertData.map((_, idx) => {
              const offset = idx * 7;
              return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, NOW())`;
            }).join(',');

            await client.query(`
              INSERT INTO screener_metrics
              (
                asset_type, symbol,
                beta_3y, sharpe_3y, sortino_3y, max_drawdown_3y, ytd_return,
                metrics_updated_at
              )
              VALUES ${placeholders}
              ON CONFLICT (asset_type, symbol)
              DO UPDATE SET
                beta_3y = EXCLUDED.beta_3y,
                sharpe_3y = EXCLUDED.sharpe_3y,
                sortino_3y = EXCLUDED.sortino_3y,
                max_drawdown_3y = EXCLUDED.max_drawdown_3y,
                ytd_return = EXCLUDED.ytd_return,
                metrics_updated_at = EXCLUDED.metrics_updated_at
            `, values);
          }
        } catch (err) {
          console.error(`Batch failed`, err)
        }
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

    // --- NEW: Calculate 5-Year Average Dividend Yield ---
    // Matches the asset page calculation: Average of (Yearly Dividend / Yearly Closing Price)
    try {
      await client.query(`
        WITH yearly_dividends AS (
          SELECT 
            asset_type,
            symbol,
            EXTRACT(YEAR FROM date) as year,
            SUM(dividend_amount) AS total_dividend
          FROM dividend_data
          WHERE date >= NOW() - INTERVAL '5 years'
          GROUP BY asset_type, symbol, EXTRACT(YEAR FROM date)
        ),
        yearly_prices AS (
          SELECT DISTINCT ON (asset_type, symbol, EXTRACT(YEAR FROM date))
            asset_type,
            symbol,
            EXTRACT(YEAR FROM date) as year,
            close as last_price
          FROM historical_price_data
          WHERE date >= NOW() - INTERVAL '5 years'
          ORDER BY asset_type, symbol, EXTRACT(YEAR FROM date), date DESC
        ),
        yearly_yields AS (
          SELECT
            d.asset_type,
            d.symbol,
            d.year,
            (d.total_dividend / NULLIF(p.last_price, 0)) * 100 as yield
          FROM yearly_dividends d
          JOIN yearly_prices p USING (asset_type, symbol, year)
        ),
        avg_yields AS (
          SELECT
            asset_type,
            symbol,
            AVG(yield) as avg_dividend_yield
          FROM yearly_yields
          GROUP BY asset_type, symbol
        )
        UPDATE screener_metrics m
        SET 
          avg_dividend_yield = a.avg_dividend_yield,
          updated_at = NOW()
        FROM avg_yields a
        WHERE m.asset_type = a.asset_type AND m.symbol = a.symbol AND m.asset_type = 'pk-equity'
      `)
      console.log(`[Screener Update] Optimized: Updated all 5-Year Average Dividend Yields via single SQL query.`)
    } catch (divErr) {
      console.error('[Screener Update] Average Dividend Yield aggregation failed:', divErr)
    }

    const duration = Date.now() - startTime


    return NextResponse.json({
      success: true,
      processed: processedCount,
      skipped: skippedCount,
      duration_ms: duration,
      cheap_symbols: cheapSymbols.length,
      expensive_symbols: expensiveSymbols.length,
      partial_update: processedCount < (cheapSymbols.length + expensiveSymbols.length)
    })

  } catch (error: any) {
    console.error('[Screener Update] Critical Failure:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  } finally {
    client.release()
  }
}
