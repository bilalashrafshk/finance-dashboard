import { NextRequest, NextResponse } from 'next/server'
import { calculateRiskMetrics, type RiskMetrics, type BandParams, type RiskWeights } from '@/lib/eth-analysis'
import { DEFAULT_FAIR_VALUE_BAND_PARAMS, DEFAULT_RISK_WEIGHTS } from '@/lib/config/app.config'
import { cacheManager } from '@/lib/cache/cache-manager'
import { generateRiskMetricsCacheKey } from '@/lib/cache/cache-utils'

/**
 * Generate cache key from request parameters
 */
function generateCacheKey(
  bandParams: BandParams,
  cutoffDate: string | null,
  riskWeights: RiskWeights
): string {
  return generateRiskMetricsCacheKey(bandParams, cutoffDate, riskWeights)
}

/**
 * Serialize RiskMetrics for JSON response
 * Dates need to be converted to ISO strings for JSON serialization
 */
function serializeRiskMetrics(metrics: RiskMetrics): any {
  return {
    ...metrics,
    dates: metrics.dates.map((date) => date.toISOString()),
  }
}

// Track API calls for logging
let apiRequestCounter = 0
const apiRequestLog: Array<{ id: number; timestamp: string; cacheKey: string; cacheStatus: string }> = []

function logApiRequest(cacheKey: string, cacheStatus: string) {
  const id = ++apiRequestCounter
  const timestamp = new Date().toISOString()
  const logEntry = { id, timestamp, cacheKey: cacheKey.substring(0, 100), cacheStatus }
  apiRequestLog.push(logEntry)

  // Keep only last 50 entries
  if (apiRequestLog.length > 50) {
    apiRequestLog.shift()
  }



  // Make log accessible globally for debugging
  if (typeof global !== 'undefined') {
    (global as any).__apiRequestLog = apiRequestLog
      // Helper function to view logs
      ; (global as any).getApiRequestLog = () => {
        console.table(apiRequestLog)
        return apiRequestLog
      }
      ; (global as any).clearApiRequestLog = () => {
        apiRequestLog.length = 0
        apiRequestCounter = 0

      }
  }
}

export async function GET(request: NextRequest) {
  const requestStartTime = Date.now()
  try {
    const { searchParams } = new URL(request.url)

    // Parse band parameters (default if not provided)
    const bandParams: BandParams = searchParams.has('bandParams')
      ? JSON.parse(searchParams.get('bandParams')!)
      : DEFAULT_FAIR_VALUE_BAND_PARAMS

    // Parse cutoff date
    const cutoffDateParam = searchParams.get('cutoffDate')
    const cutoffDate: Date | null = cutoffDateParam ? new Date(cutoffDateParam) : null

    // Parse risk weights (default if not provided)
    const riskWeights: RiskWeights = searchParams.has('riskWeights')
      ? JSON.parse(searchParams.get('riskWeights')!)
      : DEFAULT_RISK_WEIGHTS

    // Generate cache key
    const cacheKey = generateCacheKey(
      bandParams,
      cutoffDateParam,
      riskWeights
    )

    // Check cache using centralized cache manager
    const cacheContext = { refresh: false }
    const { data: metrics, fromCache } = await cacheManager.getOrSet(
      cacheKey,
      async () => {

        const fetchStartTime = Date.now()
        const result = await calculateRiskMetrics(bandParams, cutoffDate, riskWeights)
        const fetchTime = Date.now() - fetchStartTime

        return result
      },
      'risk-metrics',
      cacheContext
    )

    const responseTime = Date.now() - requestStartTime
    logApiRequest(cacheKey, fromCache ? `HIT (${responseTime}ms)` : `MISS (${responseTime}ms)`)

    return NextResponse.json(serializeRiskMetrics(metrics), {
      headers: {
        'X-Cache': fromCache ? 'HIT' : 'MISS',
        'X-Request-Id': apiRequestCounter.toString(),
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (error) {
    const errorTime = Date.now() - requestStartTime
    console.error(`[API Route #${apiRequestCounter}] ERROR after ${errorTime}ms:`, error)
    return NextResponse.json(
      {
        error: 'Failed to fetch risk metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

