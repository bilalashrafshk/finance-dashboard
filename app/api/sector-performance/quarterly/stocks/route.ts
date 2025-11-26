import { NextRequest, NextResponse } from 'next/server'
import { getDbClient } from '@/lib/portfolio/db-client'
import { getDividendData } from '@/lib/portfolio/db-client'
import { calculateDividendAdjustedPrices } from '@/lib/asset-screener/dividend-adjusted-prices'
import type { DividendRecord } from '@/lib/asset-screener/dividend-adjusted-prices'

export const revalidate = 3600 // Cache for 1 hour
export const dynamic = 'force-dynamic'

interface StockQuarterDetail {
  symbol: string
  name?: string
  marketCap: number
  weight: number // Market cap weight as percentage
  startPrice: number | null
  endPrice: number | null
  return: number | null // Percentage return
}

interface QuarterStockDetails {
  quarter: string
  startDate: string
  endDate: string
  stocks: StockQuarterDetail[]
  totalMarketCap: number
}

/**
 * Calculate quarter boundaries for a given year
 */
function getQuarterBoundaries(year: number): Array<{ quarter: string; startDate: string; endDate: string }> {
  return [
    { quarter: `${year}-Q1`, startDate: `${year}-01-01`, endDate: `${year}-03-31` },
    { quarter: `${year}-Q2`, startDate: `${year}-04-01`, endDate: `${year}-06-30` },
    { quarter: `${year}-Q3`, startDate: `${year}-07-01`, endDate: `${year}-09-30` },
    { quarter: `${year}-Q4`, startDate: `${year}-10-01`, endDate: `${year}-12-31` },
  ]
}

