import { NextRequest, NextResponse } from 'next/server'
import { fetchPKEquityPriceService } from '@/lib/prices/pk-equity-service'
import { getHistoricalDataWithMetadata } from '@/lib/portfolio/db-client'
import { cacheManager } from '@/lib/cache/cache-manager'
import { generateHistoricalCacheKey } from '@/lib/cache/cache-utils'
import { isMarketClosed } from '@/lib/portfolio/market-hours'
import { MarketDataService } from '@/lib/services/market-data'

/**
 * Unified PK Equity Price API Route
 * 
 * GET /api/pk-equity/price?ticker=PTC
 * 
 * Delegates to fetchPKEquityPriceService.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const ticker = searchParams.get('ticker')
  const date = searchParams.get('date')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const refresh = searchParams.get('refresh') === 'true'

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker parameter is required' }, { status: 400 })
  }

  const tickerUpper = ticker.toUpperCase()

  try {
    // Handle date range query (Historical)
    if (startDate || endDate) {
      const cacheKey = generateHistoricalCacheKey('pk-equity', tickerUpper, startDate, endDate)
      const cacheContext = { isHistorical: true, refresh, marketClosed: isMarketClosed('PSX') }

      const { data: cachedData, fromCache } = await cacheManager.getOrSet(
        cacheKey,
        async () => {
          const { data } = await getHistoricalDataWithMetadata('pk-equity', tickerUpper, startDate || undefined, endDate || undefined)
          return data
        },
        'pk-equity',
        cacheContext
      )

      return NextResponse.json({
        ticker: tickerUpper,
        data: cachedData,
        count: cachedData.length,
        startDate: startDate || null,
        endDate: endDate || null,
        source: 'database',
      }, { headers: { 'X-Cache': fromCache ? 'HIT' : 'MISS' } })
    }

    // Handle specific date query
    if (date) {
      const { data } = await getHistoricalDataWithMetadata('pk-equity', tickerUpper, date, date)
      if (data.length > 0) {
        return NextResponse.json({
          ticker: tickerUpper,
          price: data[0].close,
          date: data[0].date,
          source: 'database',
        })
      }
      return NextResponse.json({ error: `Price data not found for date: ${date}` }, { status: 404 })
    }

    // Handle current price query
    const service = MarketDataService.getInstance()

    const result = await service.ensureData<{ price: number, date: string }>(
      'pk-equity',
      tickerUpper,
      async () => {
        const res = await fetchPKEquityPriceService(tickerUpper)
        return res ? { price: res.price, date: res.date } : null as any
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

    return NextResponse.json({ error: `Price not found for ticker: ${ticker}` }, { status: 404 })

  } catch (error: any) {
    console.error('Error in PK equity price API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch price', details: error.message },
      { status: 500 }
    )
  }
}
