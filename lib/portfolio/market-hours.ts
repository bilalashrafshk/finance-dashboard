/**
 * Market Hours and Timezone Utilities
 * Determines if markets are open/closed and handles timezone conversions
 */

/**
 * Market timezone information
 */
export const MARKET_TIMEZONES = {
  'US': 'America/New_York', // ET/EST
  'PSX': 'Asia/Karachi', // PKT
  'crypto': 'UTC', // 24/7
} as const

/**
 * Market close times (local time)
 */
export const MARKET_CLOSE_TIMES = {
  'US': { hour: 16, minute: 0 }, // 4:00 PM ET
  'PSX': { hour: 15, minute: 30 }, // 3:30 PM PKT
  'crypto': null, // 24/7, never closes
} as const

/**
 * Check if a market is currently closed
 * @param market - Market type ('US', 'PSX', 'crypto')
 * @returns true if market is closed, false if open
 */
export function isMarketClosed(market: 'US' | 'PSX' | 'crypto'): boolean {
  if (market === 'crypto') {
    return false // Crypto markets are 24/7
  }

  const timezone = MARKET_TIMEZONES[market]
  const closeTime = MARKET_CLOSE_TIMES[market]
  
  if (!closeTime) {
    return false
  }

  // Get current time in market timezone
  const now = new Date()
  const marketTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  
  const currentHour = marketTime.getHours()
  const currentMinute = marketTime.getMinutes()
  const currentDay = marketTime.getDay() // 0 = Sunday, 6 = Saturday
  
  // Markets are closed on weekends
  if (currentDay === 0 || currentDay === 6) {
    return true
  }
  
  // Check if current time is after market close
  if (currentHour > closeTime.hour || (currentHour === closeTime.hour && currentMinute >= closeTime.minute)) {
    return true
  }
  
  // Markets typically open at 9:30 AM (US) or 9:15 AM (PSX)
  // Before market open, consider it closed
  const marketOpenHour = market === 'US' ? 9 : 9
  const marketOpenMinute = market === 'US' ? 30 : 15
  
  if (currentHour < marketOpenHour || (currentHour === marketOpenHour && currentMinute < marketOpenMinute)) {
    return true
  }
  
  return false
}

/**
 * Get today's date in market timezone (YYYY-MM-DD)
 * @param market - Market type ('US', 'PSX', 'crypto')
 * @returns Today's date string in market timezone
 */
export function getTodayInMarketTimezone(market: 'US' | 'PSX' | 'crypto'): string {
  const timezone = MARKET_TIMEZONES[market]
  const now = new Date()
  const marketDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  
  const year = marketDate.getFullYear()
  const month = String(marketDate.getMonth() + 1).padStart(2, '0')
  const day = String(marketDate.getDate()).padStart(2, '0')
  
  return `${year}-${month}-${day}`
}

/**
 * Check if we should fetch current price from API
 * @param market - Market type
 * @param hasTodayData - Whether today's data exists in database
 * @returns true if we should fetch from API, false if we can use database
 */
export function shouldFetchCurrentPrice(
  market: 'US' | 'PSX' | 'crypto',
  hasTodayData: boolean
): boolean {
  // Crypto: always fetch (24/7, prices change constantly)
  if (market === 'crypto') {
    return true
  }
  
  // If market is closed and we have today's data, use database
  if (isMarketClosed(market) && hasTodayData) {
    return false
  }
  
  // If market is open, always fetch (prices are changing)
  if (!isMarketClosed(market)) {
    return true
  }
  
  // Market is closed but we don't have today's data - fetch it
  return true
}





