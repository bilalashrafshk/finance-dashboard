import { NextRequest, NextResponse } from 'next/server'
import { getDbClient } from '@/lib/portfolio/db-client'

import { getTodayInMarketTimezone, isMarketClosed } from '@/lib/portfolio/market-hours'

// Dynamic route (relying on cache headers)

export interface MarketHeatmapStock {
  symbol: string
  name: string
  marketCap: number
  price: number
  previousPrice: number | null
  changePercent: number | null
  sector: string | null
  industry: string | null
}

/**
 * GET /api/market-heatmap?date=2024-01-15&limit=100
 * 
 * Returns top N PK equities by market cap with price data for the specified date
 * Includes previous day's price to calculate change percentage
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const limit = parseInt(searchParams.get('limit') || '100', 10)
    const timeframe = searchParams.get('timeframe') || '1D' // 1D, 1W, 1M, YTD

    if (!date) {
      return NextResponse.json({ error: 'Date parameter is required (YYYY-MM-DD)' }, { status: 400 })
    }

    // Validate simple YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }

    // Calculate Start Date based on timeframe
    const targetDateObj = new Date(date)
    let startDate = ''

    if (timeframe === '1D') {
      // For 1D, we want the *strictly previous* data point, handled by "< date" SQL logic usually
      // But to be consistent with our new logic, we calculate a "compare date"
      targetDateObj.setDate(targetDateObj.getDate() - 1)
      startDate = targetDateObj.toISOString().split('T')[0]
    } else if (timeframe === '1W') {
      targetDateObj.setDate(targetDateObj.getDate() - 7)
      startDate = targetDateObj.toISOString().split('T')[0]
    } else if (timeframe === '1M') {
      targetDateObj.setMonth(targetDateObj.getMonth() - 1)
      startDate = targetDateObj.toISOString().split('T')[0]
    } else if (timeframe === 'YTD') {
      startDate = `${targetDateObj.getFullYear()}-01-01`
    } else {
      // Fallback or custom
      startDate = timeframe // Assume timeframe IS the start date if not keyword
    }

    const client = await getDbClient()

    try {
      // 1. Fetch Heatmap Data (Stocks) using CTEs
      // We get Price on Target Date AND Price on/before Start Date
      const heatmapQuery = `
            WITH top_stocks AS (
                SELECT symbol, name, market_cap, sector, industry
                FROM company_profiles
                WHERE asset_type = 'pk-equity' AND market_cap > 0
                ORDER BY market_cap DESC
                LIMIT $1
            ),
            target_prices AS (
                SELECT symbol, close as price
                FROM historical_price_data
                WHERE asset_type = 'pk-equity' AND date = $2
            ),
            start_prices AS (
                SELECT DISTINCT ON (symbol) symbol, close as price
                FROM historical_price_data
                WHERE asset_type = 'pk-equity' AND date <= $3
                ORDER BY symbol, date DESC
            )
            SELECT 
                ts.symbol,
                COALESCE(ts.name, ts.symbol) as name,
                ts.market_cap,
                ts.sector,
                ts.industry,
                tp.price as current_price,
                sp.price as start_price
            FROM top_stocks ts
            LEFT JOIN target_prices tp ON ts.symbol = tp.symbol
            LEFT JOIN start_prices sp ON ts.symbol = sp.symbol
            WHERE tp.price IS NOT NULL -- Must have current data
            ORDER BY ts.market_cap DESC
        `

      // 2. Fetch Indices (KSE-100, KSE-30, etc.)
      // Simple fetch for now - just KSE-100 for the tape
      const indexQuery = `
            WITH current_idx AS (
                SELECT close as price, date FROM historical_price_data 
                WHERE symbol = 'KSE100' AND date = $1
            ),
            prev_idx AS (
                SELECT JSON_AGG(close ORDER BY date ASC) as history 
                FROM (
                    SELECT close, date FROM historical_price_data 
                    WHERE symbol = 'KSE100' AND date <= $1 
                    ORDER BY date DESC LIMIT 7
                ) sub
            )
            SELECT 
                c.price, 
                p.price as prev_close,
                (SELECT history FROM prev_idx) as history
            FROM current_idx c, (SELECT price FROM historical_price_data WHERE symbol = 'KSE100' AND date < $1 ORDER BY date DESC LIMIT 1) p
        `
      // Note: The index fetch is simplified. For production, we'd fetch multiple indices.

      const [heatmapRes, indexRes] = await Promise.all([
        client.query(heatmapQuery, [limit, date, startDate]),
        client.query(indexQuery, [date])
      ])

      // Process Stocks
      const stocks: MarketHeatmapStock[] = heatmapRes.rows.map((row: any) => {
        const price = parseFloat(row.current_price)
        const previousPrice = row.start_price ? parseFloat(row.start_price) : null
        const changePercent = previousPrice && previousPrice > 0
          ? ((price - previousPrice) / previousPrice) * 100
          : 0 // If 0 or null, change is 0

        return {
          symbol: row.symbol,
          name: row.name,
          marketCap: parseFloat(row.market_cap),
          price,
          previousPrice,
          changePercent,
          sector: row.sector || 'Others',
          industry: row.industry
        }
      })

      // Process Sectors (Market Cap Weighted)
      // Formula: (Sum(CurrentMktCap) - Sum(StartMktCap)) / Sum(StartMktCap)
      // Since we don't have historical MktCap stored, we approximate using Price Change * Shares
      // Shares ~ MktCap / Price.  So StartMktCap ~ Shares * StartPrice.
      const sectorMap = new Map<string, { currentMcapSum: number, startMcapSum: number, volumeSum: number }>()

      stocks.forEach(stock => {
        if (!stock.sector) return
        const shares = stock.marketCap / stock.price // Approximate shares
        const startMcap = stock.previousPrice ? shares * stock.previousPrice : stock.marketCap // Fallback equal if no history

        const entry = sectorMap.get(stock.sector) || { currentMcapSum: 0, startMcapSum: 0, volumeSum: 0 }
        entry.currentMcapSum += stock.marketCap
        entry.startMcapSum += startMcap
        // entry.volumeSum += ... (We need volume in query? User asked for it)
        sectorMap.set(stock.sector, entry)
      })

      const sectors = Array.from(sectorMap.entries()).map(([name, data]) => {
        const change = data.startMcapSum > 0
          ? ((data.currentMcapSum - data.startMcapSum) / data.startMcapSum) * 100
          : 0
        return {
          name,
          change,
          volume: 'N/A' // Need to fetch volume to support this fully
        }
      }).sort((a, b) => b.change - a.change) // Sort by performance

      // Process Indices
      const indices = indexRes.rows.length > 0 ? [{
        name: 'KSE-100', // Changed symbol to name
        price: parseFloat(indexRes.rows[0].price), // Return number
        change: parseFloat(indexRes.rows[0].price) - parseFloat(indexRes.rows[0].prev_close),
        changePercent: ((parseFloat(indexRes.rows[0].price) - parseFloat(indexRes.rows[0].prev_close)) / parseFloat(indexRes.rows[0].prev_close) * 100),
        history: indexRes.rows[0].history || []
      }] : []

      const response = NextResponse.json({
        success: true,
        date,
        timeframe,
        stocks,
        sectors,
        indices,
        count: stocks.length
      })

      // Dynamic Cache Control
      const isHistoricalParams = date < getTodayInMarketTimezone('PSX')
      let cacheControl = 'public, max-age=300, stale-while-revalidate=600' // Default: 5 min cache

      if (isHistoricalParams) {
        // Historical data check
        const now = new Date()
        const queryDate = new Date(date)
        const diffTime = Math.abs(now.getTime() - queryDate.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        if (diffDays <= 7) {
          // Recent history (last 7 days): Cache short-term to allow updates (e.g. error corrections)
          cacheControl = 'public, max-age=3600, stale-while-revalidate=86400'
        } else {
          // Deep history: Immutable (1 year)
          cacheControl = 'public, max-age=31536000, immutable'
        }
      } else {
        // Today's data
        if (isMarketClosed('PSX')) {
          cacheControl = 'public, max-age=3600, stale-while-revalidate=86400'
        }
      }

      response.headers.set('Cache-Control', cacheControl)
      return response

    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error('Heatmap API Error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch heatmap', details: error.message }, { status: 500 })
  }
}

