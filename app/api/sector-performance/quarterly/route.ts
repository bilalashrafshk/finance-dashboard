import { NextRequest, NextResponse } from 'next/server'
import { getDbClient } from '@/lib/portfolio/db-client'
import { cacheManager } from '@/lib/cache/cache-manager'

export const revalidate = 3600 // Cache for 1 hour
export const dynamic = 'force-dynamic'

interface QuarterPerformance {
  quarter: string // e.g., "2024-Q1"
  startDate: string
  endDate: string
  isOngoing: boolean
  sectorReturn: number // Percentage return
  kse100Return: number // Percentage return
  outperformance: number // Sector return - KSE100 return
  outperformed: boolean
}

/**
 * Get quarter boundaries for a given year
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
 * Calculate return between two prices
 */
function calculateReturn(startPrice: number, endPrice: number): number {
  if (!startPrice || startPrice === 0) return 0
  return ((endPrice - startPrice) / startPrice) * 100
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const sector = searchParams.get('sector')
    const yearParam = searchParams.get('year')
    // Note: We are ignoring includeDividends for now as requested to keep it simple and robust
    // const includeDividends = searchParams.get('includeDividends') === 'true'

    if (!sector) {
      return NextResponse.json({ success: false, error: 'Sector parameter is required' }, { status: 400 })
    }

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ success: false, error: 'Invalid year parameter' }, { status: 400 })
    }

    // Cache Key
    const cacheKey = `sector-performance-v3-${sector}-${year}`
    const cached = await cacheManager.get<QuarterPerformance[]>(cacheKey)

    if (cached) {
      return NextResponse.json({
        success: true,
        quarters: cached,
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
      // 1. Get all stocks in the sector
      const sectorStocksQuery = `
        SELECT symbol, market_cap
        FROM company_profiles
        WHERE asset_type = 'pk-equity'
          AND sector = $1
          AND market_cap IS NOT NULL
          AND market_cap > 0
      `
      const sectorStocksResult = await client.query(sectorStocksQuery, [sector])
      const sectorStocks = sectorStocksResult.rows.map(row => ({
        symbol: row.symbol,
        marketCap: parseFloat(row.market_cap) || 0,
      }))

      if (sectorStocks.length === 0) {
        return NextResponse.json({
          success: true,
          quarters: [],
          message: 'No stocks found in this sector',
        })
      }

      const sectorSymbols = sectorStocks.map(s => s.symbol)
      const marketCapMap = new Map(sectorStocks.map(s => [s.symbol, s.marketCap]))

      // 2. Fetch ALL price data for the year for these stocks + KSE100
      // We fetch KSE100 and sector stocks in one go if possible, or two parallel queries
      const startDate = `${year}-01-01`
      const endDate = `${year}-12-31`

      const [kse100Result, stockPricesResult] = await Promise.all([
        client.query(`
          SELECT date, close as price
          FROM historical_price_data
          WHERE symbol = 'KSE100'
            AND date >= $1 AND date <= $2
          ORDER BY date ASC
        `, [startDate, endDate]),
        client.query(`
          SELECT date, symbol, close as price
          FROM historical_price_data
          WHERE symbol = ANY($1)
            AND date >= $2 AND date <= $3
          ORDER BY date ASC
        `, [sectorSymbols, startDate, endDate])
      ])

      // Process KSE100 Data
      const kse100Prices = kse100Result.rows.map(r => ({
        date: new Date(r.date).toISOString().split('T')[0],
        price: parseFloat(r.price) || 0
      }))

      // Process Stock Prices
      // Map: Symbol -> [{ date, price }]
      const stockPricesMap = new Map<string, Array<{ date: string; price: number }>>()
      for (const row of stockPricesResult.rows) {
        const date = new Date(row.date).toISOString().split('T')[0]
        const price = parseFloat(row.price) || 0
        if (!stockPricesMap.has(row.symbol)) {
          stockPricesMap.set(row.symbol, [])
        }
        stockPricesMap.get(row.symbol)!.push({ date, price })
      }

      // 3. Calculate Performance per Quarter
      const quarters = getQuarterBoundaries(year)
      const today = new Date().toISOString().split('T')[0]
      const results: QuarterPerformance[] = []

      for (const q of quarters) {
        // Skip future quarters
        if (q.startDate > today) continue

        // Effective end date (don't go beyond today)
        const isOngoing = q.endDate >= today
        const effectiveEndDate = isOngoing ? today : q.endDate

        // --- KSE100 Return ---
        const kse100InQuarter = kse100Prices.filter(p => p.date >= q.startDate && p.date <= effectiveEndDate)
        let kse100Return = 0
        let lastDataDate = effectiveEndDate

        if (kse100InQuarter.length >= 2) {
          const startPrice = kse100InQuarter[0].price
          const endPrice = kse100InQuarter[kse100InQuarter.length - 1].price
          kse100Return = calculateReturn(startPrice, endPrice)
          lastDataDate = kse100InQuarter[kse100InQuarter.length - 1].date
        }

        // --- Sector Return (Market Cap Weighted) ---
        let totalWeightedReturn = 0
        let totalWeight = 0

        for (const stock of sectorStocks) {
          const prices = stockPricesMap.get(stock.symbol) || []
          const pricesInQuarter = prices.filter(p => p.date >= q.startDate && p.date <= effectiveEndDate)

          if (pricesInQuarter.length >= 2) {
            const startPrice = pricesInQuarter[0].price
            const endPrice = pricesInQuarter[pricesInQuarter.length - 1].price
            const stockReturn = calculateReturn(startPrice, endPrice)

            totalWeightedReturn += stockReturn * stock.marketCap
            totalWeight += stock.marketCap
          }
        }

        const sectorReturn = totalWeight > 0 ? totalWeightedReturn / totalWeight : 0

        // Only add if we have some data (or if it's a valid past quarter)
        // If both returns are 0, it might mean no data, but 0% return is also possible.
        // We check if we had any KSE100 data as a proxy for "market was open"
        if (kse100InQuarter.length > 0) {
          const outperformance = sectorReturn - kse100Return
          results.push({
            quarter: q.quarter,
            startDate: q.startDate,
            endDate: lastDataDate, // Use actual last data date
            isOngoing,
            sectorReturn,
            kse100Return,
            outperformance,
            outperformed: outperformance > 0
          })
        }
      }

      // Cache result
      await cacheManager.set(cacheKey, results, 'sector-performance', { isHistorical: true })

      return NextResponse.json({
        success: true,
        quarters: results,
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
