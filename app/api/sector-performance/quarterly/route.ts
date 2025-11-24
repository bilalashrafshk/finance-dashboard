import { NextRequest, NextResponse } from 'next/server'
import { getDbClient } from '@/lib/portfolio/db-client'
import { getDividendData } from '@/lib/portfolio/db-client'
import { calculateDividendAdjustedPrices, normalizeToPercentage } from '@/lib/asset-screener/dividend-adjusted-prices'
import type { PriceDataPoint } from '@/lib/asset-screener/metrics-calculations'
import type { DividendRecord } from '@/lib/asset-screener/dividend-adjusted-prices'

export const revalidate = 3600 // Cache for 1 hour
export const dynamic = 'force-dynamic'

interface QuarterPerformance {
  quarter: string // e.g., "2024-Q1"
  startDate: string
  endDate: string
  sectorReturn: number // Percentage return
  kse100Return: number // Percentage return
  outperformance: number // Sector return - KSE100 return
  outperformed: boolean
}

interface SectorQuarterlyPerformance {
  sector: string
  quarters: QuarterPerformance[]
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
 * Get the first and last trading dates within a date range
 */
function getFirstLastTradingDates(
  priceData: PriceDataPoint[],
  startDate: string,
  endDate: string
): { firstDate: PriceDataPoint | null; lastDate: PriceDataPoint | null } {
  const filtered = priceData.filter(
    p => p.date >= startDate && p.date <= endDate
  ).sort((a, b) => a.date.localeCompare(b.date))

  return {
    firstDate: filtered.length > 0 ? filtered[0] : null,
    lastDate: filtered.length > 0 ? filtered[filtered.length - 1] : null,
  }
}

/**
 * Calculate quarterly return for a sector
 */
async function calculateSectorQuarterReturn(
  sector: string,
  quarterStart: string,
  quarterEnd: string,
  includeDividends: boolean,
  client: any
): Promise<number | null> {
  try {
    // Get all stocks in the sector
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
      return null
    }

    const sectorSymbols = sectorStocks.map(s => s.symbol)
    const marketCapMap = new Map(sectorStocks.map(s => [s.symbol, s.marketCap]))

    // Get price data for the quarter
    const priceQuery = `
      SELECT date, symbol, close as price
      FROM historical_price_data
      WHERE asset_type = 'pk-equity'
        AND symbol = ANY($1)
        AND date >= $2
        AND date <= $3
      ORDER BY date ASC, symbol ASC
    `
    const priceResult = await client.query(priceQuery, [sectorSymbols, quarterStart, quarterEnd])

    // Group prices by date
    const pricesByDate = new Map<string, Array<{ symbol: string; price: number }>>()
    for (const row of priceResult.rows) {
      const date = row.date
      if (!pricesByDate.has(date)) {
        pricesByDate.set(date, [])
      }
      pricesByDate.get(date)!.push({ symbol: row.symbol, price: parseFloat(row.price) || 0 })
    }

    if (pricesByDate.size === 0) {
      return null
    }

    // Calculate market-cap weighted index for start and end of quarter
    const sortedDates = Array.from(pricesByDate.keys()).sort()
    const quarterStartDate = sortedDates[0]
    const quarterEndDate = sortedDates[sortedDates.length - 1]

    const startPrices = pricesByDate.get(quarterStartDate) || []
    const endPrices = pricesByDate.get(quarterEndDate) || []

    // Calculate weighted average for start
    let startWeightedPrice = 0
    let startTotalMarketCap = 0
    for (const { symbol, price } of startPrices) {
      const marketCap = marketCapMap.get(symbol) || 0
      if (marketCap > 0 && price > 0) {
        startWeightedPrice += price * marketCap
        startTotalMarketCap += marketCap
      }
    }

    // Calculate weighted average for end
    let endWeightedPrice = 0
    let endTotalMarketCap = 0
    for (const { symbol, price } of endPrices) {
      const marketCap = marketCapMap.get(symbol) || 0
      if (marketCap > 0 && price > 0) {
        endWeightedPrice += price * marketCap
        endTotalMarketCap += marketCap
      }
    }

    if (startTotalMarketCap === 0 || endTotalMarketCap === 0) {
      return null
    }

    const startAvgPrice = startWeightedPrice / startTotalMarketCap
    const endAvgPrice = endWeightedPrice / endTotalMarketCap

    // If dividends are included, we need to adjust for dividends
    if (includeDividends) {
      // For sector-level dividend adjustment, we need to calculate weighted dividend returns
      // This is complex, so we'll use a simplified approach: calculate total return for each stock
      // and then weight by market cap

      const stockReturns: Array<{ symbol: string; return: number; marketCap: number }> = []

      for (const stock of sectorStocks) {
        const stockPrices = priceResult.rows
          .filter(r => r.symbol === stock.symbol)
          .map(r => ({ date: r.date, close: parseFloat(r.price) || 0 }))
          .sort((a, b) => a.date.localeCompare(b.date))

        if (stockPrices.length === 0) continue

        const startPrice = stockPrices.find(p => p.date >= quarterStart)?.close
        const endPrice = stockPrices[stockPrices.length - 1]?.close

        if (!startPrice || !endPrice || startPrice === 0) continue

        // Get dividends for this stock in the quarter
        const dividends = await getDividendData('pk-equity', stock.symbol, quarterStart, quarterEnd)
        
        if (dividends.length > 0) {
          // Calculate dividend-adjusted return
          const adjustedData = calculateDividendAdjustedPrices(
            stockPrices.map(p => ({ date: p.date, close: p.close })),
            dividends.map(d => ({ date: d.date, dividend_amount: d.dividend_amount }))
          )

          if (adjustedData.length > 0) {
            const startAdjusted = adjustedData[0].adjustedValue
            const endAdjusted = adjustedData[adjustedData.length - 1].adjustedValue
            if (startAdjusted > 0) {
              const returnPct = ((endAdjusted - startAdjusted) / startAdjusted) * 100
              stockReturns.push({ symbol: stock.symbol, return: returnPct, marketCap: stock.marketCap })
            }
          }
        } else {
          // No dividends, use simple price return
          const returnPct = ((endPrice - startPrice) / startPrice) * 100
          stockReturns.push({ symbol: stock.symbol, return: returnPct, marketCap: stock.marketCap })
        }
      }

      // Calculate market-cap weighted average return
      if (stockReturns.length > 0) {
        let totalWeightedReturn = 0
        let totalMarketCap = 0
        for (const { return: returnPct, marketCap } of stockReturns) {
          totalWeightedReturn += returnPct * marketCap
          totalMarketCap += marketCap
        }
        return totalMarketCap > 0 ? totalWeightedReturn / totalMarketCap : null
      }
    }

    // Simple price return without dividends
    return ((endAvgPrice - startAvgPrice) / startAvgPrice) * 100
  } catch (error) {
    console.error(`Error calculating sector quarter return for ${sector}:`, error)
    return null
  }
}

