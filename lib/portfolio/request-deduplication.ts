/**
 * Request Deduplication Utility
 * Prevents duplicate API calls for the same resource within a short time window
 * 
 * IMPORTANT: Response body streams can only be read once. When multiple components
 * request the same data, we need to clone the response so each gets its own stream.
 */

interface PendingRequest {
  promise: Promise<Response>
  timestamp: number
}

const pendingRequests = new Map<string, PendingRequest>()
const CACHE_DURATION = 5000 // 5 seconds - deduplicate requests within this window
const MAX_CACHE_AGE = 30000 // 30 seconds - max age for cache entries

/**
 * Deduplicate fetch requests - if the same request is made within CACHE_DURATION,
 * clone the existing response instead of making a new request
 * 
 * Note: Response body can only be read once, so we clone it for each caller
 */
export async function deduplicatedFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  // Create a stable cache key that includes method, URL, and body (for POST requests)
  // For POST requests, we need to include the body in the key to deduplicate identical requests
  let bodyKey = ''
  if (options?.body) {
    if (typeof options.body === 'string') {
      bodyKey = options.body
    } else {
      // For other body types, try to stringify if possible
      try {
        bodyKey = JSON.stringify(options.body)
      } catch {
        bodyKey = String(options.body)
      }
    }
  }
  const cacheKey = `${options?.method || 'GET'}:${url}:${bodyKey}`
  const now = Date.now()

  // Clean up old cache entries
  for (const [key, request] of pendingRequests.entries()) {
    if (now - request.timestamp > MAX_CACHE_AGE) {
      pendingRequests.delete(key)
    }
  }

  // Check if there's a pending request for this URL
  const existing = pendingRequests.get(cacheKey)
  if (existing && (now - existing.timestamp) < CACHE_DURATION) {
    // Wait for the existing request and clone the response
    // Each caller gets their own readable stream
    const response = await existing.promise
    // Clone so each caller can read the body independently
    return response.clone()
  }

  // Create new request
  // The promise will be shared, but each caller will clone the response
  const promise = fetch(url, options)
  
  pendingRequests.set(cacheKey, { promise, timestamp: now })

  // Clean up after request completes
  promise.finally(() => {
    // Keep in cache for a bit longer in case of rapid successive calls
    setTimeout(() => {
      pendingRequests.delete(cacheKey)
    }, CACHE_DURATION)
  })

  // Clone the response so each caller gets their own readable stream
  // This is critical: Response body can only be read once
  const response = await promise
  return response.clone()
}

/**
 * Clear all pending requests (useful for testing or cleanup)
 */
export function clearPendingRequests(): void {
  pendingRequests.clear()
}

