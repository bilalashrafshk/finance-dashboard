import { LRUCache } from 'lru-cache'

type RateLimitContext = {
    tokenCount: number
    lastReset: number
}

// In-memory cache for rate limiting
// Using LRU to prevent memory leaks from too many distinct IPs
const rateLimitCache = new LRUCache<string, RateLimitContext>({
    max: 5000, // Max 5000 IPs tracked
    ttl: 60 * 1000, // 1 minute TTL
})

interface RateLimitResult {
    success: boolean
    remaining: number
    reset: number
}

/**
 * Basic in-memory rate limiter
 * @param key Unique identifier (e.g., IP address)
 * @param limit Max requests per window
 * @param windowMs Window size in milliseconds
 */
export async function rateLimit(
    key: string,
    limit: number = 5,
    windowMs: number = 60 * 1000
): Promise<RateLimitResult> {
    const now = Date.now()
    const context = rateLimitCache.get(key) || {
        tokenCount: 0,
        lastReset: now,
    }

    // Reset if window has passed (cache TTL handles this usually, but explicit check is good)
    if (now - context.lastReset > windowMs) {
        context.tokenCount = 0
        context.lastReset = now
    }

    const currentUsage = context.tokenCount
    const remaining = Math.max(0, limit - currentUsage)
    const reset = context.lastReset + windowMs

    if (currentUsage >= limit) {
        return {
            success: false,
            remaining: 0,
            reset
        }
    }

    context.tokenCount += 1
    rateLimitCache.set(key, context)

    return {
        success: true,
        remaining: remaining - 1,
        reset,
    }
}
