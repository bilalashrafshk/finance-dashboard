/**
 * In-memory cache for market cycles
 * Caches all cycles except the last one (current cycle)
 * Cache duration: 10 days
 */

import type { MarketCycle } from '@/lib/algorithms/market-cycle-detection'

interface CachedCycles {
  cycles: MarketCycle[]
  timestamp: number
  assetType: string
  symbol: string
}

// In-memory cache store
const cyclesCache = new Map<string, CachedCycles>()

// Cache duration: 10 days in milliseconds
const CACHE_DURATION_MS = 10 * 24 * 60 * 60 * 1000

/**
 * Generate cache key from asset type and symbol
 */
function getCacheKey(assetType: string, symbol: string): string {
  return `${assetType}:${symbol}`
}

/**
 * Get cached cycles (excluding the last one which is current)
 */
export function getCachedCycles(assetType: string, symbol: string): MarketCycle[] | null {
  const key = getCacheKey(assetType, symbol)
  const cached = cyclesCache.get(key)
  
  if (!cached) {
    return null
  }
  
  // Check if cache is still valid
  const now = Date.now()
  const age = now - cached.timestamp
  
  if (age > CACHE_DURATION_MS) {
    // Cache expired, remove it
    cyclesCache.delete(key)
    return null
  }
  
  return cached.cycles
}

/**
 * Cache cycles (excluding the last one which is current)
 */
export function setCachedCycles(
  assetType: string,
  symbol: string,
  cycles: MarketCycle[]
): void {
  const key = getCacheKey(assetType, symbol)
  
  // Cache all cycles except the last one (current cycle)
  const cyclesToCache = cycles.length > 1 
    ? cycles.slice(0, -1) // All except last
    : [] // If only one cycle, don't cache it (it's current)
  
  cyclesCache.set(key, {
    cycles: cyclesToCache,
    timestamp: Date.now(),
    assetType,
    symbol
  })
}

/**
 * Clear cache for a specific asset
 */
export function clearCache(assetType: string, symbol: string): void {
  const key = getCacheKey(assetType, symbol)
  cyclesCache.delete(key)
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  cyclesCache.clear()
}

