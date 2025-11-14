import { NextRequest, NextResponse } from 'next/server'
import { getLatestPriceFromStockAnalysis, fetchStockAnalysisData } from '@/lib/portfolio/stockanalysis-api'
import { getTodayPriceFromDatabase, getHistoricalDataWithMetadata, insertHistoricalData } from '@/lib/portfolio/db-client'
import { isMarketClosed, getTodayInMarketTimezone } from '@/lib/portfolio/market-hours'
import { cacheManager } from '@/lib/cache/cache-manager'
import { generatePriceCacheKey, generateHistoricalCacheKey, generateInvalidationKeys, generateHistoricalInvalidationPattern } from '@/lib/cache/cache-utils'

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
    const cacheKey = generatePriceCacheKey('us-equity', tickerUpper, today, refresh)
    const marketClosed = isMarketClosed('US')
    const cacheContext = { refresh, marketClosed }
    
    // Check cache first
    const cachedResponse = cacheManager.get<any>(cacheKey)
    if (cachedResponse && !refresh) {
      console.log(`[US Equity API] Cache HIT: ${tickerUpper}`)
      return NextResponse.json(cachedResponse, {
        headers: {
          'X-Cache': 'HIT',
        },
      })
    }
    
    // Check database first if not forcing refresh
    if (!refresh) {
      const todayPrice = await getTodayPriceFromDatabase('us-equity', tickerUpper, today)
      
      // If market is closed and we have today's data, use it
      if (marketClosed && todayPrice !== null) {
        const response = {
          ticker: tickerUpper,
          price: todayPrice,
          date: today,
          source: 'database',
        }
        // Cache the response
        cacheManager.set(cacheKey, response, 'us-equity', cacheContext)
        return NextResponse.json(response, {
          headers: {
            'X-Cache': 'MISS',
          },
        })
      }
    }

    // Check if database is empty - if so, fetch all historical data
    // Handle errors gracefully - if check fails, assume DB is empty and fetch data
    let isDbEmpty = true
    try {
      const { data: existingData } = await getHistoricalDataWithMetadata('us-equity', tickerUpper, undefined, undefined, 1) // Only check for 1 record to speed up
      isDbEmpty = existingData.length === 0
    } catch (err) {
      console.error(`[US Equity API] Error checking DB for ${tickerUpper}, assuming empty and fetching:`, err)
      isDbEmpty = true // If check fails, assume empty and fetch data
    }

    // Fetch from StockAnalysis.com API
    const priceData = await getLatestPriceFromStockAnalysis(tickerUpper, 'US')
    
    if (!priceData) {
      return NextResponse.json(
        { error: `Price not found for ticker: ${ticker}` },
        { status: 404 }
      )
    }

    // If DB is empty, fetch all historical data and store it
    if (isDbEmpty) {
      console.log(`[US Equity API] DB is empty for ${tickerUpper}, fetching full historical data`)
      const historicalData = await fetchStockAnalysisData(tickerUpper, 'US')
      
      if (historicalData && historicalData.length > 0) {
        // Convert to database format
        const records = historicalData.map(data => ({
          date: data.t, // StockAnalysis uses 't' for date
          open: data.o,
          high: data.h,
          low: data.l,
          close: data.c,
          volume: data.v || null,
          adjusted_close: data.a || null,
          change_pct: data.ch || null,
        }))
        
        // Store all historical data
        try {
          const storeResult = await insertHistoricalData('us-equity', tickerUpper, records, 'stockanalysis')
          console.log(`[US Equity API] Stored full history for ${tickerUpper}: ${storeResult.inserted} inserted, ${storeResult.skipped} skipped`)
        } catch (err) {
          console.error(`[US Equity API] Failed to store historical data for ${tickerUpper}:`, err)
        }
      }
    } else {
      // DB has data, just store today's price
      const priceRecord = {
        date: priceData.date,
        open: priceData.price,
        high: priceData.price,
        low: priceData.price,
        close: priceData.price,
        volume: null,
        adjusted_close: null,
        change_pct: null,
      }
      
      try {
        const storeResult = await insertHistoricalData('us-equity', tickerUpper, [priceRecord], 'stockanalysis')
        console.log(`[US Equity API] Stored price for ${tickerUpper}: ${storeResult.inserted} inserted, ${storeResult.skipped} skipped`)
      } catch (err) {
        console.error(`[US Equity API] Failed to store US equity price for ${tickerUpper}:`, err)
      }
    }

    const response = {
      ticker: tickerUpper,
      price: priceData.price,
      date: priceData.date,
      source: 'stockanalysis_api',
    }
    
    // Cache the response and invalidate related cache
    cacheManager.set(cacheKey, response, 'us-equity', cacheContext)
    const invalidationKeys = generateInvalidationKeys('us-equity', tickerUpper, priceData.date)
    invalidationKeys.forEach(key => cacheManager.delete(key))
    const historicalPattern = generateHistoricalInvalidationPattern('us-equity', tickerUpper)
    cacheManager.deletePattern(historicalPattern)
    
    return NextResponse.json(response, {
      headers: {
        'X-Cache': 'MISS',
      },
    })
  } catch (error) {
    console.error('Error in US equity price API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch price from StockAnalysis.com', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
