import { getTodayPriceFromDatabase } from '@/lib/portfolio/db-client'
import { isMarketClosed, getTodayInMarketTimezone } from '@/lib/portfolio/market-hours'
import { cacheManager } from '@/lib/cache/cache-manager'
import { generatePriceCacheKey } from '@/lib/cache/cache-utils'
import { ensureHistoricalData } from '@/lib/portfolio/historical-data-service'

export interface PKEquityPriceResult {
    ticker: string
    price: number
    date: string
    source: string
}

export async function fetchPKEquityPriceService(
    ticker: string,
    refresh: boolean = false
): Promise<PKEquityPriceResult | null> {
    const tickerUpper = ticker.toUpperCase()
    const today = getTodayInMarketTimezone('PSX')
    const cacheKey = generatePriceCacheKey('pk-equity', tickerUpper, today, refresh)
    const marketClosed = isMarketClosed('PSX')
    const cacheContext = { refresh, marketClosed }

    // 1. Check Cache
    const cachedResponse = cacheManager.get<PKEquityPriceResult>(cacheKey)
    if (cachedResponse && !refresh) {
        return cachedResponse
    }

    // 2. Check DB for today's price
    // We can use ensureHistoricalData with limit=1 to get the latest data efficiently
    // and it handles gap detection automatically.

    try {
        // Call historical data service (Direct call, no HTTP)
        const result = await ensureHistoricalData('pk-equity', tickerUpper, 1, refresh)

        if (result.data && result.data.length > 0) {
            const latestRecord = result.data[result.data.length - 1]

            // If we have data for today, or if we just want the latest available
            // The API logic was: if latest date != today, trigger gap detection.
            // ensureHistoricalData ALREADY did gap detection.

            const response = {
                ticker: tickerUpper,
                price: latestRecord.close,
                date: latestRecord.date,
                source: 'database'
            }

            cacheManager.set(cacheKey, response, 'pk-equity', cacheContext)
            return response
        }
    } catch (error) {
        console.error(`[PK Equity Service] Error fetching price for ${tickerUpper}:`, error)
    }

    return null
}
