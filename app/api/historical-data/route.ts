import { NextRequest, NextResponse } from 'next/server'
import { 
  getHistoricalDataWithMetadata,
  insertHistoricalData,
  type HistoricalPriceRecord 
} from '@/lib/portfolio/db-client'
import { fetchStockAnalysisData } from '@/lib/portfolio/stockanalysis-api'
import { fetchBinanceHistoricalData } from '@/lib/portfolio/binance-historical-api'
import { fetchSCSTradeData } from '@/lib/portfolio/scstrade-api'
import { retryWithBackoff } from '@/lib/portfolio/retry-utils'
import { getTodayInMarketTimezone, isMarketClosed } from '@/lib/portfolio/market-hours'
import type { StockAnalysisDataPoint } from '@/lib/portfolio/stockanalysis-api'
import type { BinanceHistoricalDataPoint } from '@/lib/portfolio/binance-historical-api'
import type { InvestingHistoricalDataPoint } from '@/lib/portfolio/investing-client-api'

/**
 * Historical Data API Route
 * 
 * GET /api/historical-data?assetType=pk-equity&symbol=PTC&market=PSX
 * 
 * Flow:
 * 1. Check database for stored data
 * 2. If exists, return stored data immediately
 * 3. Detect gaps between last stored date and today (or empty DB)
 * 4. Fetch missing data from external API (blocking - waits for completion)
 * 5. Reload data from DB and return updated data
 * 
 * Gap Detection:
 * - Automatically detects missing trading days between last stored date and today
 * - Handles empty DB case by fetching full history
 * - Only triggers for server-side fetchable assets (pk-equity, us-equity, crypto)
 * - Excludes weekends from trading day calculations
 * - Waits for fetch to complete before returning response
 */

function convertStockAnalysisToRecord(data: StockAnalysisDataPoint): HistoricalPriceRecord {
  return {
    date: data.t, // StockAnalysis uses 't' for date
    open: data.o,
    high: data.h,
    low: data.l,
    close: data.c,
    volume: data.v || null, // Volume is included from StockAnalysis
    adjusted_close: data.a || null,
    change_pct: data.ch || null,
  }
}

function convertBinanceToRecord(data: BinanceHistoricalDataPoint): HistoricalPriceRecord {
  return {
    date: data.date,
    open: data.open,
    high: data.high,
    low: data.low,
    close: data.close,
    volume: data.volume,
    adjusted_close: null,
    change_pct: null,
  }
}

function convertInvestingToRecord(data: InvestingHistoricalDataPoint): HistoricalPriceRecord {
  return {
    date: data.date,
    open: data.open,
    high: data.high,
    low: data.low,
    close: data.close,
    volume: data.volume,
    adjusted_close: null,
    change_pct: null,
  }
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6 // 0 = Sunday, 6 = Saturday
}

/**
 * Calculate the number of trading days between two dates (excluding weekends)
 * This is a simple approximation - doesn't account for market holidays
 */
function calculateTradingDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  
  if (start >= end) {
    return 0
  }
  
  let tradingDays = 0
  const current = new Date(start)
  
  while (current <= end) {
    if (!isWeekend(current)) {
      tradingDays++
    }
    current.setDate(current.getDate() + 1)
  }
  
  return tradingDays
}

/**
 * Function to fetch and store new data (blocking - waits for completion)
 */
