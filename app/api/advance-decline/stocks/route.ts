import { NextRequest, NextResponse } from 'next/server'
import { getDbClient } from '@/lib/portfolio/db-client'

export const revalidate = 3600 // Cache for 1 hour

/**
 * GET /api/advance-decline/stocks?sector=Banking&limit=100
 * 
 * Returns the list of stocks used in the Advance-Decline calculation
 * based on the provided filters (sector and top N by market cap)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const sector = searchParams.get('sector')
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    const client = await getDbClient()

    try {
      // Get top N stocks by market cap, optionally filtered by sector
      let stocksQuery = `
        SELECT 
          symbol,
          name,
          market_cap,
          sector,
          industry
        FROM company_profiles
        WHERE asset_type = 'pk-equity'
          AND market_cap IS NOT NULL
          AND market_cap > 0
      `
      const queryParams: any[] = []
      let paramIndex = 1
      
      // Add sector filter if provided
      if (sector && sector !== 'all') {
        stocksQuery += ` AND sector = $${paramIndex}`
        queryParams.push(sector)
        paramIndex++
      }
      
      stocksQuery += `
        ORDER BY market_cap DESC
        LIMIT $${paramIndex}
      `
      queryParams.push(limit)
      
      const result = await client.query(stocksQuery, queryParams)
      
      const stocks = result.rows.map(row => ({
        symbol: row.symbol,
        name: row.name || row.symbol,
        marketCap: parseFloat(row.market_cap) || 0,
        sector: row.sector || 'Unknown',
        industry: row.industry || 'Unknown',
      }))

      return NextResponse.json({
        success: true,
        stocks,
        count: stocks.length,
        sector: sector || 'all',
        limit,
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      })
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error('[Advance-Decline Stocks API] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch stocks',
      details: error.message,
    }, { status: 500 })
  }
}

