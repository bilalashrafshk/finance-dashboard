import { NextRequest, NextResponse } from 'next/server'
import { getTodayPriceFromDatabase, getHistoricalDataWithMetadata } from '@/lib/portfolio/db-client'
import { ensureHistoricalData } from '@/lib/portfolio/historical-data-service'
import { isMarketClosed, getTodayInMarketTimezone } from '@/lib/portfolio/market-hours'
import { KSE100_INSTRUMENT_ID, SPX500_INSTRUMENT_ID } from '@/lib/portfolio/investing-client-api'
import { cacheManager } from '@/lib/cache/cache-manager'
import { generatePriceCacheKey, generateHistoricalCacheKey } from '@/lib/cache/cache-utils'

/**
 * Unified Indices Price API Route
 * 
 * GET /api/indices/price?symbol=SPX500
 * GET /api/indices/price?symbol=KSE100&date=2024-01-15
 * GET /api/indices/price?symbol=SPX500&startDate=2024-01-01&endDate=2024-01-31
 * GET /api/indices/price?symbol=KSE100&refresh=true
 * 
 * Fetches current or historical price data for indices (SPX500, KSE100).
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

    // Map symbol to instrument ID and market
    let instrumentId: string
    let market: 'US' | 'PSX'
    let assetType: string

    if (symbolUpper === 'SPX500') {
      instrumentId = SPX500_INSTRUMENT_ID
      market = 'US'
      assetType = 'spx500'
    } else if (symbolUpper === 'KSE100') {
      instrumentId = KSE100_INSTRUMENT_ID
      market = 'PSX'
      assetType = 'kse100'
    } else {
      return NextResponse.json(
        { error: `Unknown index symbol: ${symbol}. Supported: SPX500, KSE100` },
        { status: 400 }
      )
    }

    const today = getTodayInMarketTimezone(market)

    // Handle date range query
    if (startDate || endDate) {
      const cacheKey = generateHistoricalCacheKey(assetType as any, symbolUpper, startDate, endDate)
      const cacheContext = { isHistorical: true, refresh, marketClosed: isMarketClosed(market) }

      const { data: cachedData, fromCache } = await cacheManager.getOrSet(
        cacheKey,
        async () => {
          const { data } = await getHistoricalDataWithMetadata(assetType, symbolUpper, startDate || undefined, endDate || undefined)
          return data
        },
        assetType as any,
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
      const cacheKey = generatePriceCacheKey(assetType as any, symbolUpper, date, refresh)
      const cacheContext = { isHistorical: true, date, refresh, marketClosed: isMarketClosed(market) }

      const { data: cachedData, fromCache } = await cacheManager.getOrSet(
        cacheKey,
        async () => {
          const { data } = await getHistoricalDataWithMetadata(assetType, symbolUpper, date, date)
          return data
        },
        assetType as any,
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
    const cacheKey = generatePriceCacheKey(assetType as any, symbolUpper, today, refresh)
    const marketClosed = isMarketClosed(market)
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

    // Check database first if not forcing refresh
    if (!refresh) {
      const todayPrice = await getTodayPriceFromDatabase(assetType, symbolUpper, today)

      // If market is closed and we have today's data, use it
      if (marketClosed && todayPrice !== null) {
        const response = {
          symbol: symbolUpper,
          price: todayPrice,
          date: today,
          source: 'database',
        }
        cacheManager.set(cacheKey, response, assetType as any, cacheContext)
        return NextResponse.json(response, {
          headers: {
            'X-Cache': 'MISS',
          },
        })
      }
    }

    // Data not in database

    // For KSE100, we now support server-side fetching via historical-data route
    // So we can try to fetch it now
    if (assetType === 'kse100') {
      // This will trigger the background fetch in historical-data-service if needed
      // ensuring we get fresh data from Market Source if DB is stale
      const result = await ensureHistoricalData(assetType, symbolUpper)
      const data = result.data

      if (data.length > 0) {
        let change = 0
        if (data.length > 1) {
          // Ensure we have at least 2 data points for change calculation
          // data[0] is latest, data[1] is previous
          const current = data[0].close
          const prev = data[1].close
          if (prev > 0) {
            change = ((current - prev) / prev) * 100
          }
        }

        const response = {
          symbol: symbolUpper,
          price: data[0].close,
          change: change, // Added change field
          date: data[0].date,
          source: 'database', // It's now in DB (fetched server-side)
        }
        cacheManager.set(cacheKey, response, assetType as any, cacheContext)
        return NextResponse.json(response, {
          headers: {
            'X-Cache': 'MISS',
          },
        })
      }
    }

    // For other indices (SPX500), return client fetch requirement
    return NextResponse.json({
      symbol: symbolUpper,
      needsClientFetch: true,
      instrumentId,
      message: 'Client-side fetch required due to Cloudflare protection. Use getLatestPriceFromInvestingClient() and store via /api/historical-data/store',
      date: today,
    })
  } catch (error) {
    console.error('Error in indices price API:', error)
    return NextResponse.json(
      { error: 'Failed to process indices price request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