/**
 * Calculate quarterly return for KSE100
 */
async function calculateKSE100QuarterReturn(
  quarterStart: string,
  quarterEnd: string,
  includeDividends: boolean,
  client: any
): Promise<number | null> {
  try {
    // Get KSE100 price data
    const priceQuery = `
      SELECT date, close as price
      FROM historical_price_data
      WHERE asset_type = 'kse100'
        AND symbol = 'KSE100'
        AND date >= $1
        AND date <= $2
      ORDER BY date ASC
    `
    const priceResult = await client.query(priceQuery, [quarterStart, quarterEnd])

    if (priceResult.rows.length === 0) {
      return null
    }

    const priceData: PriceDataPoint[] = priceResult.rows.map(row => ({
      date: row.date,
      close: parseFloat(row.price) || 0,
    })).sort((a, b) => a.date.localeCompare(b.date))

    const startPrice = priceData[0].close
    const endPrice = priceData[priceData.length - 1].close

    if (startPrice === 0) {
      return null
    }

    // Note: KSE100 is an index, so it typically doesn't have dividends
    // But if includeDividends is true, we could theoretically adjust for constituent dividends
    // For now, we'll just return price return for KSE100
    return ((endPrice - startPrice) / startPrice) * 100
  } catch (error) {
    console.error(`Error calculating KSE100 quarter return:`, error)
    return null
  }
}

/**
 * GET /api/sector-performance/quarterly?sector=Banking&year=2024&includeDividends=true
 * 
 * Returns quarter-wise performance for a specific sector compared to KSE100
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const sector = searchParams.get('sector')
    const yearParam = searchParams.get('year')
    const includeDividendsParam = searchParams.get('includeDividends')

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

    // Check cache first
    const { cacheManager } = await import('@/lib/cache/cache-manager')
    const cacheKey = `sector-performance-${sector}-${year}-${includeDividends}`
    const cached = await cacheManager.get<QuarterPerformance[]>(cacheKey)
    
    if (cached) {
      return NextResponse.json({
        success: true,
        sector,
        year,
        includeDividends,
        quarters: cached,
        count: cached.length,
        cached: true,
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
          'X-Cache': 'HIT',
        },
      })
    }

    const client = await getDbClient()

    try {
      // Get quarter boundaries
      const quarters = getQuarterBoundaries(year)

      // Calculate performance for the selected sector
      const quarterPerformances: QuarterPerformance[] = []

      // Calculate KSE100 returns once (can be cached separately)
      const kse100CacheKey = `kse100-performance-${year}-${includeDividends}`
      let kse100Returns: Map<string, number> = new Map()
      
      const cachedKse100 = await cacheManager.get<Record<string, number>>(kse100CacheKey)
      if (cachedKse100) {
        kse100Returns = new Map(Object.entries(cachedKse100))
      } else {
        for (const quarter of quarters) {
          const kse100Return = await calculateKSE100QuarterReturn(
            quarter.startDate,
            quarter.endDate,
            includeDividends,
            client
          )
          if (kse100Return !== null) {
            kse100Returns.set(quarter.quarter, kse100Return)
          }
        }
        // Cache KSE100 returns for 24 hours (as plain object for serialization)
        if (kse100Returns.size > 0) {
          await cacheManager.set(kse100CacheKey, Object.fromEntries(kse100Returns), 'kse100-performance', { isHistorical: true })
        }
      }

      // Calculate sector returns
      for (const quarter of quarters) {
        const sectorReturn = await calculateSectorQuarterReturn(
          sector,
          quarter.startDate,
          quarter.endDate,
          includeDividends,
          client
        )

        const kse100Return = kse100Returns?.get(quarter.quarter)

        if (sectorReturn !== null && kse100Return !== null) {
          const outperformance = sectorReturn - kse100Return
          quarterPerformances.push({
            quarter: quarter.quarter,
            startDate: quarter.startDate,
            endDate: quarter.endDate,
            sectorReturn,
            kse100Return,
            outperformance,
            outperformed: outperformance > 0,
          })
        }
      }

      // Cache the result for 1 hour
      await cacheManager.set(cacheKey, quarterPerformances, 'sector-performance', { isHistorical: true })

      return NextResponse.json({
        success: true,
        sector,
        year,
        includeDividends,
        quarters: quarterPerformances,
        count: quarterPerformances.length,
        cached: false,
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
          'X-Cache': 'MISS',
        },
      })
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error('[Sector Performance API] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to calculate sector performance',
      details: error.message,
    }, { status: 500 })
  }
}