async function fetchNewDataInBackground(
  assetType: string,
  symbol: string,
  market: 'PSX' | 'US' | null,
  fetchStartDate: string | undefined,
  today: string
): Promise<void> {
  try {
    // Check if market is closed and we're trying to fetch today's data
    // If market is closed, today's data won't be available yet, so skip fetching if only today is requested
    const marketForCheck = assetType === 'pk-equity' ? 'PSX' : assetType === 'us-equity' ? 'US' : null
    if (marketForCheck) {
      const marketClosed = isMarketClosed(marketForCheck)
      const todayInMarketTimezone = getTodayInMarketTimezone(marketForCheck)
      
      // If market is closed and we're only trying to fetch today's data, skip it
      // (Today's data won't be available until market closes)
      // But if we're fetching a range that includes historical dates, proceed (they might be missing)
      if (marketClosed && fetchStartDate === todayInMarketTimezone) {
        console.log(`[Gap Detection] ${assetType}/${symbol}: Market is closed, skipping fetch for today's data only (${todayInMarketTimezone})`)
        return
      }
    }
    
    let newData: HistoricalPriceRecord[] = []
    let source: 'scstrade' | 'stockanalysis' | 'binance' | 'investing' = 'stockanalysis'

    if (assetType === 'pk-equity') {
      // Try StockAnalysis first (primary source - fetches full 10Y history to fill all gaps including middle gaps)
      const apiData = await retryWithBackoff(
        () => fetchStockAnalysisData(symbol, 'PSX'),
        3, // 3 retries
        1000, // 1 second initial delay
        10000 // 10 second max delay
      )
      
      if (apiData) {
        const filtered = fetchStartDate
          ? apiData.filter(d => d.t >= fetchStartDate)
          : apiData
        newData = filtered.map(convertStockAnalysisToRecord)
        source = 'stockanalysis'
      }
      
      // Check for missing dates in the requested range and try SCSTrade to fill them
      if (fetchStartDate && newData.length > 0) {
        // Calculate expected trading days in the range
        const expectedTradingDays = calculateTradingDaysBetween(fetchStartDate, today)
        const receivedDates = new Set(newData.map(d => d.date))
        
        // Find missing dates (only check if we have fewer dates than expected trading days)
        if (receivedDates.size < expectedTradingDays) {
          // Generate list of expected trading dates
          const expectedDates: string[] = []
          const start = new Date(fetchStartDate)
          const end = new Date(today)
          let current = new Date(start)
          
          while (current <= end) {
            const dayOfWeek = current.getDay()
            // Skip weekends (0 = Sunday, 6 = Saturday)
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
              const dateStr = current.toISOString().split('T')[0]
              if (!receivedDates.has(dateStr)) {
                expectedDates.push(dateStr)
              }
            }
            current.setDate(current.getDate() + 1)
          }
          
          // If there are missing dates, try SCSTrade to fill them
          if (expectedDates.length > 0) {
            try {
              const scstradeData = await retryWithBackoff(
                () => fetchSCSTradeData(symbol, fetchStartDate, today),
                2, // 2 retries for SCSTrade
                1000,
                5000
              )
              
              if (scstradeData && scstradeData.length > 0) {
                // Merge SCSTrade data with StockAnalysis data, avoiding duplicates
                const scstradeDates = new Set(scstradeData.map(d => d.date))
                const stockAnalysisOnly = newData.filter(d => !scstradeDates.has(d.date))
                newData = [...stockAnalysisOnly, ...scstradeData]
                // Mark source as mixed if we have data from both
                if (stockAnalysisOnly.length > 0) {
                  source = 'stockanalysis' // Primary source, but SCSTrade filled gaps
                } else {
                  source = 'scstrade'
                }
              }
            } catch (scstradeError) {
              console.error(`[${assetType}-${symbol}] SCSTrade fallback for missing dates failed:`, scstradeError)
            }
          }
        }
      }
      
      // Fallback to SCSTrade if StockAnalysis completely failed or returned no data
      if (newData.length === 0) {
        try {
          const scstradeData = await retryWithBackoff(
            () => fetchSCSTradeData(symbol, fetchStartDate, today),
            2, // 2 retries for SCSTrade
            1000,
            5000
          )
          
          if (scstradeData && scstradeData.length > 0) {
            newData = scstradeData
            source = 'scstrade'
          }
        } catch (scstradeError) {
          console.error(`[${assetType}-${symbol}] SCSTrade fallback also failed:`, scstradeError)
        }
      }
    } else if (assetType === 'us-equity') {
      // US equity still uses StockAnalysis (no SCSTrade for US stocks)
      console.log(`[${assetType}-${symbol}] Fetching from StockAnalysis API (full 10Y history, will filter to dates >= ${fetchStartDate || 'beginning'})`)
      const apiData = await retryWithBackoff(
        () => fetchStockAnalysisData(symbol, 'US'),
        3, // 3 retries
        1000, // 1 second initial delay
        10000 // 10 second max delay
      )
      if (apiData) {
        console.log(`[${assetType}-${symbol}] Received ${apiData.length} records from StockAnalysis API`)
        const filtered = fetchStartDate
          ? apiData.filter(d => d.t >= fetchStartDate)
          : apiData
        console.log(`[${assetType}-${symbol}] Filtered to ${filtered.length} new records (dates >= ${fetchStartDate || 'beginning'})`)
        newData = filtered.map(convertStockAnalysisToRecord)
        source = 'stockanalysis'
      }
    } else if (assetType === 'crypto') {
      // Binance API supports date ranges
      // If no stored data, fetch from 2010-01-01 to get all available historical data
      const cryptoStartDate = fetchStartDate || '2010-01-01'
      console.log(`[${assetType}-${symbol}] Fetching from Binance API (dates: ${cryptoStartDate} to ${today})`)
      const apiData = await retryWithBackoff(
        () => fetchBinanceHistoricalData(symbol, cryptoStartDate, today),
        3,
        1000,
        10000
      )
      if (apiData) {
        console.log(`[${assetType}-${symbol}] Received ${apiData.length} records from Binance API`)
        newData = apiData.map(convertBinanceToRecord)
        source = 'binance'
      }
    } else if (assetType === 'spx500') {
      // For indices, we can't fetch server-side due to Cloudflare blocking
      // Return a flag indicating client should fetch and store
      // The client will fetch using client-side API and send to /api/historical-data/store
      console.log(`[${assetType}] Index data must be fetched client-side (Cloudflare protection). Background fetch skipped - client should handle.`)
      // Don't fetch here - let client handle it
    } else if (assetType === 'kse100') {
      // For indices, we can't fetch server-side due to Cloudflare blocking
      // Return a flag indicating client should fetch and store
      // The client will fetch using client-side API and send to /api/historical-data/store
      console.log(`[${assetType}] Index data must be fetched client-side (Cloudflare protection). Background fetch skipped - client should handle.`)
      // Don't fetch here - let client handle it
    } else if (assetType === 'metals') {
      // For metals, we can't fetch server-side due to Cloudflare blocking
      // Return a flag indicating client should fetch and store
      // The client will fetch using client-side API and send to /api/historical-data/store
      console.log(`[${assetType}-${symbol}] Metals data must be fetched client-side (Cloudflare protection). Background fetch skipped - client should handle.`)
      // Don't fetch here - let client handle it
    }

    if (newData.length > 0) {
      await insertHistoricalData(assetType, symbol, newData, source)
    }
  } catch (error) {
    console.error(`Background fetch error for ${assetType}-${symbol}:`, error)
  }
}

