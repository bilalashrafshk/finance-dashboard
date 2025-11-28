/**
 * Shared Cache for Historical Data Requests
 * 
 * Prevents duplicate API calls for the same historical data across multiple chart components.
 * Uses in-memory cache with TTL to share data between components.
 */

import { cacheManager } from '@/lib/cache/cache-manager'

interface HistoricalDataCacheEntry {
  data: any[]
  timestamp: number
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get cached historical data or fetch and cache it
 */
export async function getCachedHistoricalData(
  assetType: string,
  symbol: string,
  market?: string
): Promise<any[] | null> {
  const cacheKey = `historical-data:${assetType}:${symbol}:${market || 'default'}`
  
  // Check cache first
  const cached = cacheManager.get<HistoricalDataCacheEntry>(cacheKey)
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data
  }

  // Cache miss - fetch from API
  try {
    const token = localStorage.getItem('auth_token')
    const url = `/api/historical-data?assetType=${encodeURIComponent(assetType)}&symbol=${encodeURIComponent(symbol)}${market ? `&market=${encodeURIComponent(market)}` : ''}`
    
    const response = await fetch(url, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    })

    if (!response.ok) {
      return null
    }

    const apiData = await response.json()
    const dbRecords = apiData.data || []

    if (dbRecords.length > 0) {
      // Convert database records to chart format
      const { dbRecordToStockAnalysis } = await import('@/lib/portfolio/db-to-chart-format')
      const data = dbRecords.map(dbRecordToStockAnalysis)

      // Cache the result
      cacheManager.setWithCustomTTL(cacheKey, {
        data,
        timestamp: Date.now(),
      }, CACHE_TTL)

      return data
    }
  } catch (error) {
    console.error(`Error fetching historical data for ${assetType}:${symbol}:`, error)
  }

  return null
}

/**
 * Clear cache for a specific asset
 */
export function clearHistoricalDataCache(assetType: string, symbol: string, market?: string): void {
  const cacheKey = `historical-data:${assetType}:${symbol}:${market || 'default'}`
  cacheManager.delete(cacheKey)
}

/**
 * Clear all historical data cache
 */
export function clearAllHistoricalDataCache(): void {
  cacheManager.deletePattern('historical-data:*')
}

