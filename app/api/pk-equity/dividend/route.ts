import { NextRequest, NextResponse } from 'next/server'
import { fetchDividendData } from '@/lib/portfolio/dividend-api'
import { insertDividendData, getDividendData, hasDividendData, getLatestDividendDate } from '@/lib/portfolio/db-client'
import { cacheManager } from '@/lib/cache/cache-manager'
import { getTodayInMarketTimezone } from '@/lib/portfolio/market-hours'


/**
 * Calculate TTL until midnight (in milliseconds)
 * Used for cache entries that should expire at the end of the day
 */
function getTTLUntilMidnight(): number {
  const now = new Date()
  const psxTimezone = 'Asia/Karachi'
  const psxTime = new Date(now.toLocaleString('en-US', { timeZone: psxTimezone }))
  
  // Create midnight in PSX timezone
  const midnight = new Date(psxTime)
  midnight.setHours(24, 0, 0, 0)
  
  // Calculate TTL
  const ttl = midnight.getTime() - psxTime.getTime()
  
  // Ensure minimum TTL of 1 hour and maximum of 24 hours
  return Math.max(3600000, Math.min(86400000, ttl))
}

/**
 * PK Equity Dividend API Route
 * 
 * GET /api/pk-equity/dividend?ticker=HBL
 * GET /api/pk-equity/dividend?ticker=HBL&startDate=2020-01-01&endDate=2025-12-31
 * GET /api/pk-equity/dividend?ticker=HBL&refresh=true
 * 
 * Fetches and stores dividend data for PK equity assets.
 * - Returns stored dividend data if available
 * - Checks for new dividends once per day per ticker (rate-limited)
 * - Fetches from scstrade.com API if refresh=true, no data exists, or new data available
 * - Automatically stores fetched data in database
 * 
 * Rate Limiting:
 * - Uses in-memory cache to track "checked today" status per ticker
 * - Prevents multiple API calls for same ticker on same day
 * - Cache key: "dividend-check-pk-equity-{ticker}-{date}"
 * - TTL: Until midnight (expires at end of day in PSX timezone)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const ticker = searchParams.get('ticker')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const refresh = searchParams.get('refresh') === 'true'

  if (!ticker) {
    return NextResponse.json(
      { error: 'Ticker parameter is required' },
      { status: 400 }
    )
  }

  try {
    const tickerUpper = ticker.toUpperCase()
    const assetType = 'pk-equity'
    const today = getTodayInMarketTimezone('PSX')
    
    // Rate limiting: Check if we've already checked for new dividends today
    const cacheKey = `dividend-check-${assetType}-${tickerUpper}-${today}`
    const alreadyCheckedToday = cacheManager.get<boolean>(cacheKey)
    
    // If refresh=true, bypass cache check
    const shouldCheckForNew = refresh || !alreadyCheckedToday

    // Get existing data from database
    const existingData = await getDividendData(assetType, tickerUpper, startDate || undefined, endDate || undefined)
    
    // If we have data and user doesn't want refresh and we've already checked today, return immediately
    if (!refresh && alreadyCheckedToday && existingData.length > 0) {
      return NextResponse.json({
        ticker: tickerUpper,
        dividends: existingData,
        count: existingData.length,
        source: 'database',
        checkedToday: true
      })
    }

    // Check for new dividends if we haven't checked today or refresh is requested
    if (shouldCheckForNew) {
      // Get latest dividend date from database
      const latestDbDate = await getLatestDividendDate(assetType, tickerUpper)
      
      console.log(`[Dividend API] Checking for new dividends for ${tickerUpper} (latest DB date: ${latestDbDate || 'none'})`)
      
      // Fetch from API
      const apiDividendData = await fetchDividendData(tickerUpper, 100)

      if (apiDividendData && apiDividendData.length > 0) {
        // Find latest date in API data
        const latestApiDate = apiDividendData.sort((a, b) => b.date.localeCompare(a.date))[0].date
        
        // Check if API has newer dividends than what's in DB
        const hasNewDividends = !latestDbDate || latestApiDate > latestDbDate
        
        if (hasNewDividends) {
          console.log(`[Dividend API] New dividends detected for ${tickerUpper} (API latest: ${latestApiDate}, DB latest: ${latestDbDate || 'none'})`)
          
          // Store new dividends in database
          try {
            const result = await insertDividendData(assetType, tickerUpper, apiDividendData, 'scstrade')
            console.log(`[Dividend API] Stored ${result.inserted} dividend records for ${tickerUpper} (${result.skipped} skipped)`)
            
            // Reload from database to get all data (including newly stored)
            const reloadedData = await getDividendData(assetType, tickerUpper, startDate || undefined, endDate || undefined)
            
            // Mark as checked for today (TTL until midnight)
            const ttlUntilMidnight = getTTLUntilMidnight()
            cacheManager.setWithCustomTTL(cacheKey, true, ttlUntilMidnight)
            
            // Filter by date range if provided
            let filteredData = reloadedData
            if (startDate || endDate) {
              filteredData = reloadedData.filter(record => {
                if (startDate && record.date < startDate) return false
                if (endDate && record.date > endDate) return false
                return true
              })
            }
            
            return NextResponse.json({
              ticker: tickerUpper,
              dividends: filteredData,
              count: filteredData.length,
              source: 'database',
              newDividendsFound: true,
              newDividendsCount: result.inserted
            })
          } catch (error: any) {
            console.error(`[Dividend API] Error storing dividend data for ${tickerUpper}:`, error.message)
            // Continue to return existing data even if storage fails
          }
        } else {
          console.log(`[Dividend API] No new dividends for ${tickerUpper} (latest dates match: ${latestApiDate})`)
          
          // Mark as checked for today even if no new data (prevents repeated checks)
          const ttlUntilMidnight = getTTLUntilMidnight()
          cacheManager.setWithCustomTTL(cacheKey, true, ttlUntilMidnight)
        }
      } else {
        // No dividend data available from API - mark as checked to prevent repeated API calls
        const ttlUntilMidnight = getTTLUntilMidnight()
        cacheManager.setWithCustomTTL(cacheKey, true, ttlUntilMidnight)
        
        if (existingData.length === 0) {
          // No data in DB and no data from API
          return NextResponse.json({
            ticker: tickerUpper,
            dividends: [],
            count: 0,
            source: 'api',
            message: 'No dividend data available for this ticker'
          })
        }
      }
    }

    // Return existing data from database (filtered by date range if provided)
    let filteredData = existingData
    if (startDate || endDate) {
      filteredData = existingData.filter(record => {
        if (startDate && record.date < startDate) return false
        if (endDate && record.date > endDate) return false
        return true
      })
    }

    return NextResponse.json({
      ticker: tickerUpper,
      dividends: filteredData,
      count: filteredData.length,
      source: 'database',
      checkedToday: alreadyCheckedToday || false
    })
  } catch (error: any) {
    console.error(`[Dividend API] Error fetching dividend data for ${ticker}:`, error)
    return NextResponse.json(
      { error: `Failed to fetch dividend data: ${error.message}` },
      { status: 500 }
    )
  }
}