// Track API calls for logging
let historicalDataRequestCounter = 0
const historicalDataRequestLog: Array<{ id: number; timestamp: string; assetType: string; symbol: string; responseTime: number }> = []

function logHistoricalDataRequest(assetType: string, symbol: string, responseTime: number) {
  const id = ++historicalDataRequestCounter
  const timestamp = new Date().toISOString()
  const logEntry = { id, timestamp, assetType, symbol, responseTime }
  historicalDataRequestLog.push(logEntry)
  
  // Keep only last 100 entries
  if (historicalDataRequestLog.length > 100) {
    historicalDataRequestLog.shift()
  }
  
  console.log(`[Historical Data API #${id}] ${timestamp} - ${assetType}/${symbol} (${responseTime}ms)`)
  
  // Make log accessible globally
  if (typeof global !== 'undefined') {
    (global as any).__historicalDataRequestLog = historicalDataRequestLog
    ;(global as any).getHistoricalDataRequestLog = () => {
      console.table(historicalDataRequestLog)
      return historicalDataRequestLog
    }
  }
}

export async function GET(request: NextRequest) {
  const requestStartTime = Date.now()
  const searchParams = request.nextUrl.searchParams
  const assetType = searchParams.get('assetType')
  const symbol = searchParams.get('symbol')
  const market = searchParams.get('market') as 'PSX' | 'US' | null
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : undefined

  if (!assetType || !symbol) {
    return NextResponse.json(
      { error: 'assetType and symbol parameters are required' },
      { status: 400 }
    )
  }

  try {
    // Step 1: Check cache first, then database
    const { generateHistoricalCacheKey } = await import('@/lib/cache/cache-utils')
    const { cacheManager } = await import('@/lib/cache/cache-manager')
    const cacheKey = generateHistoricalCacheKey(assetType as any, symbol, undefined, undefined, limit)
    const cacheContext = { isHistorical: true }
    
    const { data: storedData, latestStoredDate } = await cacheManager.getOrSet(
      cacheKey,
      async () => {
        const result = await getHistoricalDataWithMetadata(assetType, symbol, undefined, undefined, limit)
        return result
      },
      assetType as any,
      cacheContext
    )
    
    const responseTime = Date.now() - requestStartTime
    logHistoricalDataRequest(assetType, symbol, responseTime)

    // Step 2: Determine what dates we need to fetch
    const today = new Date().toISOString().split('T')[0]
    
    // Check if today's date exists in stored data
    const todayRecord = storedData.data.find((r: any) => r.date === today)
    const hasTodayData = !!todayRecord
    
    const fetchStartDate = storedData.latestStoredDate 
      ? new Date(new Date(storedData.latestStoredDate).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Day after last stored
      : undefined // No stored data, fetch from beginning

    // Step 3: Gap Detection - Check for missing dates and trigger fetch
    // Only fetch for asset types that support server-side fetching (pk-equity, us-equity, crypto)
    const supportsServerSideFetch = assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto'
    
    if (supportsServerSideFetch) {
      // Get today's date in the appropriate market timezone
      const marketForTimezone = assetType === 'pk-equity' ? 'PSX' : assetType === 'us-equity' ? 'US' : 'crypto'
      const todayInMarketTimezone = getTodayInMarketTimezone(marketForTimezone)
      
      // Handle both cases: empty DB (fetchStartDate is undefined) and gaps (fetchStartDate exists)
      if (!storedData.latestStoredDate || (fetchStartDate && fetchStartDate <= todayInMarketTimezone)) {
        let shouldFetch = false
        let tradingDays = 0
        
        if (!storedData.latestStoredDate) {
          // DB is empty - fetch full history
          shouldFetch = true
          console.log(`[Gap Detection] ${assetType}/${symbol}: DB is empty, will fetch full history`)
        } else if (fetchStartDate) {
          // DB has data but there are gaps
          tradingDays = calculateTradingDaysBetween(fetchStartDate, todayInMarketTimezone)
          if (tradingDays > 0) {
            shouldFetch = true
            console.log(`[Gap Detection] ${assetType}/${symbol}: Detected ${tradingDays} potential trading days missing between ${fetchStartDate} and ${todayInMarketTimezone}`)
          }
        }
        
        if (shouldFetch) {
          // Fetch data (blocking - await completion)
          await fetchNewDataInBackground(assetType, symbol, market, fetchStartDate, todayInMarketTimezone)
          console.log(`[Gap Detection] ${assetType}/${symbol}: Fetch completed successfully`)
          
          // Invalidate cache to ensure fresh data
          cacheManager.delete(cacheKey)
          
          // Reload data from DB after fetch
          const { data: updatedData } = await getHistoricalDataWithMetadata(assetType, symbol, undefined, undefined, limit)
          storedData.data = updatedData
          storedData.latestStoredDate = updatedData.length > 0 
            ? updatedData[updatedData.length - 1].date 
            : null
        }
      }
    }

    // Step 4: Return stored data (after fetch completes if data was fetched)
    const cached = cacheManager.get(cacheKey)
    const fromCache = cached !== null
    
    return NextResponse.json({
      assetType,
      symbol: symbol.toUpperCase(),
      data: storedData.data,
      count: storedData.data.length,
      storedCount: storedData.data.length,
      newCount: 0,
      latestDate: storedData.data.length > 0 ? storedData.data[storedData.data.length - 1].date : null,
      source: 'database',
    }, {
      headers: {
        'X-Cache': fromCache ? 'HIT' : 'MISS',
      },
    })
  } catch (error: any) {
    console.error(`Error in historical data API for ${assetType}-${symbol}:`, error)
    return NextResponse.json(
      { error: 'Failed to fetch historical data', details: error.message },
      { status: 500 }
    )
  }
}

