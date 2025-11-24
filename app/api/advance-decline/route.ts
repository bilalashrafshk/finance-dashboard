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
 * GET /api/advance-decline?startDate=2024-01-01&endDate=2024-12-31&limit=100&sector=Technology
 * 
 * Calculates the Advance-Decline Line for top N PK stocks
 * 
 * Formula:
 * - Net Advances = Advancing Stocks - Declining Stocks
 * - AD Line = Previous AD Line + Net Advances
 * 
 * Query Parameters:
 * - startDate: Start date for the data range (optional)
 * - endDate: End date for the data range (optional)
 * - limit: Number of top stocks to include (default: 100)
 * - sector: Filter by sector name (optional, e.g., 'Technology', 'Banking')
 * 
 * Returns time series data with advancing, declining, unchanged counts, net advances, and cumulative AD Line
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const limit = parseInt(searchParams.get('limit') || '100', 10)
    const sector = searchParams.get('sector') // Optional sector filter

    const client = await getDbClient()

    try {
      // Step 1: Get top N stocks by market cap, optionally filtered by sector
      let topStocksQuery = `
        SELECT symbol
        FROM company_profiles
        WHERE asset_type = 'pk-equity'
          AND market_cap IS NOT NULL
          AND market_cap > 0
      `
      const queryParams: any[] = []
      let paramIndex = 1
      
      // Add sector filter if provided
      if (sector && sector !== 'all') {
        topStocksQuery += ` AND sector = $${paramIndex}`
        queryParams.push(sector)
        paramIndex++
      }
      
      topStocksQuery += `
        ORDER BY market_cap DESC
        LIMIT $${paramIndex}
      `
      queryParams.push(limit)
      
      const topStocksResult = await client.query(topStocksQuery, queryParams)
      const topStockSymbols = topStocksResult.rows.map(row => row.symbol)

      if (topStockSymbols.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No stocks found',
        }, { status: 404 })
      }

      // Step 2: Get all price data with previous day prices
      // IMPORTANT: Use same logic as heatmap - get most recent previous trading day (not just previous row)
      // This ensures consistency between heatmap and AD Line calculations
      // For each date, get the most recent previous trading day's close price (handles gaps correctly)
      let adQuery = `
        WITH all_dates AS (
          SELECT DISTINCT date
          FROM historical_price_data
          WHERE asset_type = 'pk-equity'
            AND symbol = ANY($1)
      `
      
      const adQueryParams: any[] = [topStockSymbols]
      let adParamIndex = 2
      
      if (startDate) {
        adQuery += ` AND date >= $${adParamIndex}`
        adQueryParams.push(startDate)
        adParamIndex++
      }
      if (endDate) {
        adQuery += ` AND date <= $${adParamIndex}`
        adQueryParams.push(endDate)
        adParamIndex++
      }
      
      adQuery += `
          ORDER BY date ASC
        ),
        current_prices AS (
          SELECT 
            hpd.date,
            hpd.symbol,
            hpd.close as price
          FROM historical_price_data hpd
          WHERE hpd.asset_type = 'pk-equity'
            AND hpd.symbol = ANY($1)
            AND hpd.date IN (SELECT date FROM all_dates)
        ),
        previous_prices AS (
          SELECT DISTINCT ON (cp.symbol, cp.date)
            cp.symbol,
            cp.date,
            hpd2.close as previous_price
          FROM current_prices cp
          LEFT JOIN LATERAL (
            SELECT close
            FROM historical_price_data
            WHERE asset_type = 'pk-equity'
              AND symbol = cp.symbol
              AND date < cp.date
              AND close IS NOT NULL
            ORDER BY date DESC
            LIMIT 1
          ) hpd2 ON true
        ),
        top_stocks_data AS (
          SELECT 
            cp.date,
            cp.symbol,
            cp.price,
            pp.previous_price
          FROM current_prices cp
          LEFT JOIN previous_prices pp ON cp.symbol = pp.symbol AND cp.date = pp.date
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
        ),
        ad_line_calculated AS (
          SELECT 
            date,
            advancing,
            declining,
            unchanged,
            net_advances,
            -- AD Line starts at 0, then adds net advances cumulatively
            COALESCE(SUM(net_advances) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 0) as ad_line
          FROM daily_net_advances
        )
        SELECT 
          date,
          advancing,
          declining,
          unchanged,
          net_advances,
          ad_line
        FROM ad_line_calculated
        WHERE 1=1
      `
      
      // Add filter to exclude the day before startDate from final results (we only needed it for LAG)
      if (startDate) {
        adQuery += ` AND date >= $${adParamIndex}`
        adQueryParams.push(startDate)
        adParamIndex++
      }
      
      adQuery += ` ORDER BY date ASC`

      const adResult = await client.query(adQuery, adQueryParams)
      
      if (adResult.rows.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No price data found for the specified date range',
        }, { status: 404 })
      }
      
      // Process data and ensure AD Line starts at 0
      // AD Line formula: AD Line = Previous AD Line + Net Advances
      // The first day we can calculate net advances should have AD Line = 0 + Net Advances
      // But to show it starting from 0, we'll add an initial point at 0 (one day before first data point)
      const adData: AdvanceDeclineDataPoint[] = []
      
      if (adResult.rows.length > 0) {
        // Add initial point at 0 (one day before first calculated day)
        const firstRow = adResult.rows[0]
        const firstDate = new Date(firstRow.date)
        firstDate.setDate(firstDate.getDate() - 1)
        const initialDate = firstDate.toISOString().split('T')[0]
        
        adData.push({
          date: initialDate,
          advancing: 0,
          declining: 0,
          unchanged: 0,
          netAdvances: 0,
          adLine: 0, // AD Line starts at 0
        })
        
        // Now calculate cumulative AD Line starting from 0
        let cumulativeAdLine = 0
        
        for (const row of adResult.rows) {
          const netAdvances = parseInt(row.net_advances) || 0
          // AD Line = Previous AD Line + Net Advances
          cumulativeAdLine = cumulativeAdLine + netAdvances
          
          adData.push({
            date: row.date,
            advancing: parseInt(row.advancing) || 0,
            declining: parseInt(row.declining) || 0,
            unchanged: parseInt(row.unchanged) || 0,
            netAdvances: netAdvances,
            adLine: cumulativeAdLine,
          })
        }
      }

      return NextResponse.json({
        success: true,
        data: adData,
        count: adData.length,
        stocksCount: topStockSymbols.length,
        sector: sector || null,
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

