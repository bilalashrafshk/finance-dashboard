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
    console.log(`[Sector Return Calc] Starting calculation for ${sector}, quarter: ${quarterStart} to ${quarterEnd}`)
    
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

    console.log(`[Sector Return Calc] Found ${sectorStocks.length} stocks in sector ${sector}:`, 
      sectorStocks.map(s => s.symbol).slice(0, 10).join(', '), 
      sectorStocks.length > 10 ? `... (${sectorStocks.length} total)` : '')

    if (sectorStocks.length === 0) {
      console.warn(`[Sector Return Calc] No stocks found for sector: ${sector}`)
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
    console.log(`[Sector Return Calc] Querying price data for ${sectorSymbols.length} symbols from ${quarterStart} to ${quarterEnd}`)
    const priceResult = await client.query(priceQuery, [sectorSymbols, quarterStart, quarterEnd])
    console.log(`[Sector Return Calc] Found ${priceResult.rows.length} price records`)

    // Group prices by date
    const pricesByDate = new Map<string, Array<{ symbol: string; price: number }>>()
    const symbolsWithData = new Set<string>()
    for (const row of priceResult.rows) {
      const date = row.date
      if (!pricesByDate.has(date)) {
        pricesByDate.set(date, [])
      }
      pricesByDate.get(date)!.push({ symbol: row.symbol, price: parseFloat(row.price) || 0 })
      symbolsWithData.add(row.symbol)
    }

    console.log(`[Sector Return Calc] Prices grouped by ${pricesByDate.size} unique dates`)
    console.log(`[Sector Return Calc] Symbols with price data: ${symbolsWithData.size} out of ${sectorSymbols.length}`)
    const symbolsWithoutData = sectorSymbols.filter(s => !symbolsWithData.has(s))
    if (symbolsWithoutData.length > 0) {
      console.warn(`[Sector Return Calc] Symbols without price data: ${symbolsWithoutData.slice(0, 10).join(', ')}${symbolsWithoutData.length > 10 ? `... (${symbolsWithoutData.length} total)` : ''}`)
    }

    if (pricesByDate.size === 0) {
      console.warn(`[Sector Return Calc] No price data found for any dates in quarter ${quarterStart} to ${quarterEnd}`)
      return null
    }

    // Calculate market-cap weighted index for start and end of quarter
    // Find first trading date on or after quarter start, and last trading date on or before quarter end
    const sortedDates = Array.from(pricesByDate.keys()).sort()
    
    if (sortedDates.length === 0) {
      console.warn(`[Sector Return Calc] No sorted dates available`)
      return null
    }

    // Find first trading date on or after quarter start
    const firstTradingDate = sortedDates.find(d => d >= quarterStart) || sortedDates[0]
    // Find last trading date on or before quarter end
    const lastTradingDate = sortedDates.filter(d => d <= quarterEnd).pop() || sortedDates[sortedDates.length - 1]

    console.log(`[Sector Return Calc] First trading date: ${firstTradingDate}, Last trading date: ${lastTradingDate}`)
    console.log(`[Sector Return Calc] Quarter range: ${quarterStart} to ${quarterEnd}`)

    if (!firstTradingDate || !lastTradingDate || firstTradingDate > lastTradingDate) {
      console.warn(`[Sector Return Calc] Invalid date range: first=${firstTradingDate}, last=${lastTradingDate}`)
      return null
    }

    // If dividends are included, we need to adjust for dividends
    if (includeDividends) {
      // Batch fetch all dividends for all stocks in parallel
      const dividendPromises = sectorStocks.map(stock =>
        getDividendData('pk-equity', stock.symbol, quarterStart, quarterEnd)
      )
      const allDividends = await Promise.all(dividendPromises)
      const dividendsMap = new Map<string, DividendRecord[]>()
      sectorStocks.forEach((stock, index) => {
        if (allDividends[index].length > 0) {
          dividendsMap.set(stock.symbol, allDividends[index])
        }
      })

      // Calculate returns for all stocks in parallel
      const stockReturnPromises = sectorStocks.map(async (stock) => {
        const stockPrices = priceResult.rows
          .filter(r => r.symbol === stock.symbol)
          .map(r => ({ date: String(r.date).split('T')[0], close: parseFloat(r.price) || 0 })) // Ensure date is string in YYYY-MM-DD format
          .sort((a, b) => a.date.localeCompare(b.date))

        if (stockPrices.length === 0) return null

        // Filter prices to only those within the quarter range
        const pricesInRange = stockPrices.filter(p => p.date >= quarterStart && p.date <= quarterEnd)
        
        if (pricesInRange.length === 0) {
          console.warn(`[Sector Return Calc] (with dividends) ${stock.symbol}: No prices within quarter range ${quarterStart} to ${quarterEnd}`)
          return null
        }

        // Use the first data point within the quarter range as start price
        const startPriceData = pricesInRange[0]
        const startPrice = startPriceData.close
        
        // Use the last data point within the quarter range as end price
        const endPriceData = pricesInRange[pricesInRange.length - 1]
        const endPrice = endPriceData.close

        if (!startPrice || !endPrice || startPrice === 0) {
          console.warn(`[Sector Return Calc] (with dividends) ${stock.symbol}: Invalid prices: start=${startPrice}, end=${endPrice}`)
          return null
        }
        
        console.log(`[Sector Return Calc] (with dividends) ${stock.symbol}: Using first price ${startPriceData.date} (${startPrice}) and last price ${endPriceData.date} (${endPrice}) within quarter range`)

        const dividends = dividendsMap.get(stock.symbol) || []
        
        if (dividends.length > 0) {
          // Calculate dividend-adjusted return using prices within range
          const adjustedData = calculateDividendAdjustedPrices(
            pricesInRange.map(p => ({ date: p.date, close: p.close })),
            dividends.map(d => ({ date: d.date, dividend_amount: d.dividend_amount }))
          )

          if (adjustedData.length > 0) {
            const startAdjusted = adjustedData[0].adjustedValue
            const endAdjusted = adjustedData[adjustedData.length - 1].adjustedValue
            if (startAdjusted > 0) {
              const returnPct = ((endAdjusted - startAdjusted) / startAdjusted) * 100
              return { symbol: stock.symbol, return: returnPct, marketCap: stock.marketCap }
            }
          }
        } else {
          // No dividends, use simple price return
          const returnPct = ((endPrice - startPrice) / startPrice) * 100
          return { symbol: stock.symbol, return: returnPct, marketCap: stock.marketCap }
        }
        return null
      })

      const stockReturns = (await Promise.all(stockReturnPromises)).filter((r): r is { symbol: string; return: number; marketCap: number } => r !== null)

      console.log(`[Sector Return Calc] (with dividends) Calculated returns for ${stockReturns.length} stocks`)

      // Calculate market-cap weighted average return
      if (stockReturns.length > 0) {
        let totalWeightedReturn = 0
        let totalMarketCap = 0
        for (const { return: returnPct, marketCap } of stockReturns) {
          totalWeightedReturn += returnPct * marketCap
          totalMarketCap += marketCap
        }
        const result = totalMarketCap > 0 ? totalWeightedReturn / totalMarketCap : null
        console.log(`[Sector Return Calc] (with dividends) Sector return: ${result}%`)
        return result
      }
    } else {
      // Calculate returns for all stocks (without dividends)
      const stockReturnPromises = sectorStocks.map(async (stock) => {
        const stockPrices = priceResult.rows
          .filter(r => r.symbol === stock.symbol)
          .map(r => ({ date: String(r.date).split('T')[0], close: parseFloat(r.price) || 0 })) // Ensure date is string in YYYY-MM-DD format
          .sort((a, b) => a.date.localeCompare(b.date))

        if (stockPrices.length === 0) {
          console.warn(`[Sector Return Calc] (no dividends) No price data for ${stock.symbol} in quarter ${quarterStart} to ${quarterEnd}`)
          return null
        }

        // Log available dates for debugging
        if (stockPrices.length > 0) {
          const firstDate = stockPrices[0].date
          const lastDate = stockPrices[stockPrices.length - 1].date
          console.log(`[Sector Return Calc] (no dividends) ${stock.symbol}: ${stockPrices.length} prices, range: ${firstDate} to ${lastDate}, quarter: ${quarterStart} to ${quarterEnd}`)
        }

        // Filter prices to only those within the quarter range
        const pricesInRange = stockPrices.filter(p => p.date >= quarterStart && p.date <= quarterEnd)
        
        if (pricesInRange.length === 0) {
          console.warn(`[Sector Return Calc] (no dividends) ${stock.symbol}: No prices within quarter range ${quarterStart} to ${quarterEnd}`)
          return null
        }

        // Use the first data point within the quarter range as start price
        const startPriceData = pricesInRange[0]
        const startPrice = startPriceData.close
        
        // Use the last data point within the quarter range as end price
        const endPriceData = pricesInRange[pricesInRange.length - 1]
        const endPrice = endPriceData.close
        
        console.log(`[Sector Return Calc] (no dividends) ${stock.symbol}: Using first price ${startPriceData.date} (${startPrice}) and last price ${endPriceData.date} (${endPrice}) within quarter range`)

        if (!startPrice || !endPrice || startPrice === 0) {
          console.warn(`[Sector Return Calc] (no dividends) Missing prices for ${stock.symbol}: start=${startPrice}, end=${endPrice}, prices count=${stockPrices.length}`)
          return null
        }

        // Calculate simple price return
        const returnPct = ((endPrice - startPrice) / startPrice) * 100
        console.log(`[Sector Return Calc] (no dividends) ${stock.symbol}: start=${startPrice}, end=${endPrice}, return=${returnPct.toFixed(2)}%`)
        return { symbol: stock.symbol, return: returnPct, marketCap: stock.marketCap }
      })

      const stockReturns = (await Promise.all(stockReturnPromises)).filter((r): r is { symbol: string; return: number; marketCap: number } => r !== null)

      console.log(`[Sector Return Calc] (no dividends) Calculated returns for ${stockReturns.length} out of ${sectorStocks.length} stocks`)

      // Calculate market-cap weighted average return
      if (stockReturns.length > 0) {
        let totalWeightedReturn = 0
        let totalMarketCap = 0
        for (const { return: returnPct, marketCap } of stockReturns) {
          totalWeightedReturn += returnPct * marketCap
          totalMarketCap += marketCap
        }
        const result = totalMarketCap > 0 ? totalWeightedReturn / totalMarketCap : null
        console.log(`[Sector Return Calc] (no dividends) Sector return: ${result}%`)
        return result
      } else {
        console.warn(`[Sector Return Calc] (no dividends) No valid stock returns calculated`)
      }
    }

    console.warn(`[Sector Return Calc] Returning null for ${sector}, quarter: ${quarterStart} to ${quarterEnd}`)
    return null
  } catch (error) {
    return null
  }
}

