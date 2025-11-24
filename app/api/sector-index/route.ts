import { NextRequest, NextResponse } from 'next/server'
import { getDbClient } from '@/lib/portfolio/db-client'

export const revalidate = 3600 // Cache for 1 hour

export interface SectorIndexDataPoint {
  date: string
  index: number
  totalMarketCap: number
  stocksCount: number
}

/**
 * GET /api/sector-index?sector=Banking&startDate=2024-01-01&endDate=2024-12-31
 * 
 * Calculates a market-cap weighted index for ALL stocks in a sector
 * Index is normalized to start at 100 on the start date
 * 
 * Formula:
 * - For each date, calculate: Sum(Price * MarketCap) / Sum(MarketCap) for all stocks in sector
 * - Normalize to 100 on start date
 * 
 * Returns time series data with index values
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const sector = searchParams.get('sector')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!sector || sector === 'all') {
      return NextResponse.json({
        success: false,
        error: 'Sector parameter is required',
      }, { status: 400 })
    }

    if (!startDate) {
      return NextResponse.json({
        success: false,
        error: 'startDate parameter is required',
      }, { status: 400 })
    }

    const client = await getDbClient()

    try {
      // Step 1: Get ALL stocks in the sector (not just top N)
      const sectorStocksQuery = `
        SELECT symbol, market_cap
        FROM company_profiles
        WHERE asset_type = 'pk-equity'
          AND sector = $1
          AND market_cap IS NOT NULL
          AND market_cap > 0
        ORDER BY market_cap DESC
      `
      const sectorStocksResult = await client.query(sectorStocksQuery, [sector])
      const sectorStocks = sectorStocksResult.rows.map(row => ({
        symbol: row.symbol,
        marketCap: parseFloat(row.market_cap) || 0,
      }))

      if (sectorStocks.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No stocks found in this sector',
        }, { status: 404 })
      }

      const sectorSymbols = sectorStocks.map(s => s.symbol)
      const marketCapMap = new Map(sectorStocks.map(s => [s.symbol, s.marketCap]))

      // Step 2: Get all price data for these stocks in the date range
      let priceQuery = `
        WITH all_dates AS (
          SELECT DISTINCT date
          FROM historical_price_data
          WHERE asset_type = 'pk-equity'
            AND symbol = ANY($1)
      `
      
      const queryParams: any[] = [sectorSymbols]
      let paramIndex = 2
      
      if (startDate) {
        priceQuery += ` AND date >= $${paramIndex}`
        queryParams.push(startDate)
        paramIndex++
      }
      if (endDate) {
        priceQuery += ` AND date <= $${paramIndex}`
        queryParams.push(endDate)
        paramIndex++
      }
      
      priceQuery += `
          ORDER BY date ASC
        )
        SELECT 
          date,
          symbol,
          close as price
        FROM historical_price_data
        WHERE asset_type = 'pk-equity'
          AND symbol = ANY($1)
          AND date IN (SELECT date FROM all_dates)
        ORDER BY date ASC, symbol ASC
      `

      const priceResult = await client.query(priceQuery, queryParams)

      // Step 3: Calculate market-cap weighted index for each date
      // Group prices by date
      const pricesByDate = new Map<string, Array<{ symbol: string; price: number }>>()
      
      for (const row of priceResult.rows) {
        const date = row.date
        const symbol = row.symbol
        const price = parseFloat(row.price) || 0
        
        if (!pricesByDate.has(date)) {
          pricesByDate.set(date, [])
        }
        pricesByDate.get(date)!.push({ symbol, price })
      }

      // Step 4: Calculate weighted index for each date
      const indexData: SectorIndexDataPoint[] = []
      let baseIndexValue: number | null = null

      const sortedDates = Array.from(pricesByDate.keys()).sort()

      for (const date of sortedDates) {
        const datePrices = pricesByDate.get(date) || []
        
        // Calculate weighted average price using market cap as weights
        let totalWeightedPrice = 0
        let totalMarketCap = 0
        let stocksWithData = 0

        for (const { symbol, price } of datePrices) {
          const marketCap = marketCapMap.get(symbol) || 0
          if (marketCap > 0 && price > 0) {
            totalWeightedPrice += price * marketCap
            totalMarketCap += marketCap
            stocksWithData++
          }
        }

        if (totalMarketCap > 0) {
          const weightedAveragePrice = totalWeightedPrice / totalMarketCap
          
          // Set base index value on start date
          if (date === startDate && baseIndexValue === null) {
            baseIndexValue = weightedAveragePrice
          }

          // Calculate index normalized to 100 on start date
          if (baseIndexValue !== null && baseIndexValue > 0) {
            const indexValue = (weightedAveragePrice / baseIndexValue) * 100

            indexData.push({
              date,
              index: indexValue,
              totalMarketCap,
              stocksCount: stocksWithData,
            })
          }
        }
      }

      if (indexData.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'No price data found for the specified date range',
        }, { status: 404 })
      }

      return NextResponse.json({
        success: true,
        data: indexData,
        count: indexData.length,
        sector,
        totalStocksInSector: sectorStocks.length,
        dateRange: {
          start: indexData[0].date,
          end: indexData[indexData.length - 1].date,
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
    console.error('[Sector Index API] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to calculate sector index',
      details: error.message,
    }, { status: 500 })
  }
}

