import { NextRequest, NextResponse } from 'next/server'
import { getLatestPriceFromStockAnalysis, fetchStockAnalysisData } from '@/lib/portfolio/stockanalysis-api'
import { getTodayPriceFromDatabase, getHistoricalDataWithMetadata, insertHistoricalData } from '@/lib/portfolio/db-client'
import { isMarketClosed, getTodayInMarketTimezone } from '@/lib/portfolio/market-hours'
import { fetchPSXBidPrice } from '@/lib/portfolio/psx-api'
import { cacheManager } from '@/lib/cache/cache-manager'
import { generatePriceCacheKey, generateHistoricalCacheKey, generateInvalidationKeys, generateHistoricalInvalidationPattern } from '@/lib/cache/cache-utils'
import { fetchAndStoreDividends } from '@/lib/portfolio/dividend-fetcher'

/**
 * Unified PK Equity Price API Route
 * 
 * GET /api/pk-equity/price?ticker=PTC
 * GET /api/pk-equity/price?ticker=PTC&date=2024-01-15
 * GET /api/pk-equity/price?ticker=PTC&startDate=2024-01-01&endDate=2024-01-31
 * GET /api/pk-equity/price?ticker=PTC&refresh=true
 * 
 * Fetches current or historical price data for PK equity assets.
 * - Checks database first (if market closed and today's data exists)
 * - Fetches from StockAnalysis.com API if not in database
 * - Falls back to PSX scraping if API fails
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
  
  // Get base URL from request for internal API calls
  const baseUrl = request.nextUrl.origin

  if (!ticker) {
    return NextResponse.json(
      { error: 'Ticker parameter is required' },
      { status: 400 }
    )
  }

  try {
    const tickerUpper = ticker.toUpperCase()
    const today = getTodayInMarketTimezone('PSX')

    // Handle date range query
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
      }, {
        headers: {
          'X-Cache': fromCache ? 'HIT' : 'MISS',
        },
      })
    }

    // Handle specific date query
    if (date) {
      const cacheKey = generatePriceCacheKey('pk-equity', tickerUpper, date, refresh)
      const cacheContext = { isHistorical: true, date, refresh, marketClosed: isMarketClosed('PSX') }
      
      const { data: cachedData, fromCache } = await cacheManager.getOrSet(
        cacheKey,
        async () => {
          const { data } = await getHistoricalDataWithMetadata('pk-equity', tickerUpper, date, date)
          return data
        },
        'pk-equity',
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

      // Date not in database - would need to fetch historical data
      return NextResponse.json(
        { error: `Price data not found for date: ${date}` },
        { status: 404 }
      )
    }

    // Handle current price query
    const cacheKey = generatePriceCacheKey('pk-equity', tickerUpper, today, refresh)
    const marketClosed = isMarketClosed('PSX')
    const cacheContext = { refresh, marketClosed }
    
    // Check cache first
    const cachedResponse = cacheManager.get<any>(cacheKey)
    if (cachedResponse && !refresh) {
      console.log(`[PK Equity API] Cache HIT: ${tickerUpper}`)
      return NextResponse.json(cachedResponse, {
        headers: {
          'X-Cache': 'HIT',
        },
      })
    }
    
    // Check if latest date in DB equals today
    let latestStoredDate: string | null = null
    try {
      const { latestStoredDate: latestDate } = await getHistoricalDataWithMetadata('pk-equity', tickerUpper, undefined, undefined, 1)
      latestStoredDate = latestDate
    } catch (err) {
      console.error(`[PK Equity API] Error checking latest date for ${tickerUpper}:`, err)
    }
    
    // If latest date equals today, return today's price from DB
    if (latestStoredDate === today && !refresh) {
      const todayPrice = await getTodayPriceFromDatabase('pk-equity', tickerUpper, today)
      if (todayPrice !== null) {
        const response = {
          ticker: tickerUpper,
          price: todayPrice,
          date: today,
          source: 'database',
        }
        cacheManager.set(cacheKey, response, 'pk-equity', cacheContext)
        return NextResponse.json(response, {
          headers: {
            'X-Cache': 'MISS',
          },
        })
      }
    }
    
    // Latest date is not today - trigger gap detection and wait for data to be fetched
    // This leverages gap detection automatically and waits for data to be available
    console.log(`[PK Equity API] Latest date (${latestStoredDate}) is not today (${today}), triggering gap detection and waiting for data`)
    
    try {
      // Call historical-data endpoint which will fetch data if needed and wait for completion
      const histResponse = await fetch(`${baseUrl}/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(tickerUpper)}&market=PSX&limit=1`)
      
      if (histResponse.ok) {
        const histData = await histResponse.json()
        
        if (histData.data && histData.data.length > 0) {
          // Get the latest record (most recent date)
          const latestRecord = histData.data[histData.data.length - 1]
          
          // Get today's price if available, otherwise use latest
          const todayPrice = histData.data.find((r: any) => r.date === today)
          const priceRecord = todayPrice || latestRecord
          
          const response = {
            ticker: tickerUpper,
            price: priceRecord.close,
            date: priceRecord.date,
            source: 'database',
          }
          
          // Cache the response
          cacheManager.set(cacheKey, response, 'pk-equity', cacheContext)
          
          return NextResponse.json(response, {
            headers: {
              'X-Cache': 'MISS',
              'X-Delegated': 'historical-data',
            },
          })
        }
      }
    } catch (error) {
      console.error(`[PK Equity API] Error getting price via historical-data for ${tickerUpper}:`, error)
      // Fall through to error response
    }
    
    // If delegation fails, return error
    return NextResponse.json(
      { error: `Price not found for ticker: ${ticker}` },
      { status: 404 }
    )
  } catch (error) {
    console.error('Error in PK equity price API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch price from PSX', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

