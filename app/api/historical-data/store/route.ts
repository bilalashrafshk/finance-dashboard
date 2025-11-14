import { NextRequest, NextResponse } from 'next/server'
import { insertHistoricalData, type HistoricalPriceRecord } from '@/lib/portfolio/db-client'
import type { InvestingHistoricalDataPoint } from '@/lib/portfolio/investing-client-api'
import { cacheManager } from '@/lib/cache/cache-manager'
import { generateInvalidationKeys, generateHistoricalInvalidationPattern } from '@/lib/cache/cache-utils'

/**
 * Store historical data from client-side fetch
 * 
 * POST /api/historical-data/store
 * 
 * Body: {
 *   assetType: string
 *   symbol: string
 *   data: InvestingHistoricalDataPoint[]
 *   source: 'investing'
 * }
 */
// Track store operations for logging
let storeRequestCounter = 0
const storeRequestLog: Array<{ id: number; timestamp: string; assetType: string; symbol: string; records: number; inserted: number; skipped: number }> = []

function logStoreRequest(assetType: string, symbol: string, records: number, inserted: number, skipped: number) {
  const id = ++storeRequestCounter
  const timestamp = new Date().toISOString()
  const logEntry = { id, timestamp, assetType, symbol, records, inserted, skipped }
  storeRequestLog.push(logEntry)
  
  if (storeRequestLog.length > 100) {
    storeRequestLog.shift()
  }
  
  console.log(`[Store API #${id}] ${timestamp} - ${assetType}/${symbol}: ${records} records → inserted: ${inserted}, skipped: ${skipped}`)
  
  if (typeof global !== 'undefined') {
    (global as any).__storeRequestLog = storeRequestLog
    ;(global as any).getStoreRequestLog = () => {
      console.table(storeRequestLog)
      return storeRequestLog
    }
  }
}

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now()
  try {
    const body = await request.json()
    const { assetType, symbol, data, source } = body

    console.log(`[Store API] 📥 Received request for ${assetType}-${symbol}, ${data?.length || 0} records`)

    if (!assetType || !symbol || !data || !Array.isArray(data)) {
      console.error(`[Store API] ❌ Invalid request: assetType=${assetType}, symbol=${symbol}, data is array=${Array.isArray(data)}`)
      return NextResponse.json(
        { error: 'assetType, symbol, and data array are required' },
        { status: 400 }
      )
    }

    if (data.length === 0) {
      console.warn(`[Store API] ⚠️  Empty data array for ${assetType}-${symbol}`)
      logStoreRequest(assetType, symbol, 0, 0, 0)
      return NextResponse.json({
        success: true,
        assetType,
        symbol: symbol.toUpperCase(),
        inserted: 0,
        skipped: 0,
        total: 0,
      })
    }

    // Convert Investing format to database format
    const records: HistoricalPriceRecord[] = data.map((point: InvestingHistoricalDataPoint) => ({
      date: point.date,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume,
      adjusted_close: null,
      change_pct: null,
    }))

    console.log(`[Store API] 🔄 Converting ${records.length} records for ${assetType}-${symbol}`)
    const dates = records.map(r => r.date).join(', ')
    console.log(`[Store API] 📅 Dates to store: ${dates}`)

    // Store in database
    const result = await insertHistoricalData(assetType, symbol.toUpperCase(), records, source || 'investing')
    const responseTime = Date.now() - requestStartTime

    logStoreRequest(assetType, symbol, records.length, result.inserted, result.skipped)
    console.log(`[Store API] ✅ COMPLETED in ${responseTime}ms - ${assetType}/${symbol}: inserted: ${result.inserted}, skipped: ${result.skipped}`)
    
    // Invalidate cache when new data is stored
    if (result.inserted > 0) {
      const insertedDates = records.slice(0, result.inserted).map(r => r.date).join(', ')
      console.log(`[Store API] 📝 INSERTED ${result.inserted} new records for dates: ${insertedDates}`)
      
      // Invalidate cache for all stored dates
      const symbolUpper = symbol.toUpperCase()
      records.slice(0, result.inserted).forEach(record => {
        const invalidationKeys = generateInvalidationKeys(assetType as any, symbolUpper, record.date)
        invalidationKeys.forEach(key => cacheManager.delete(key))
      })
      
      // Also invalidate historical data patterns
      const historicalPattern = generateHistoricalInvalidationPattern(assetType as any, symbolUpper)
      cacheManager.deletePattern(historicalPattern)
      
      console.log(`[Store API] 🗑️  Invalidated cache for ${assetType}/${symbolUpper}`)
    }
    if (result.skipped > 0) {
      console.log(`[Store API] ⏭️  SKIPPED ${result.skipped} records (already exist in DB)`)
    }

    return NextResponse.json({
      success: true,
      assetType,
      symbol: symbol.toUpperCase(),
      inserted: result.inserted,
      skipped: result.skipped,
      total: records.length,
    })
  } catch (error: any) {
    console.error(`[Store API] Error storing historical data:`, error)
    console.error(`[Store API] Error stack:`, error.stack)
    return NextResponse.json(
      { error: 'Failed to store historical data', details: error.message },
      { status: 500 }
    )
  }
}

