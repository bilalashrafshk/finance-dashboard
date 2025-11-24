import { NextRequest, NextResponse } from 'next/server'
import { getDbClient } from '@/lib/portfolio/db-client'

export const revalidate = 3600 // Cache for 1 hour
export const dynamic = 'force-dynamic' // This route uses searchParams
export const maxDuration = 30 // Maximum execution time

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
    const sector = searchParams.get('sector') ? decodeURIComponent(searchParams.get('sector')!) : null
    const startDate = searchParams.get('startDate')
    let endDate = searchParams.get('endDate')
    const includeDividends = searchParams.get('includeDividends') === 'true'

    // Cap endDate to today if it's in the future
    const today = new Date().toISOString().split('T')[0]
    if (endDate && endDate > today) {
      endDate = today
    }

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
          error: `No stocks found in sector: ${sector}`,
          sector,
        }, { status: 404 })
      }

      // Pre-build arrays and maps for optimal performance
      const sectorSymbols = sectorStocks.map(s => s.symbol)
      const marketCapMap = new Map<string, number>(sectorStocks.map(s => [s.symbol, s.marketCap]))

      // Step 2: Get all price data for these stocks in the date range
      // Optimized query with proper indexing hints
      const actualEndDate = endDate || today
      const priceQuery = `
        SELECT 
          date::text as date,
          symbol,
          ${includeDividends ? 'COALESCE(adjusted_close, close)' : 'close'} as price
        FROM historical_price_data
        WHERE asset_type = 'pk-equity'
          AND symbol = ANY($1)
          AND date >= $2
          AND date <= $3
        ORDER BY date ASC, symbol ASC
      `

      const priceResult = await client.query(priceQuery, [sectorSymbols, startDate, actualEndDate])

      // Step 3: Calculate market-cap weighted index for each date
      // Optimized: Pre-allocate map and process in single pass
      const pricesByDate = new Map<string, Array<{ symbol: string; price: number }>>()
      
      // Pre-process rows for optimal performance
      for (const row of priceResult.rows) {
        const date = String(row.date).split('T')[0] // Normalize to YYYY-MM-DD
        const symbol = String(row.symbol)
        const price = parseFloat(row.price) || 0
        
        if (price > 0) {
          if (!pricesByDate.has(date)) {
            pricesByDate.set(date, [])
          }
          pricesByDate.get(date)!.push({ symbol, price })
        }
      }

      // Step 4: Calculate weighted index for each date (optimized single-pass)
      const indexData: SectorIndexDataPoint[] = []
      let baseIndexValue: number | null = null
      let firstDateWithData: string | null = null

      const sortedDates = Array.from(pricesByDate.keys()).sort()
      const weightedPricesByDate = new Map<string, { price: number; marketCap: number; stocksCount: number }>()
      
      // Single pass: Calculate weighted prices and find base date
      for (const date of sortedDates) {
        const datePrices = pricesByDate.get(date) || []
        
        // Optimized: Calculate weighted average in single loop
        let totalWeightedPrice = 0
        let totalMarketCap = 0
        let stocksWithData = 0

        for (const { symbol, price } of datePrices) {
          const marketCap = marketCapMap.get(symbol)
          if (marketCap && marketCap > 0 && price > 0) {
            totalWeightedPrice += price * marketCap
            totalMarketCap += marketCap
            stocksWithData++
          }
        }

        if (totalMarketCap > 0) {
          const weightedAveragePrice = totalWeightedPrice / totalMarketCap
          weightedPricesByDate.set(date, {
            price: weightedAveragePrice,
            marketCap: totalMarketCap,
            stocksCount: stocksWithData
          })
          
          // Set base index value on first date >= startDate
          if (baseIndexValue === null && date >= startDate) {
            baseIndexValue = weightedAveragePrice
            firstDateWithData = date
          }
        }
      }

      // Second pass: Calculate normalized index values (only if base found)
      if (baseIndexValue && baseIndexValue > 0 && firstDateWithData) {
        const baseValue = baseIndexValue
        const startDateStr = startDate
        
        // Pre-allocate array size for better performance
        indexData.length = 0
        
        for (const date of sortedDates) {
          if (date < startDateStr) continue
          
          const dateData = weightedPricesByDate.get(date)
          if (dateData?.price > 0) {
            indexData.push({
              date,
              index: (dateData.price / baseValue) * 100,
              totalMarketCap: dateData.marketCap,
              stocksCount: dateData.stocksCount,
            })
          }
        }
      }

      if (indexData.length === 0) {
        return NextResponse.json({
          success: false,
          error: `No price data found for ${sector} sector in the specified date range (${startDate} to ${endDate}). Found ${sectorStocks.length} stocks in sector but no historical price data.`,
          sector,
          startDate,
          endDate,
          stocksCount: sectorStocks.length,
        }, { status: 404 })
      }

      return NextResponse.json({
        success: true,
        data: indexData,
        count: indexData.length,
        sector,
        includeDividends,
        totalStocksInSector: sectorStocks.length,
        dateRange: {
          start: indexData[0].date,
          end: indexData[indexData.length - 1].date,
        },
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
          'CDN-Cache-Control': 'public, s-maxage=3600',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=3600',
        },
      })
    } finally {
      client.release()
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Failed to calculate sector index',
      details: error.message,
    }, { status: 500 })
  }
}

