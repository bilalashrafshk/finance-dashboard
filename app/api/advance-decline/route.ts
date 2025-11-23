import { NextRequest, NextResponse } from 'next/server'
import { getDbClient } from '@/lib/portfolio/db-client'

export const revalidate = 3600 // Cache for 1 hour

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

    const client = await getDbClient()

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

      // Step 2: Get all price data with previous day prices using a single optimized query
      // This uses LAG window function to get previous day's price in a single query
      // Build query with proper parameter placeholders
      let adQuery = `
        WITH top_stocks_data AS (
          SELECT 
            hpd.date,
            hpd.symbol,
            hpd.close as price,
            LAG(hpd.close) OVER (PARTITION BY hpd.symbol ORDER BY hpd.date) as previous_price
          FROM historical_price_data hpd
          WHERE hpd.asset_type = 'pk-equity'
            AND hpd.symbol = ANY($1)
      `
      
      const queryParams: any[] = [topStockSymbols]
      let paramIndex = 2
      
      if (startDate) {
        adQuery += ` AND hpd.date >= $${paramIndex}`
        queryParams.push(startDate)
        paramIndex++
      }
      if (endDate) {
        adQuery += ` AND hpd.date <= $${paramIndex}`
        queryParams.push(endDate)
        paramIndex++
      }
      
      adQuery += `
        ),
        daily_changes AS (
          SELECT 
            date,
            COUNT(*) FILTER (WHERE price > previous_price AND previous_price IS NOT NULL AND previous_price > 0) as advancing,
            COUNT(*) FILTER (WHERE price < previous_price AND previous_price IS NOT NULL AND previous_price > 0) as declining,
            COUNT(*) FILTER (WHERE price = previous_price AND previous_price IS NOT NULL AND previous_price > 0) as unchanged
          FROM top_stocks_data
          WHERE previous_price IS NOT NULL
          GROUP BY date
        ),
        daily_net_advances AS (
          SELECT 
            date,
            advancing,
            declining,
            unchanged,
            (advancing - declining) as net_advances
          FROM daily_changes
        )
        SELECT 
          date,
          advancing,
          declining,
          unchanged,
          net_advances,
          SUM(net_advances) OVER (ORDER BY date) as ad_line
        FROM daily_net_advances
        ORDER BY date ASC
      `

      const adResult = await client.query(adQuery, queryParams)
      
      if (adResult.rows.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No price data found for the specified date range',
        }, { status: 404 })
      }
      
      const adData: AdvanceDeclineDataPoint[] = adResult.rows.map(row => ({
        date: row.date,
        advancing: parseInt(row.advancing) || 0,
        declining: parseInt(row.declining) || 0,
        unchanged: parseInt(row.unchanged) || 0,
        netAdvances: parseInt(row.net_advances) || 0,
        adLine: parseInt(row.ad_line) || 0,
      }))

      return NextResponse.json({
        success: true,
        data: adData,
        count: adData.length,
        stocksCount: topStockSymbols.length,
        dateRange: {
          start: adData[0].date,
          end: adData[adData.length - 1].date,
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

