import { NextRequest, NextResponse } from 'next/server'
import { fetchBinancePrice } from '@/lib/portfolio/binance-api'
import { getTodayPriceFromDatabase, getTodayPriceWithTimestamp, getHistoricalDataWithMetadata, insertHistoricalData } from '@/lib/portfolio/db-client'
import { getTodayInMarketTimezone } from '@/lib/portfolio/market-hours'
import { fetchBinanceHistoricalData } from '@/lib/portfolio/binance-historical-api'
import { cacheManager } from '@/lib/cache/cache-manager'
import { generatePriceCacheKey, generateHistoricalCacheKey, generateInvalidationKeys, generateHistoricalInvalidationPattern } from '@/lib/cache/cache-utils'
import { MarketDataService } from '@/lib/services/market-data'

/**
 * Unified Crypto Price API Route
 * 
 * GET /api/crypto/price?symbol=BTC
 * GET /api/crypto/price?symbol=BTC&date=2024-01-15
 * GET /api/crypto/price?symbol=BTC&startDate=2024-01-01&endDate=2024-01-31
 * GET /api/crypto/price?symbol=BTC&refresh=true
 * 
 * Fetches current or historical price data for crypto assets.
 * - Checks database first (if date specified or market closed)
 * - Fetches from Binance API if not in database
 * - Automatically stores fetched data in database
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
    const today = getTodayInMarketTimezone('crypto')
    console.log(`[CRYPTO API] Request: symbol=${symbolUpper}, refresh=${refresh}, today=${today}`)

    // Handle date range query
    if (startDate || endDate) {
      const cacheKey = generateHistoricalCacheKey('crypto', symbolUpper, startDate, endDate)
      const cacheContext = { isHistorical: true, refresh }

      const { data: cachedData, fromCache } = await cacheManager.getOrSet(
        cacheKey,
        async () => {
          const { data } = await getHistoricalDataWithMetadata('crypto', symbolUpper, startDate || undefined, endDate || undefined)
          return data
        },
        'crypto',
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
      const cacheKey = generatePriceCacheKey('crypto', symbolUpper, date, refresh)
      const cacheContext = { isHistorical: true, date, refresh }

      const { data: cachedData, fromCache } = await cacheManager.getOrSet(
        cacheKey,
        async () => {
          const { data } = await getHistoricalDataWithMetadata('crypto', symbolUpper, date, date)
          return data
        },
        'crypto',
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

      return NextResponse.json(
        { error: `Price data not found for date: ${date}` },
        { status: 404 }
      )
    }

    // Handle current price query
    const service = MarketDataService.getInstance()

    const result = await service.ensureData<{ price: number, date: string }>(
      'crypto',
      symbolUpper,
      async () => {
        const price = await fetchBinancePrice(symbolUpper)
        // MarketDataService expects non-null from fetcher to succeed, or it falls back to DB.
        // But fetchBinancePrice can return null.
        // If null, we should return null so service can decide.
        // However, service implementation says: "if (!data) throw...".
        // So if we return null, service throws "No data returned" and goes to fallback.
        // This is correct behavior.
        return price ? { price, date: today } : null as any
      },
      refresh
    )

    if (result) {
      console.log(`[CRYPTO API] Service returned: ${symbolUpper}, price=${result.price}`)
      return NextResponse.json({
        symbol: symbolUpper,
        price: result.price,
        date: result.date,
        source: 'market-data-service', // Abstracted source
      })
    }

    return NextResponse.json(
      { error: 'Failed to fetch price from Binance' },
      { status: 500 }
    )

  } catch (error) {
    console.error(`[CRYPTO API] ❌ ERROR:`, error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
