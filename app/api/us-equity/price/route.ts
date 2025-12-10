import { NextRequest, NextResponse } from 'next/server'
import { getLatestPriceFromStockAnalysis, fetchStockAnalysisData } from '@/lib/portfolio/stockanalysis-api'
import { getTodayPriceFromDatabase, getHistoricalDataWithMetadata, insertHistoricalData } from '@/lib/portfolio/db-client'
import { isMarketClosed, getTodayInMarketTimezone } from '@/lib/portfolio/market-hours'
import { cacheManager } from '@/lib/cache/cache-manager'
import { generatePriceCacheKey, generateHistoricalCacheKey, generateInvalidationKeys, generateHistoricalInvalidationPattern } from '@/lib/cache/cache-utils'
import { MarketDataService } from '@/lib/services/market-data'

/**
 * Unified US Equity Price API Route
 * 
 * GET /api/us-equity/price?ticker=AAPL
 * GET /api/us-equity/price?ticker=AAPL&date=2024-01-15
 * GET /api/us-equity/price?ticker=AAPL&startDate=2024-01-01&endDate=2024-01-31
 * GET /api/us-equity/price?ticker=AAPL&refresh=true
 * 
 * Fetches current or historical price data for US equity assets.
 * - Checks database first (if market closed and today's data exists)
 * - Fetches from StockAnalysis.com API if not in database
 * - Automatically stores fetched data in database
 * - Supports date ranges for historical data
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const ticker = searchParams.get('ticker')
  const date = searchParams.get('date')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const refresh = searchParams.get('refresh') === 'true'

  if (!ticker) {
    return NextResponse.json(
      { error: 'Ticker parameter is required' },
      { status: 400 }
    )
  }

  try {
    const tickerUpper = ticker.toUpperCase()
    const today = getTodayInMarketTimezone('US')

    // Handle date range query
    if (startDate || endDate) {
      const cacheKey = generateHistoricalCacheKey('us-equity', tickerUpper, startDate, endDate)
      const cacheContext = { isHistorical: true, refresh, marketClosed: isMarketClosed('US') }

      const { data: cachedData, fromCache } = await cacheManager.getOrSet(
        cacheKey,
        async () => {
          const { data } = await getHistoricalDataWithMetadata('us-equity', tickerUpper, startDate || undefined, endDate || undefined)
          return data
        },
        'us-equity',
        cacheContext
      )

      return NextResponse.json({
        ticker: tickerUpper,
        data: cachedData,
        count: cachedData.length,
        startDate: startDate || null,
        endDate: endDate || null,
        source: 'database',
      }, {
        headers: {
          'X-Cache': fromCache ? 'HIT' : 'MISS',
        },
      })
    }

    // Handle specific date query
    if (date) {
      const cacheKey = generatePriceCacheKey('us-equity', tickerUpper, date, refresh)
      const cacheContext = { isHistorical: true, date, refresh, marketClosed: isMarketClosed('US') }

      const { data: cachedData, fromCache } = await cacheManager.getOrSet(
        cacheKey,
        async () => {
          const { data } = await getHistoricalDataWithMetadata('us-equity', tickerUpper, date, date)
          return data
        },
        'us-equity',
        cacheContext
      )

      if (cachedData.length > 0) {
        return NextResponse.json({
          ticker: tickerUpper,
          price: cachedData[0].close,
          date: cachedData[0].date,
          source: 'database',
        }, {
          headers: {
            'X-Cache': fromCache ? 'HIT' : 'MISS',
          },
        })
      }

      // Date not in database
      return NextResponse.json(
        { error: `Price data not found for date: ${date}` },
        { status: 404 }
      )
    }

    // Handle current price query
    const service = MarketDataService.getInstance()

    const result = await service.ensureData<{ price: number, date: string }>(
      'us-equity',
      tickerUpper,
      async () => {
        const priceData = await getLatestPriceFromStockAnalysis(tickerUpper, 'US')
        return priceData ? { price: priceData.price, date: priceData.date } : null as any
      },
      refresh
    )

    if (result) {
      return NextResponse.json({
        ticker: tickerUpper,
        price: result.price,
        date: result.date,
        source: 'market-data-service'
      })
    }

    // If service returns null (e.g. timeout and no DB data), return 404
    return NextResponse.json(
      { error: `Price not found for ticker: ${ticker}` },
      { status: 404 }
    )
  } catch (error) {
    console.error('Error in US equity price API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch price', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
