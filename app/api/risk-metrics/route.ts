import { NextRequest, NextResponse } from 'next/server'
import { calculateRiskMetrics, type RiskMetrics, type BandParams, type RiskWeights } from '@/lib/eth-analysis'
import { DEFAULT_FAIR_VALUE_BAND_PARAMS, DEFAULT_RISK_WEIGHTS } from '@/lib/config/app.config'

// In-memory cache with TTL
interface CacheEntry {
  data: RiskMetrics
  timestamp: number
}

// Cache storage: key -> cache entry
const cache = new Map<string, CacheEntry>()

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes in milliseconds

// Clean up old cache entries periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      cache.delete(key)
    }
  }
}, 10 * 60 * 1000) // Run cleanup every 10 minutes

/**
 * Generate cache key from request parameters
 */
function generateCacheKey(
  bandParams: BandParams,
  cutoffDate: string | null,
  riskWeights: RiskWeights
): string {
  // Create a unique key from all parameters that affect the result
  const params = {
    bandParams: JSON.stringify(bandParams),
    cutoffDate: cutoffDate || 'null',
    riskWeights: JSON.stringify(riskWeights),
  }
  return JSON.stringify(params)
}

/**
 * Check if cache entry is still valid
 */
function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL
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

export async function GET(request: NextRequest) {
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

    // Check cache
    const cachedEntry = cache.get(cacheKey)
    if (cachedEntry && isCacheValid(cachedEntry)) {
      return NextResponse.json(serializeRiskMetrics(cachedEntry.data), {
        headers: {
          'X-Cache': 'HIT',
          'X-Cache-Age': Math.floor((Date.now() - cachedEntry.timestamp) / 1000).toString(),
          'Cache-Control': 'public, max-age=300',
        },
      })
    }

    // Cache miss or expired - fetch fresh data
    const metrics = await calculateRiskMetrics(bandParams, cutoffDate, riskWeights)

    // Store in cache
    cache.set(cacheKey, {
      data: metrics,
      timestamp: Date.now(),
    })

    return NextResponse.json(serializeRiskMetrics(metrics), {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch risk metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

