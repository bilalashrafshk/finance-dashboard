/**
 * Retry utility with exponential backoff
 * Used for API calls that may fail due to network issues or rate limits
 */

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry a function with exponential backoff
 * @param fn - Function to retry (must return a Promise)
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param initialDelay - Initial delay in milliseconds (default: 1000)
 * @param maxDelay - Maximum delay in milliseconds (default: 10000)
 * @returns Result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
  maxDelay: number = 10000
): Promise<T> {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      
      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelay * Math.pow(2, attempt),
        maxDelay
      )
      
      // Don't retry for certain error types (e.g., 404 Not Found)
      if (error?.status === 404 || error?.code === 'ENOTFOUND') {
        throw error
      }
      
      await sleep(delay)
    }
  }
  
  throw lastError || new Error('Retry failed: unknown error')
}

