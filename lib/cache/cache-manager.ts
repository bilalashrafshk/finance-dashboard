/**
 * Cache Manager
 * 
 * Centralized cache management for the application.
 * Provides in-memory caching with TTL support, ready for Redis migration.
 */

import { cacheConfig, type AssetType, type CacheContext } from './cache-config'
import { normalizeCacheKey } from './cache-utils'
import { unstable_cache } from 'next/cache'

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
  key: string
}

/**
 * In-memory cache store
 * In production, this can be replaced with Redis
 */
class InMemoryCache {
  private store = new Map<string, CacheEntry<any>>()
  
  /**
   * Cleanup interval to remove expired entries
   */
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Start cleanup interval (runs every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 5 * 60 * 1000)
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    
    if (!entry) {
      return null
    }
    
    // Check if expired
    const age = Date.now() - entry.timestamp
    if (age >= entry.ttl) {
      this.store.delete(key)
      return null
    }
    
    return entry.data as T
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttl: number): void {
    const normalizedKey = normalizeCacheKey(key)
    
    this.store.set(normalizedKey, {
      data: value,
      timestamp: Date.now(),
      ttl,
      key: normalizedKey,
    })
  }

  /**
   * Delete value from cache
   */
  delete(key: string): void {
    const normalizedKey = normalizeCacheKey(key)
    this.store.delete(normalizedKey)
  }

  /**
   * Delete all keys matching a pattern
   */
  deletePattern(pattern: string): number {
    let deleted = 0
    const regex = new RegExp(pattern.replace(/\*/g, '.*'))
    
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key)
        deleted++
      }
    }
    
    return deleted
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.store.clear()
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
    }
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0
    
    for (const [key, entry] of this.store.entries()) {
      const age = now - entry.timestamp
      if (age >= entry.ttl) {
        this.store.delete(key)
        cleaned++
      }
    }
    
    if (cleaned > 0) {
      console.log(`[Cache] Cleaned up ${cleaned} expired entries`)
    }
  }

  /**
   * Destroy cache instance
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.store.clear()
  }
}

// Global cache instance
const globalCache = new InMemoryCache()

/**
 * Cache Manager
 * 
 * Provides high-level caching interface with automatic TTL management
 */
export class CacheManager {
  /**
   * Get cached value or compute and cache it
   */
  async getOrSet<T>(
    key: string,
    computeFn: () => Promise<T>,
    assetType: AssetType,
    context?: CacheContext
  ): Promise<{ data: T; fromCache: boolean }> {
    // Check if we should cache
    if (!cacheConfig.shouldCache(assetType, context)) {
      const data = await computeFn()
      return { data, fromCache: false }
    }

    // Check cache first
    const cached = globalCache.get<T>(key)
    if (cached !== null) {
      return { data: cached, fromCache: true }
    }

    // Cache miss - compute value
    const data = await computeFn()
    
    // Get TTL and cache the result
    const ttl = cacheConfig.getTTL(assetType, context)
    if (ttl > 0) {
      globalCache.set(key, data, ttl)
    }

    return { data, fromCache: false }
  }

  /**
   * Get cached value (returns null if not found)
   */
  get<T>(key: string): T | null {
    return globalCache.get<T>(key)
  }

  /**
   * Set cached value
   */
  set<T>(key: string, value: T, assetType: AssetType, context?: CacheContext): void {
    if (!cacheConfig.shouldCache(assetType, context)) {
      return
    }

    const ttl = cacheConfig.getTTL(assetType, context)
    if (ttl > 0) {
      globalCache.set(key, value, ttl)
    }
  }

  /**
   * Delete cached value
   */
  delete(key: string): void {
    globalCache.delete(key)
  }

  /**
   * Delete all keys matching a pattern
   */
  deletePattern(pattern: string): number {
    return globalCache.deletePattern(pattern)
  }

  /**
   * Clear all cache
   */
  clear(): void {
    globalCache.clear()
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return globalCache.getStats()
  }
}

// Export singleton instance
export const cacheManager = new CacheManager()

/**
 * Next.js cache wrapper for API routes
 * Uses Next.js unstable_cache for server-side caching
 */
export async function withCache<T>(
  key: string,
  computeFn: () => Promise<T>,
  options: {
    tags?: string[]
    revalidate?: number
  } = {}
): Promise<T> {
  // Use Next.js cache for server-side caching
  const cachedFn = unstable_cache(
    computeFn,
    [key],
    {
      tags: options.tags,
      revalidate: options.revalidate,
    }
  )

  return cachedFn()
}

/**
 * Invalidate cache by tags (for Next.js cache)
 */
export function revalidateCache(tags: string[]): void {
  // This will be used with Next.js revalidateTag when needed
  // For now, we use in-memory cache invalidation
  console.log(`[Cache] Revalidation requested for tags: ${tags.join(', ')}`)
}



