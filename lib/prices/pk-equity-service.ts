import { getTodayPriceFromDatabase } from '@/lib/portfolio/db-client'
import { isMarketClosed, getTodayInMarketTimezone } from '@/lib/portfolio/market-hours'
import { cacheManager } from '@/lib/cache/cache-manager'
import { generatePriceCacheKey } from '@/lib/cache/cache-utils'
import { ensureHistoricalData } from '@/lib/portfolio/historical-data-service'
import { unstable_cache } from 'next/cache'

export interface PKEquityPriceResult {
    ticker: string
    price: number
    date: string
    source: string
}

const fetchPriceFromDB = async (tickerUpper: string): Promise<PKEquityPriceResult | null> => {
    try {
        const result = await ensureHistoricalData('pk-equity', tickerUpper, 1)

        if (result.data && result.data.length > 0) {
            const latestRecord = result.data[result.data.length - 1]
            return {
                ticker: tickerUpper,
                price: latestRecord.close,
                date: latestRecord.date,
                source: 'database'
            }
        }
    } catch (error) {
        console.error(`[PK Equity Service] Error fetching price for ${tickerUpper}:`, error)
    }
    return null
}

export async function fetchPKEquityPriceService(
    ticker: string,
    refresh: boolean = false
): Promise<PKEquityPriceResult | null> {
    const tickerUpper = ticker.toUpperCase()

    // Bypass cache if forced refresh
    if (refresh) {
        return fetchPriceFromDB(tickerUpper)
    }

    // Use Next.js Data Cache (Persistent across lambda restarts)
    // Rebuilds cache every 60 seconds (matching valid freshness)
    const getCachedPrice = unstable_cache(
        async () => fetchPriceFromDB(tickerUpper),
        [`pk-equity-price-${tickerUpper}`],
        {
            revalidate: 60,
            tags: [`price-${tickerUpper}`]
        }
    )

    return getCachedPrice()
}
