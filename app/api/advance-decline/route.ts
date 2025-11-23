import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

export interface AdvanceDeclineDataPoint {
  date: string
  advancing: number
  declining: number
  unchanged: number
  netAdvances: number
  adLine: number
}

/**
 * GET /api/advance-decline?startDate=2024-01-01&endDate=2024-12-31&limit=100
 * 
 * Calculates the Advance-Decline Line for top N PK stocks
 * 
 * Formula:
 * - Net Advances = Advancing Stocks - Declining Stocks
 * - AD Line = Previous AD Line + Net Advances
 * 
 * Returns time series data with advancing, declining, unchanged counts, net advances, and cumulative AD Line
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    const client = await pool.connect()

    try {
      // Step 1: Get top N stocks by market cap
      const topStocksQuery = `
        SELECT symbol
        FROM company_profiles
        WHERE asset_type = 'pk-equity'
          AND market_cap IS NOT NULL
          AND market_cap > 0
        ORDER BY market_cap DESC
        LIMIT $1
      `
      const topStocksResult = await client.query(topStocksQuery, [limit])
      const topStockSymbols = topStocksResult.rows.map(row => row.symbol)

      if (topStockSymbols.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No stocks found',
        }, { status: 404 })
      }

      // Step 2: Get all dates with price data for these stocks
      // We'll calculate the date range from the data if not provided
      let dateRangeQuery = `
        SELECT DISTINCT date
        FROM historical_price_data
        WHERE asset_type = 'pk-equity'
          AND symbol = ANY($1)
      `
      const dateRangeParams: any[] = [topStockSymbols]

      if (startDate) {
        dateRangeQuery += ` AND date >= $2`
        dateRangeParams.push(startDate)
      }
      if (endDate) {
        dateRangeQuery += ` AND date <= $${dateRangeParams.length + 1}`
        dateRangeParams.push(endDate)
      }

      dateRangeQuery += ` ORDER BY date ASC`

      const datesResult = await client.query(dateRangeQuery, dateRangeParams)
      const dates = datesResult.rows.map(row => row.date)

      if (dates.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No price data found for the specified date range',
        }, { status: 404 })
      }

      // Step 3: For each date, calculate advancing/declining stocks
      const adData: AdvanceDeclineDataPoint[] = []
      let previousAdLine = 0

      for (let i = 0; i < dates.length; i++) {
        const currentDate = dates[i]
        
        // Get prices for current date
        const currentPricesQuery = `
          SELECT symbol, close as price
          FROM historical_price_data
          WHERE asset_type = 'pk-equity'
            AND symbol = ANY($1)
            AND date = $2
        `
        const currentPricesResult = await client.query(currentPricesQuery, [topStockSymbols, currentDate])
        const currentPrices = new Map<string, number>()
        currentPricesResult.rows.forEach(row => {
          currentPrices.set(row.symbol, parseFloat(row.price))
        })

        // Skip if we don't have prices for this date
        if (currentPrices.size === 0) {
          continue
        }

        // Get previous day prices for stocks that have current day prices
        const symbolsWithCurrentPrice = Array.from(currentPrices.keys())
        const previousPricesQuery = `
          SELECT DISTINCT ON (symbol)
            symbol, close as price
          FROM historical_price_data
          WHERE asset_type = 'pk-equity'
            AND symbol = ANY($1)
            AND date < $2
            AND date IS NOT NULL
          ORDER BY symbol, date DESC
        `
        const previousPricesResult = await client.query(previousPricesQuery, [symbolsWithCurrentPrice, currentDate])
        const previousPrices = new Map<string, number>()
        previousPricesResult.rows.forEach(row => {
          previousPrices.set(row.symbol, parseFloat(row.price))
        })

        // Calculate advancing, declining, unchanged
        let advancing = 0
        let declining = 0
        let unchanged = 0

        currentPrices.forEach((currentPrice, symbol) => {
          const previousPrice = previousPrices.get(symbol)
          
          if (previousPrice !== undefined && previousPrice > 0) {
            if (currentPrice > previousPrice) {
              advancing++
            } else if (currentPrice < previousPrice) {
              declining++
            } else {
              unchanged++
            }
          }
        })

        // Calculate net advances
        const netAdvances = advancing - declining

        // Calculate AD Line (cumulative)
        const adLine = previousAdLine + netAdvances
        previousAdLine = adLine

        adData.push({
          date: currentDate,
          advancing,
          declining,
          unchanged,
          netAdvances,
          adLine,
        })
      }

      return NextResponse.json({
        success: true,
        data: adData,
        count: adData.length,
        stocksCount: topStockSymbols.length,
        dateRange: {
          start: dates[0],
          end: dates[dates.length - 1],
        },
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      })
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error('[Advance-Decline API] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to calculate Advance-Decline Line',
      details: error.message,
    }, { status: 500 })
  }
}

