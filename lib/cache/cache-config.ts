/**
 * Cache Configuration
 * 
 * Defines TTL (Time To Live) values for different types of cached data.
 * TTLs are designed to prevent stale data while maximizing cache efficiency.
 */

import { isMarketClosed } from '@/lib/portfolio/market-hours'

export type AssetType = 'crypto' | 'pk-equity' | 'us-equity' | 'metals' | 'indices' | 'spx500' | 'kse100'

export interface CacheConfig {
  /**
   * Get TTL in milliseconds for a given asset type and context
   */
  getTTL(assetType: AssetType, context?: CacheContext): number
  
  /**
   * Check if data should be cached based on context
   */
  shouldCache(assetType: AssetType, context?: CacheContext): boolean
}

export interface CacheContext {
  /**
   * Whether this is a historical data query (static data)
   */
  isHistorical?: boolean
  
  /**
   * Whether market is closed
   */
  marketClosed?: boolean
  
  /**
   * Whether refresh was explicitly requested
   */
  refresh?: boolean
  
  /**
   * Specific date being queried (for historical queries)
   */
  date?: string
}

/**
 * Default cache configuration
 */
class DefaultCacheConfig implements CacheConfig {
  // Base TTL values in milliseconds
  private readonly BASE_TTL = {
    // Crypto: 1-2 minutes (volatile, 24/7)
    crypto: 1 * 60 * 1000, // 1 minute
    
    // Equity: Market-aware
    'pk-equity': 3 * 60 * 1000, // 3 minutes (when market open)
    'us-equity': 3 * 60 * 1000, // 3 minutes (when market open)
    
    // Metals: Market-aware (US market hours)
    metals: 3 * 60 * 1000, // 3 minutes (when market open)
    
    // Indices: Market-aware
    indices: 3 * 60 * 1000, // 3 minutes (when market open)
    spx500: 3 * 60 * 1000, // 3 minutes (when market open)
    kse100: 3 * 60 * 1000, // 3 minutes (when market open)
    
    // Historical data: 1 hour (static, doesn't change)
    historical: 60 * 60 * 1000, // 1 hour
    
    // Risk metrics: 5 minutes
    'risk-metrics': 5 * 60 * 1000, // 5 minutes
  } as const

  /**
   * Get TTL for market-closed scenarios
   * Cache until market opens next day (or next weekday)
   */
  private getMarketClosedTTL(market: 'US' | 'PSX'): number {
    const now = new Date()
    const marketTimezone = market === 'US' ? 'America/New_York' : 'Asia/Karachi'
    const marketTime = new Date(now.toLocaleString('en-US', { timeZone: marketTimezone }))
    
    // Calculate time until next market open
    const currentDay = marketTime.getDay() // 0 = Sunday, 6 = Saturday
    const currentHour = marketTime.getHours()
    const currentMinute = marketTime.getMinutes()
    
    // Market open times
    const openHour = market === 'US' ? 9 : 9
    const openMinute = market === 'US' ? 30 : 15
    
    // If it's a weekday and before market open, cache until market open today
    if (currentDay >= 1 && currentDay <= 5) {
      if (currentHour < openHour || (currentHour === openHour && currentMinute < openMinute)) {
        const marketOpen = new Date(marketTime)
        marketOpen.setHours(openHour, openMinute, 0, 0)
        return marketOpen.getTime() - marketTime.getTime()
      }
    }
    
    // Calculate time until next weekday market open
    let daysUntilNextOpen = 0
    if (currentDay === 0) {
      // Sunday -> Monday
      daysUntilNextOpen = 1
    } else if (currentDay === 6) {
      // Saturday -> Monday
      daysUntilNextOpen = 2
    } else if (currentDay === 5 && currentHour >= 16) {
      // Friday after close -> Monday
      daysUntilNextOpen = 3
    } else {
      // Weekday after close -> next day
      daysUntilNextOpen = 1
    }
    
    const nextOpen = new Date(marketTime)
    nextOpen.setDate(nextOpen.getDate() + daysUntilNextOpen)
    nextOpen.setHours(openHour, openMinute, 0, 0)
    
    return nextOpen.getTime() - marketTime.getTime()
  }

  getTTL(assetType: AssetType, context?: CacheContext): number {
    // Never cache if refresh is explicitly requested
    if (context?.refresh) {
      return 0
    }

    // Historical data gets longer TTL
    if (context?.isHistorical || context?.date) {
      return this.BASE_TTL.historical
    }

    // Market-aware TTL for equity and metals
    if (assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'metals') {
      const market = assetType === 'pk-equity' ? 'PSX' : 'US'
      const marketClosed = context?.marketClosed ?? isMarketClosed(market)
      
      if (marketClosed) {
        // Cache until market opens next
        return this.getMarketClosedTTL(market)
      }
      
      // Market is open - use shorter TTL
      return this.BASE_TTL[assetType]
    }

    // Crypto: always use short TTL (24/7, volatile)
    if (assetType === 'crypto') {
      return this.BASE_TTL.crypto
    }

    // Indices: market-aware
    if (assetType === 'indices' || assetType === 'spx500' || assetType === 'kse100') {
      const market = assetType === 'kse100' ? 'PSX' : 'US'
      const marketClosed = context?.marketClosed ?? isMarketClosed(market)
      
      if (marketClosed) {
        return this.getMarketClosedTTL(market)
      }
      
      return this.BASE_TTL.indices
    }

    // Default: use base TTL
    return this.BASE_TTL[assetType] || this.BASE_TTL.historical
  }

  shouldCache(assetType: AssetType, context?: CacheContext): boolean {
    // Never cache if refresh is explicitly requested
    if (context?.refresh) {
      return false
    }

    // Always cache historical data
    if (context?.isHistorical || context?.date) {
      return true
    }

    // Cache everything else
    return true
  }
}

// Export singleton instance
export const cacheConfig = new DefaultCacheConfig()




