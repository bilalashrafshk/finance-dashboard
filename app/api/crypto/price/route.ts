import { NextRequest, NextResponse } from 'next/server'
import { fetchBinancePrice } from '@/lib/portfolio/binance-api'
import { getTodayPriceFromDatabase, getTodayPriceWithTimestamp, getHistoricalDataWithMetadata, insertHistoricalData } from '@/lib/portfolio/db-client'
import { getTodayInMarketTimezone } from '@/lib/portfolio/market-hours'
import { fetchBinanceHistoricalData } from '@/lib/portfolio/binance-historical-api'
import { cacheManager } from '@/lib/cache/cache-manager'
import { generatePriceCacheKey, generateHistoricalCacheKey, generateInvalidationKeys, generateHistoricalInvalidationPattern } from '@/lib/cache/cache-utils'

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
    const cacheKey = generatePriceCacheKey('crypto', symbolUpper, today, refresh)
    const cacheContext = { refresh }
    
    // Check cache first
    const cachedResponse = cacheManager.get<any>(cacheKey)
    if (cachedResponse && !refresh) {
      console.log(`[CRYPTO API] Cache HIT: ${symbolUpper}`)
      return NextResponse.json(cachedResponse, {
        headers: {
          'X-Cache': 'HIT',
        },
      })
    }
    
    if (!refresh) {
      // Check if we have today's price and if it's fresh enough (for crypto, < 15 mins)
      const dbData = await getTodayPriceWithTimestamp('crypto', symbolUpper, today)
      
      let useDbData = false
      if (dbData) {
        // For crypto, check if data is stale (> 15 mins old)
        const lastUpdated = new Date(dbData.updatedAt).getTime()
        const now = Date.now()
        const ageInMinutes = (now - lastUpdated) / (1000 * 60)
        
        if (ageInMinutes < 15) {
          useDbData = true
          console.log(`[CRYPTO API] Found fresh data in DB: ${symbolUpper}, age=${ageInMinutes.toFixed(1)}m`)
        } else {
          console.log(`[CRYPTO API] Found stale data in DB: ${symbolUpper}, age=${ageInMinutes.toFixed(1)}m, refreshing...`)
        }
      }

      if (useDbData && dbData) {
        console.log(`[CRYPTO API] Returning DB data: ${symbolUpper}, price=${dbData.price}, date=${today}`)
        const response = {
          symbol: symbolUpper,
          price: dbData.price,
          date: today,
          source: 'database',
        }
        // Cache the response
        cacheManager.set(cacheKey, response, 'crypto', cacheContext)
        return NextResponse.json(response, {
          headers: {
            'X-Cache': 'MISS',
          },
        })
      }
      console.log(`[CRYPTO API] Not in DB or stale, fetching from API: ${symbolUpper}`)
    } else {
      console.log(`[CRYPTO API] Refresh=true, fetching from API: ${symbolUpper}`)
    }

    // Check if database is empty - if so, fetch all historical data
    // Handle errors gracefully - if check fails, assume DB is empty and fetch data
    let isDbEmpty = true
    try {
      const { data: existingData } = await getHistoricalDataWithMetadata('crypto', symbolUpper, undefined, undefined, 1) // Only check for 1 record to speed up
      isDbEmpty = existingData.length === 0
    } catch (err) {
      console.error(`[CRYPTO API] Error checking DB for ${symbolUpper}, assuming empty and fetching:`, err)
      isDbEmpty = true // If check fails, assume empty and fetch data
    }

    // Fetch from Binance API
    console.log(`[CRYPTO API] Fetching from Binance: ${symbolUpper}`)
    const price = await fetchBinancePrice(symbolUpper)
    console.log(`[CRYPTO API] Binance returned: ${symbolUpper}, price=${price}`)
    
    if (price === null) {
      console.error(`[CRYPTO API] Price is null for ${symbolUpper}`)
      return NextResponse.json(
        { error: `Price not found for symbol: ${symbol}` },
        { status: 404 }
      )
    }

    // If DB is empty, fetch all historical data and store it
    if (isDbEmpty) {
      console.log(`[CRYPTO API] DB is empty for ${symbolUpper}, fetching full historical data`)
      const historicalData = await fetchBinanceHistoricalData(symbolUpper)
      
      if (historicalData && historicalData.length > 0) {
        // Convert to database format
        const records = historicalData.map(data => ({
          date: data.date,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: data.volume,
          adjusted_close: null,
          change_pct: null,
        }))
        
        // Store all historical data
        try {
          const storeResult = await insertHistoricalData('crypto', symbolUpper, records, 'binance')
          console.log(`[CRYPTO API] Stored full history for ${symbolUpper}: ${storeResult.inserted} inserted, ${storeResult.skipped} skipped`)
          
          // Invalidate cache when new data is stored
          if (storeResult.inserted > 0) {
            const historicalPattern = generateHistoricalInvalidationPattern('crypto', symbolUpper)
            cacheManager.deletePattern(historicalPattern)
            console.log(`[CRYPTO API] 🗑️  Invalidated cache for ${symbolUpper}`)
          }
        } catch (err) {
          console.error(`[CRYPTO API] Failed to store historical data for ${symbolUpper}:`, err)
        }
      }
    } else {
      // DB has data, just store today's price
      const priceRecord = {
        date: today,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: null,
        adjusted_close: null,
        change_pct: null,
      }
      
      console.log(`[CRYPTO API] Storing in DB: ${symbolUpper}, date=${today}, price=${price}`)
      try {
        const storeResult = await insertHistoricalData('crypto', symbolUpper, [priceRecord], 'binance')
        console.log(`[CRYPTO API] ✅ STORED: ${symbolUpper}, date=${today}, price=${price}, inserted=${storeResult.inserted}, skipped=${storeResult.skipped}`)
        
        // Invalidate cache when new data is stored
        if (storeResult.inserted > 0) {
          const invalidationKeys = generateInvalidationKeys('crypto', symbolUpper, today)
          invalidationKeys.forEach(key => cacheManager.delete(key))
          const historicalPattern = generateHistoricalInvalidationPattern('crypto', symbolUpper)
          cacheManager.deletePattern(historicalPattern)
          console.log(`[CRYPTO API] 🗑️  Invalidated cache for ${symbolUpper}`)
        }
      } catch (err) {
        console.error(`[CRYPTO API] ❌ STORAGE FAILED: ${symbolUpper}, date=${today}, price=${price}`, err)
      }
    }

    const response = {
      symbol: symbolUpper,
      price,
      date: today,
      source: 'api',
    }
    
    // Cache the response
    cacheManager.set(cacheKey, response, 'crypto', cacheContext)
    
    console.log(`[CRYPTO API] Returning response: ${JSON.stringify(response)}`)
    return NextResponse.json(response, {
      headers: {
        'X-Cache': 'MISS',
      },
    })
  } catch (error) {
    console.error(`[CRYPTO API] ❌ ERROR:`, error)
    return NextResponse.json(
      { error: 'Failed to fetch price from Binance', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

