import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

export const revalidate = 3600 // Cache for 1 hour

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL
  
  if (!connectionString) {
    throw new Error('DATABASE_URL or POSTGRES_URL environment variable is required')
  }
  
  return new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  })
}

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

    const pool = getPool()
    const client = await pool.connect()

    try {
      // Get top N stocks by market cap from company_profiles
      // Join with historical_price_data to get prices for the selected date and previous day
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
      })

      // Add cache headers
      response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
      
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

