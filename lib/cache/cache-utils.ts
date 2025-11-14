/**
 * Cache Utilities
 * 
 * Helper functions for cache key generation and management
 */

import type { AssetType } from './cache-config'

/**
 * Generate a cache key for price data
 */
export function generatePriceCacheKey(
  assetType: AssetType,
  symbol: string,
  date?: string | null,
  refresh?: boolean
): string {
  const parts = ['price', assetType, symbol.toUpperCase()]
  
  if (date) {
    parts.push(date)
  }
  
  if (refresh) {
    parts.push('refresh')
  }
  
  return parts.join(':')
}

/**
 * Generate a cache key for historical data
 */
export function generateHistoricalCacheKey(
  assetType: AssetType,
  symbol: string,
  startDate?: string | null,
  endDate?: string | null,
  limit?: number | null
): string {
  const parts = ['historical', assetType, symbol.toUpperCase()]
  
  if (startDate) {
    parts.push(`from:${startDate}`)
  }
  
  if (endDate) {
    parts.push(`to:${endDate}`)
  }
  
  if (limit) {
    parts.push(`limit:${limit}`)
  }
  
  return parts.join(':')
}

/**
 * Generate a cache key for risk metrics
 */
export function generateRiskMetricsCacheKey(
  bandParams: any,
  cutoffDate: string | null,
  riskWeights: any
): string {
  const parts = [
    'risk-metrics',
    `bandParams:${JSON.stringify(bandParams)}`,
    `cutoffDate:${cutoffDate || 'null'}`,
    `riskWeights:${JSON.stringify(riskWeights)}`,
  ]
  
  return parts.join(':')
}

/**
 * Generate a cache key for database queries
 */
export function generateDbQueryCacheKey(
  operation: string,
  assetType: string,
  symbol: string,
  ...params: (string | number | null | undefined)[]
): string {
  const parts = ['db', operation, assetType, symbol.toUpperCase(), ...params.map(p => String(p ?? 'null'))]
  return parts.join(':')
}

/**
 * Generate cache keys to invalidate when data is updated
 * Returns specific keys to delete (not patterns)
 */
export function generateInvalidationKeys(
  assetType: AssetType,
  symbol: string,
  date?: string | null
): string[] {
  const keys: string[] = []
  
  // Invalidate price cache for specific date
  if (date) {
    keys.push(generatePriceCacheKey(assetType, symbol, date))
    keys.push(generatePriceCacheKey(assetType, symbol, date, true)) // Also invalidate refresh version
  }
  
  // Always invalidate current price cache (no date)
  keys.push(generatePriceCacheKey(assetType, symbol))
  keys.push(generatePriceCacheKey(assetType, symbol, undefined, true)) // Also invalidate refresh version
  
  return keys
}

/**
 * Generate cache key pattern for historical data invalidation
 * This returns a regex pattern string for matching
 */
export function generateHistoricalInvalidationPattern(
  assetType: AssetType,
  symbol: string
): string {
  return `^historical:${assetType}:${symbol.toUpperCase()}:`
}

/**
 * Normalize cache key (remove special characters, ensure consistent format)
 */
export function normalizeCacheKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9:_-]/g, '_')
}

