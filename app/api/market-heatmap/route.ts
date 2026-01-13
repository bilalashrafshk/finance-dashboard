import { NextRequest, NextResponse } from 'next/server'
import { getDbClient } from '@/lib/portfolio/db-client'

import { getTodayInMarketTimezone } from '@/lib/portfolio/market-hours'

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

    if (!date) {
      return NextResponse.json(
        { error: 'Date parameter is required (YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    const client = await getDbClient()

    try {
      // Get top N stocks by market cap from company_profiles
      // Join with historical_price_data to get prices for the selected date and previous day
      // Uses centralized database client for connection pooling
      const query = `
        WITH top_stocks AS (
          SELECT 
            cp.symbol,
            cp.name,
            cp.market_cap,
            cp.sector,
            cp.industry
          FROM company_profiles cp
          WHERE cp.asset_type = 'pk-equity'
            AND cp.market_cap IS NOT NULL
            AND cp.market_cap > 0
          ORDER BY cp.market_cap DESC
          LIMIT $1
        ),
        selected_date_prices AS (
          SELECT 
            symbol,
            close as price
          FROM historical_price_data
          WHERE asset_type = 'pk-equity'
            AND date = $2
        ),
        previous_date_prices AS (
          SELECT DISTINCT ON (symbol)
            symbol,
            close as price
          FROM historical_price_data
          WHERE asset_type = 'pk-equity'
            AND date < $2
            AND symbol IN (SELECT symbol FROM top_stocks)
          ORDER BY symbol, date DESC
        )
        SELECT 
          ts.symbol,
          COALESCE(ts.name, ts.symbol) as name,
          ts.market_cap,
          ts.sector,
          ts.industry,
          sdp.price,
          pdp.price as previous_price
        FROM top_stocks ts
        LEFT JOIN selected_date_prices sdp ON ts.symbol = sdp.symbol
        LEFT JOIN previous_date_prices pdp ON ts.symbol = pdp.symbol
        WHERE sdp.price IS NOT NULL
        ORDER BY ts.market_cap DESC
      `

      const result = await client.query(query, [limit, date])

      // Get list of all top stocks to identify missing ones
      const topStocksCheckQuery = `
        SELECT symbol, name, market_cap
        FROM company_profiles
        WHERE asset_type = 'pk-equity'
          AND market_cap IS NOT NULL
          AND market_cap > 0
        ORDER BY market_cap DESC
        LIMIT $1
      `
      const topStocksCheck = await client.query(topStocksCheckQuery, [limit])
      const allTopStocks = topStocksCheck.rows.map((r: any) => r.symbol)
      const stocksWithData = result.rows.map((r: any) => r.symbol)
      const missingStocks = allTopStocks.filter((s: string) => !stocksWithData.includes(s))

      const stocks: MarketHeatmapStock[] = result.rows.map(row => {
        const price = parseFloat(row.price)
        const previousPrice = row.previous_price ? parseFloat(row.previous_price) : null
        const changePercent = previousPrice && previousPrice > 0
          ? ((price - previousPrice) / previousPrice) * 100
          : null

        return {
          symbol: row.symbol,
          name: row.name || row.symbol,
          marketCap: parseFloat(row.market_cap) || 0,
          price,
          previousPrice,
          changePercent,
          sector: row.sector,
          industry: row.industry,
        }
      })

      const response = NextResponse.json({
        success: true,
        date,
        stocks,
        count: stocks.length,
        missingStocks, // Include list of missing stocks
        totalRequested: limit,
      })

      // Dynamic Cache Control
      const isHistoricalParams = date < getTodayInMarketTimezone('PSX') // Simple string comparison for YYYY-MM-DD works

      let cacheControl = 'public, max-age=300, stale-while-revalidate=600' // Default: 5 min cache

      if (stocks.length === 0) {
        // No data found - Do NOT cache this failure for long!
        // This allows immediate retry once data is populated.
        cacheControl = 'no-store, max-age=0'
      } else if (missingStocks.length > 0) {
        // Partial data - Cache briefly (1 min) to allow filling gaps
        cacheControl = 'public, max-age=60, stale-while-revalidate=60'
      } else if (isHistoricalParams) {
        // Historical data: Only cache forever if we have COMPLETE data.
        if (missingStocks.length === 0) {
          cacheControl = 'public, max-age=31536000, immutable' // 1 Year (Locked)
        } else {
          cacheControl = 'public, max-age=3600, stale-while-revalidate=7200' // 1 Hour (Retry later)
        }
      } else {
        // Today's data
        const { isMarketClosed, getTodayInMarketTimezone } = await import('@/lib/portfolio/market-hours')
        const marketClosed = isMarketClosed('PSX')

        if (marketClosed) {
          // Market is closed - Data is final for the day, cache for longer (1 hour)
          // to prevent needless re-calculation
          cacheControl = 'public, max-age=3600, stale-while-revalidate=7200'
        }
      }

      response.headers.set('Cache-Control', cacheControl)

      return response
    } finally {
      client.release()
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch market heatmap data',
        details: error.message,
      },
      { status: 500 }
    )
  }
}

