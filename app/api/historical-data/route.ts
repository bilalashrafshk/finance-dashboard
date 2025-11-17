import { NextRequest, NextResponse } from 'next/server'
import { 
  getHistoricalDataWithMetadata,
  insertHistoricalData,
  type HistoricalPriceRecord 
} from '@/lib/portfolio/db-client'
import { fetchStockAnalysisData } from '@/lib/portfolio/stockanalysis-api'
import { fetchBinanceHistoricalData } from '@/lib/portfolio/binance-historical-api'
import { retryWithBackoff } from '@/lib/portfolio/retry-utils'
import { getTodayInMarketTimezone } from '@/lib/portfolio/market-hours'
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
 * 3. Detect gaps between last stored date and today
 * 4. Trigger background fetch for missing dates (non-blocking)
 * 5. Return stored data immediately (background fetch runs asynchronously)
 * 
 * Gap Detection:
 * - Automatically detects missing trading days between last stored date and today
 * - Only triggers for server-side fetchable assets (pk-equity, us-equity, crypto)
 * - Excludes weekends from trading day calculations
 * - Runs in background without blocking the API response
 */

function convertStockAnalysisToRecord(data: StockAnalysisDataPoint): HistoricalPriceRecord {
  return {
    date: data.t, // StockAnalysis uses 't' for date
    open: data.o,
    high: data.h,
    low: data.l,
    close: data.c,
    volume: data.v || null,
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
 * Background function to fetch and store new data (non-blocking)
 */
async function fetchNewDataInBackground(
  assetType: string,
  symbol: string,
  market: 'PSX' | 'US' | null,
  fetchStartDate: string | undefined,
  today: string
): Promise<void> {
  try {
    let newData: HistoricalPriceRecord[] = []
    let source: 'stockanalysis' | 'binance' | 'investing' = 'stockanalysis'

    if (assetType === 'pk-equity' || assetType === 'us-equity') {
      // StockAnalysis API doesn't support date ranges, so we fetch all data and filter client-side
      console.log(`[${assetType}-${symbol}] Fetching from StockAnalysis API (full 10Y history, will filter to dates >= ${fetchStartDate || 'beginning'})`)
      const apiData = await retryWithBackoff(
        () => fetchStockAnalysisData(symbol, market || (assetType === 'pk-equity' ? 'PSX' : 'US')),
        3, // 3 retries
        1000, // 1 second initial delay
        10000 // 10 second max delay
      )
      if (apiData) {
        console.log(`[${assetType}-${symbol}] Received ${apiData.length} records from API`)
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

    // Step 3: Gap Detection - Check for missing dates and trigger background fetch
    // Only fetch for asset types that support server-side fetching (pk-equity, us-equity, crypto)
    const supportsServerSideFetch = assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto'
    
    if (supportsServerSideFetch && storedData.latestStoredDate && fetchStartDate) {
      // Get today's date in the appropriate market timezone
      const marketForTimezone = assetType === 'pk-equity' ? 'PSX' : assetType === 'us-equity' ? 'US' : 'crypto'
      const todayInMarketTimezone = getTodayInMarketTimezone(marketForTimezone)
      
      // Only check for gaps if fetchStartDate is before or equal to today
      // This ensures we fetch today's data if it's missing
      if (fetchStartDate <= todayInMarketTimezone) {
        // Calculate approximate trading days between dates (excluding weekends)
        const tradingDays = calculateTradingDaysBetween(fetchStartDate, todayInMarketTimezone)
        
        // If there are potential trading days missing, trigger background fetch
        // We use a threshold of 1 day to avoid unnecessary fetches for same-day requests
        if (tradingDays > 0) {
          console.log(`[Gap Detection] ${assetType}/${symbol}: Detected ${tradingDays} potential trading days missing between ${fetchStartDate} and ${todayInMarketTimezone}`)
          
          // Trigger background fetch (non-blocking - don't await)
          fetchNewDataInBackground(assetType, symbol, market, fetchStartDate, todayInMarketTimezone)
            .then(() => {
              console.log(`[Gap Detection] ${assetType}/${symbol}: Background fetch completed successfully`)
            })
            .catch((error) => {
              console.error(`[Gap Detection] ${assetType}/${symbol}: Background fetch failed:`, error)
            })
        }
      }
    }

    // Step 4: Return stored data immediately (non-blocking response)
    // Background fetch runs asynchronously and doesn't block the response
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

