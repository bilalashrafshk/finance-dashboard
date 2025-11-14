import { NextRequest, NextResponse } from 'next/server'
import { getMetalInstrumentId } from '@/lib/portfolio/metals-api'
import { getTodayPriceFromDatabase, getHistoricalDataWithMetadata } from '@/lib/portfolio/db-client'
import { isMarketClosed, getTodayInMarketTimezone } from '@/lib/portfolio/market-hours'
import { cacheManager } from '@/lib/cache/cache-manager'
import { generatePriceCacheKey, generateHistoricalCacheKey } from '@/lib/cache/cache-utils'

/**
 * Unified Metals Price API Route
 * 
 * GET /api/metals/price?symbol=GOLD
 * GET /api/metals/price?symbol=GOLD&date=2024-01-15
 * GET /api/metals/price?symbol=GOLD&startDate=2024-01-01&endDate=2024-01-31
 * GET /api/metals/price?symbol=GOLD&refresh=true
 * 
 * Fetches current or historical price data for metals.
 * - Checks database first (if market closed and today's data exists)
 * - Returns needsClientFetch: true if data not in database (Cloudflare protection)
 * - Client must fetch using getLatestPriceFromInvestingClient() and store via /api/historical-data/store
 * - Supports date ranges for historical data
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const symbol = searchParams.get('symbol')
  const date = searchParams.get('date')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const refresh = searchParams.get('refresh') === 'true'

  if (!symbol) {
    return NextResponse.json(
      { error: 'Symbol parameter is required' },
      { status: 400 }
    )
  }

  try {
    const symbolUpper = symbol.toUpperCase()
    const instrumentId = getMetalInstrumentId(symbolUpper)
    
    if (!instrumentId) {
      return NextResponse.json(
        { error: `Unknown metal symbol: ${symbol}` },
        { status: 400 }
      )
    }

    const today = getTodayInMarketTimezone('US') // Metals trade on US market hours

    // Handle date range query
    if (startDate || endDate) {
      const cacheKey = generateHistoricalCacheKey('metals', symbolUpper, startDate, endDate)
      const cacheContext = { isHistorical: true, refresh, marketClosed: isMarketClosed('US') }
      
      const { data: cachedData, fromCache } = await cacheManager.getOrSet(
        cacheKey,
        async () => {
          const { data } = await getHistoricalDataWithMetadata('metals', symbolUpper, startDate || undefined, endDate || undefined)
          return data
        },
        'metals',
        cacheContext
      )
      
      return NextResponse.json({
        symbol: symbolUpper,
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
      const cacheKey = generatePriceCacheKey('metals', symbolUpper, date, refresh)
      const cacheContext = { isHistorical: true, date, refresh, marketClosed: isMarketClosed('US') }
      
      const { data: cachedData, fromCache } = await cacheManager.getOrSet(
        cacheKey,
        async () => {
          const { data } = await getHistoricalDataWithMetadata('metals', symbolUpper, date, date)
          return data
        },
        'metals',
        cacheContext
      )
      
      if (cachedData.length > 0) {
        return NextResponse.json({
          symbol: symbolUpper,
          price: cachedData[0].close,
          date: cachedData[0].date,
          source: 'database',
        }, {
          headers: {
            'X-Cache': fromCache ? 'HIT' : 'MISS',
          },
        })
      }

      // Date not in database - client needs to fetch
      return NextResponse.json({
        symbol: symbolUpper,
        needsClientFetch: true,
        instrumentId,
        message: 'Price data not found in database. Client-side fetch required due to Cloudflare protection.',
        date,
      })
    }

    // Handle current price query
    const cacheKey = generatePriceCacheKey('metals', symbolUpper, today, refresh)
    const marketClosed = isMarketClosed('US')
    const cacheContext = { refresh, marketClosed }
    
    // Check cache first
    const cachedResponse = cacheManager.get<any>(cacheKey)
    if (cachedResponse && !refresh) {
      return NextResponse.json(cachedResponse, {
        headers: {
          'X-Cache': 'HIT',
        },
      })
    }
    
    // Always check database first (even with refresh=true, we might have just stored data)
    // This prevents infinite loops when data is stored and immediately re-requested
    const todayPrice = await getTodayPriceFromDatabase('metals', symbolUpper, today)
    
    // If we have today's data, always return it to prevent infinite loops
    // Even with refresh=true, if data exists, return it (the client already has the latest)
    if (todayPrice !== null) {
      const response = {
        symbol: symbolUpper,
        price: todayPrice,
        date: today,
        source: 'database',
      }
      cacheManager.set(cacheKey, response, 'metals', cacheContext)
      return NextResponse.json(response, {
        headers: {
          'X-Cache': 'MISS',
        },
      })
    }
    
    // If market is closed, check for most recent data
    if (marketClosed) {
      const { data } = await getHistoricalDataWithMetadata('metals', symbolUpper, undefined, undefined, 1)
      if (data.length > 0) {
        const latest = data[data.length - 1]
        const response = {
          symbol: symbolUpper,
          price: latest.close,
          date: latest.date,
          source: 'database',
        }
        cacheManager.set(cacheKey, response, 'metals', cacheContext)
        return NextResponse.json(response, {
          headers: {
            'X-Cache': 'MISS',
          },
        })
      }
    }

    // Data not in database - return client fetch requirement
    return NextResponse.json({
      symbol: symbolUpper,
      needsClientFetch: true,
      instrumentId,
      message: 'Client-side fetch required due to Cloudflare protection. Use getLatestPriceFromInvestingClient() and store via /api/historical-data/store',
      date: today,
    })
  } catch (error) {
    console.error('Error in metals price API:', error)
    return NextResponse.json(
      { error: 'Failed to process metals price request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