/**
 * Calculate quarterly return for KSE100 using centralized route
 */
async function calculateKSE100QuarterReturn(
  quarterStart: string,
  quarterEnd: string,
  includeDividends: boolean,
  client: any
): Promise<number | null> {
  try {
    // Use centralized historical data route (same as other components)
    const { getHistoricalDataWithMetadata } = await import('@/lib/portfolio/db-client')
    
    const { data } = await getHistoricalDataWithMetadata(
      'kse100',
      'KSE100',
      quarterStart,
      quarterEnd
    )

    if (!data || data.length === 0) {
      return null
    }

    // Sort by date
    const sortedData = [...data].sort((a, b) => a.date.localeCompare(b.date))

    if (sortedData.length === 0) {
      return null
    }

    // Find first trading date on or after quarter start
    const firstDate = sortedData.find(d => d.date >= quarterStart) || sortedData[0]
    // Find last trading date on or before quarter end
    const lastDate = sortedData.filter(d => d.date <= quarterEnd).pop() || sortedData[sortedData.length - 1]

    if (!firstDate || !lastDate || firstDate.date > lastDate.date) {
      return null
    }

    const startPrice = parseFloat(firstDate.close) || 0
    const endPrice = parseFloat(lastDate.close) || 0

    if (startPrice === 0 || endPrice === 0) {
      return null
    }

    // Note: KSE100 is an index, so it typically doesn't have dividends
    // But if includeDividends is true, we could theoretically adjust for constituent dividends
    // For now, we'll just return price return for KSE100
    const returnPct = ((endPrice - startPrice) / startPrice) * 100
    
    if (isNaN(returnPct) || !isFinite(returnPct)) {
      return null
    }
    
    return returnPct
  } catch (error) {
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
      
      // Filter out future quarters (quarters that haven't started yet)
      const today = new Date()
      const currentDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const validQuarters = quarters.filter(q => q.startDate <= currentDateStr)
      
      console.log(`[Sector Performance API] Year ${year}: ${quarters.length} total quarters, ${validQuarters.length} valid quarters (not in future)`)

      // Calculate performance for the selected sector
      const quarterPerformances: QuarterPerformance[] = []

      // Calculate KSE100 returns once (can be cached separately)
      const kse100CacheKey = `kse100-performance-${year}-${includeDividends}`
      let kse100Returns: Map<string, number> = new Map()
      
      const cachedKse100 = await cacheManager.get<Record<string, number>>(kse100CacheKey)
      if (cachedKse100) {
        kse100Returns = new Map(Object.entries(cachedKse100))
      } else {
        // Calculate all KSE100 returns in parallel for better performance
        const kse100Promises = validQuarters.map(quarter =>
          calculateKSE100QuarterReturn(
            quarter.startDate,
            quarter.endDate,
            includeDividends,
            client
          ).then(returnVal => ({ quarter: quarter.quarter, return: returnVal }))
        )
        const kse100Results = await Promise.all(kse100Promises)
        
        for (const { quarter, return: returnVal } of kse100Results) {
          if (returnVal !== null && !isNaN(returnVal)) {
            kse100Returns.set(quarter, returnVal)
          }
        }
        
        // Cache KSE100 returns for 24 hours (as plain object for serialization)
        if (kse100Returns.size > 0) {
          await cacheManager.set(kse100CacheKey, Object.fromEntries(kse100Returns), 'kse100-performance', { isHistorical: true })
        }
      }

      // Calculate sector returns in parallel for better performance
      console.log(`[Sector Performance API] Calculating sector returns for ${validQuarters.length} quarters`)
      const sectorReturnPromises = validQuarters.map(quarter =>
        calculateSectorQuarterReturn(
          sector,
          quarter.startDate,
          quarter.endDate,
          includeDividends,
          client
        ).then(returnVal => {
          console.log(`[Sector Performance API] Quarter ${quarter.quarter}: sector return = ${returnVal}`)
          return { quarter: quarter.quarter, startDate: quarter.startDate, endDate: quarter.endDate, return: returnVal }
        })
      )
      const sectorResults = await Promise.all(sectorReturnPromises)

      // Check if we have any stocks in the sector
      const sectorStocksCheckQuery = `
        SELECT COUNT(*) as count
        FROM company_profiles
        WHERE asset_type = 'pk-equity'
          AND sector = $1
          AND market_cap IS NOT NULL
          AND market_cap > 0
      `
      const sectorStocksCheck = await client.query(sectorStocksCheckQuery, [sector])
      const stockCount = parseInt(sectorStocksCheck.rows[0]?.count || '0', 10)
      console.log(`[Sector Performance API] Found ${stockCount} stocks in sector ${sector}`)

      console.log(`[Sector Performance API] Sector results:`, sectorResults.map(r => ({ quarter: r.quarter, return: r.return })))
      console.log(`[Sector Performance API] KSE100 returns:`, Array.from(kse100Returns.entries()))

      // Combine sector and KSE100 returns
      for (const { quarter, startDate, endDate, return: sectorReturn } of sectorResults) {
        const kse100Return = kse100Returns?.get(quarter)

        console.log(`[Sector Performance API] Processing quarter ${quarter}: sector=${sectorReturn}, kse100=${kse100Return}`)

        // Only add quarter if we have both sector and KSE100 data
        if (sectorReturn !== null && kse100Return !== null && !isNaN(sectorReturn) && !isNaN(kse100Return)) {
          const outperformance = sectorReturn - kse100Return
          quarterPerformances.push({
            quarter,
            startDate,
            endDate,
            sectorReturn,
            kse100Return,
            outperformance,
            outperformed: outperformance > 0,
          })
          console.log(`[Sector Performance API] Added quarter ${quarter} to results`)
        } else {
          console.warn(`[Sector Performance API] Skipping quarter ${quarter}: sector=${sectorReturn}, kse100=${kse100Return}`)
        }
      }

      console.log(`[Sector Performance API] Final result: ${quarterPerformances.length} quarters with data`)

      // Cache the result for 1 hour
      await cacheManager.set(cacheKey, quarterPerformances, 'sector-performance', { isHistorical: true })

      return NextResponse.json({
        success: true,
        sector,
        year,
        includeDividends,
        quarters: quarterPerformances,
        count: quarterPerformances.length,
        stockCount,
        message: quarterPerformances.length === 0 
          ? (stockCount === 0 
            ? 'No stocks found in this sector' 
            : 'No price data available for this sector in the selected year')
          : undefined,
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
    return NextResponse.json({
      success: false,
      error: 'Failed to calculate sector performance',
      details: error.message,
    }, { status: 500 })
  }
}