/**
 * GET /api/sector-performance/quarterly/stocks?sector=CEMENT&year=2025&includeDividends=false
 * 
 * Returns detailed stock information for each quarter in the sector
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const sector = searchParams.get('sector')
    const yearParam = searchParams.get('year')
    const includeDividendsParam = searchParams.get('includeDividends')
    const quarterParam = searchParams.get('quarter') // Optional: specific quarter

    if (!sector) {
      return NextResponse.json({
        success: false,
        error: 'Sector parameter is required',
      }, { status: 400 })
    }

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()
    const includeDividends = includeDividendsParam === 'true'

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json({
        success: false,
        error: 'Invalid year parameter',
      }, { status: 400 })
    }

    const client = await getDbClient()

    try {
      // Get all stocks in the sector
      const sectorStocksQuery = `
        SELECT symbol, market_cap, name
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
        name: row.name || row.symbol,
        marketCap: parseFloat(row.market_cap) || 0,
      }))

      if (sectorStocks.length === 0) {
        return NextResponse.json({
          success: false,
          error: `No stocks found in sector: ${sector}`,
        }, { status: 404 })
      }

      // Calculate total market cap for weight calculation
      const totalMarketCap = sectorStocks.reduce((sum, stock) => sum + stock.marketCap, 0)

      // Get quarter boundaries
      const quarters = getQuarterBoundaries(year)
      const quartersToProcess = quarterParam 
        ? quarters.filter(q => q.quarter === quarterParam)
        : quarters

      if (quartersToProcess.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'Invalid quarter parameter',
        }, { status: 400 })
      }

      const sectorSymbols = sectorStocks.map(s => s.symbol)
      const marketCapMap = new Map(sectorStocks.map(s => [s.symbol, s.marketCap]))
      const nameMap = new Map(sectorStocks.map(s => [s.symbol, s.name]))

      // Get all price data for all quarters at once
      const earliestStart = quartersToProcess[0].startDate
      const latestEnd = quartersToProcess[quartersToProcess.length - 1].endDate

      const priceQuery = `
        SELECT date, symbol, close as price
        FROM historical_price_data
        WHERE asset_type = 'pk-equity'
          AND symbol = ANY($1)
          AND date >= $2
          AND date <= $3
        ORDER BY date ASC, symbol ASC
      `
      const priceResult = await client.query(priceQuery, [sectorSymbols, earliestStart, latestEnd])

      // Group prices by symbol and date for efficient lookup
      const pricesBySymbol = new Map<string, Array<{ date: string; price: number }>>()
      for (const row of priceResult.rows) {
        const symbol = row.symbol
        if (!pricesBySymbol.has(symbol)) {
          pricesBySymbol.set(symbol, [])
        }
        pricesBySymbol.get(symbol)!.push({
          date: row.date,
          price: parseFloat(row.price) || 0,
        })
      }

      // Process each quarter
      const quarterDetails: QuarterStockDetails[] = []

      for (const quarter of quartersToProcess) {
        const { quarter: quarterName, startDate, endDate } = quarter

        // Get dividends if needed
        let dividendsMap = new Map<string, DividendRecord[]>()
        if (includeDividends) {
          const dividendPromises = sectorStocks.map(stock =>
            getDividendData('pk-equity', stock.symbol, startDate, endDate)
          )
          const allDividends = await Promise.all(dividendPromises)
          sectorStocks.forEach((stock, index) => {
            if (allDividends[index].length > 0) {
              dividendsMap.set(stock.symbol, allDividends[index])
            }
          })
        }

        // Calculate details for each stock
        const stockDetails: StockQuarterDetail[] = []

        for (const stock of sectorStocks) {
          const stockPrices = pricesBySymbol.get(stock.symbol) || []
          if (stockPrices.length === 0) {
            stockDetails.push({
              symbol: stock.symbol,
              name: nameMap.get(stock.symbol),
              marketCap: stock.marketCap,
              weight: totalMarketCap > 0 ? (stock.marketCap / totalMarketCap) * 100 : 0,
              startPrice: null,
              endPrice: null,
              return: null,
            })
            continue
          }

          // Sort prices by date
          const sortedPrices = [...stockPrices].sort((a, b) => a.date.localeCompare(b.date))

          // Find first price on or after quarter start
          const startPriceData = sortedPrices.find(p => p.date >= startDate)
          // Find last price on or before quarter end
          const endPriceData = sortedPrices.filter(p => p.date <= endDate).pop()

          let startPrice: number | null = startPriceData?.price || null
          let endPrice: number | null = endPriceData?.price || null
          let returnPct: number | null = null

          if (includeDividends && startPrice !== null && endPrice !== null) {
            const dividends = dividendsMap.get(stock.symbol) || []
            if (dividends.length > 0) {
              // Calculate dividend-adjusted prices
              const adjustedData = calculateDividendAdjustedPrices(
                sortedPrices.map(p => ({ date: p.date, close: p.price })),
                dividends.map(d => ({ date: d.date, dividend_amount: d.dividend_amount }))
              )

              if (adjustedData.length > 0) {
                const startAdjusted = adjustedData.find(d => d.date >= startDate)?.adjustedValue
                const endAdjusted = adjustedData.filter(d => d.date <= endDate).pop()?.adjustedValue

                if (startAdjusted && endAdjusted && startAdjusted > 0) {
                  startPrice = startAdjusted
                  endPrice = endAdjusted
                  returnPct = ((endAdjusted - startAdjusted) / startAdjusted) * 100
                }
              }
            } else {
              // No dividends, use simple price return
              if (startPrice > 0) {
                returnPct = ((endPrice - startPrice) / startPrice) * 100
              }
            }
          } else if (startPrice !== null && endPrice !== null && startPrice > 0) {
            // Simple price return without dividends
            returnPct = ((endPrice - startPrice) / startPrice) * 100
          }

          stockDetails.push({
            symbol: stock.symbol,
            name: nameMap.get(stock.symbol),
            marketCap: stock.marketCap,
            weight: totalMarketCap > 0 ? (stock.marketCap / totalMarketCap) * 100 : 0,
            startPrice,
            endPrice,
            return: returnPct,
          })
        }

        // Sort by market cap (descending)
        stockDetails.sort((a, b) => b.marketCap - a.marketCap)

        quarterDetails.push({
          quarter: quarterName,
          startDate,
          endDate,
          stocks: stockDetails,
          totalMarketCap,
        })
      }

      return NextResponse.json({
        success: true,
        sector,
        year,
        includeDividends,
        quarters: quarterDetails,
        count: quarterDetails.length,
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      })
    } finally {
      client.release()
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch stock details',
      details: error.message,
    }, { status: 500 })
  }
}

