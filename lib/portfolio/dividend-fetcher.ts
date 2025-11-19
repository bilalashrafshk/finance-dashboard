/**
 * Dividend Fetcher Utility
 * 
 * Fetches and stores dividend data for assets
 * Designed to be called alongside price fetching with error handling
 * so that dividend fetch failures don't affect price fetching
 */

import { fetchDividendData } from './dividend-api'
import { insertDividendData, hasDividendData, getCompanyFaceValue } from './db-client'
import { fetchFaceValue } from '@/lib/scraper/scstrade'

/**
 * Fetch and store dividend data for a PK equity asset
 * This function is designed to be called alongside price fetching
 * Errors are caught and logged but don't throw - price fetching should continue
 * 
 * @param ticker - Stock ticker (e.g., "HBL", "PTC")
 * @param assetType - Asset type (default: 'pk-equity')
 * @param forceRefresh - Force refresh even if data exists (default: false)
 * @returns Promise that resolves when done (never rejects)
 */
export async function fetchAndStoreDividends(
  ticker: string,
  assetType: string = 'pk-equity',
  forceRefresh: boolean = false
): Promise<void> {
  // Only fetch dividends for PK equity for now
  if (assetType !== 'pk-equity') {
    return
  }

  try {
    const tickerUpper = ticker.toUpperCase()

    // Check if we already have dividend data (unless forcing refresh)
    if (!forceRefresh) {
      const hasData = await hasDividendData(assetType, tickerUpper)
      if (hasData) {
        console.log(`[Dividend Fetcher] Dividend data already exists for ${tickerUpper}, skipping fetch`)
        return
      }
    }

    console.log(`[Dividend Fetcher] Fetching dividend data for ${tickerUpper}...`)
    
    // Get Face Value (try DB first, then scraper, default to 10)
    let faceValue = await getCompanyFaceValue(tickerUpper, assetType)
    if (!faceValue) {
      console.log(`[Dividend Fetcher] Face value not in DB for ${tickerUpper}, fetching from source...`)
      faceValue = await fetchFaceValue(tickerUpper)
    }
    
    // Default to 10 if still not found
    const finalFaceValue = faceValue || 10
    console.log(`[Dividend Fetcher] Using Face Value: ${finalFaceValue} for ${tickerUpper}`)

    const dividendData = await fetchDividendData(tickerUpper, 100, finalFaceValue)

    if (!dividendData || dividendData.length === 0) {
      console.log(`[Dividend Fetcher] No dividend data available for ${tickerUpper}`)
      return
    }

    // Store in database
    const result = await insertDividendData(assetType, tickerUpper, dividendData, 'scstrade')
    console.log(`[Dividend Fetcher] Stored ${result.inserted} dividend records for ${tickerUpper}`)
  } catch (error: any) {
    // Log error but don't throw - price fetching should continue
    console.error(`[Dividend Fetcher] Error fetching/storing dividends for ${ticker}:`, error.message)
  }
}



