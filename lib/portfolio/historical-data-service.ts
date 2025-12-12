import {
    getHistoricalDataWithMetadata,
    insertHistoricalData,
    type HistoricalPriceRecord
} from '@/lib/portfolio/db-client'
import { fetchStockAnalysisData, getLatestPriceFromStockAnalysis } from './stock-analysis-api'
import { fetchPKEquityData, getLatestPriceFromPKEquity } from './pk-equity-api'
import { fetchKSE100Data } from './kse-index-api'
// import { getLatestPriceFromYahoo } from './yahoo-finance-api'
import { fetchBinanceHistoricalData } from './binance-historical-api'
import { retryWithBackoff } from '@/lib/portfolio/retry-utils'
import { getTodayInMarketTimezone, isMarketClosed } from '@/lib/portfolio/market-hours'
import type { StockAnalysisDataPoint } from './stockanalysis-api'
import type { BinanceHistoricalDataPoint } from './binance-historical-api'
import type { InvestingHistoricalDataPoint } from '@/lib/portfolio/investing-client-api'
import { cacheManager } from '@/lib/cache/cache-manager'
import { generateHistoricalCacheKey } from '@/lib/cache/cache-utils'

// --- Helper Functions ---

function convertStockAnalysisToRecord(data: StockAnalysisDataPoint): HistoricalPriceRecord {
    return {
        date: data.t, // StockAnalysis uses 't' for date
        open: data.o,
        high: data.h,
        low: data.l,
        close: data.c,
        volume: data.v || null, // Volume is included from StockAnalysis
        adjusted_close: data.a || null,
        change_pct: data.ch || null,
    }
}

function convertBinanceToRecord(data: BinanceHistoricalDataPoint): HistoricalPriceRecord {
    return {
        date: data.date,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: data.volume,
        adjusted_close: null,
        change_pct: null,
    }
}

function isWeekend(date: Date): boolean {
    const day = date.getDay()
    return day === 0 || day === 6 // 0 = Sunday, 6 = Saturday
}

function calculateTradingDaysBetween(startDate: string, endDate: string): number {
    const start = new Date(startDate)
    const end = new Date(endDate)

    if (start >= end) {
        return 0
    }

    let tradingDays = 0
    const current = new Date(start)

    while (current <= end) {
        if (!isWeekend(current)) {
            tradingDays++
        }
        current.setDate(current.getDate() + 1)
    }

    return tradingDays
}

// --- Main Fetch Logic ---

async function fetchNewDataInBackground(
    assetType: string,
    symbol: string,
    market: 'PSX' | 'US' | null,
    fetchStartDate: string | undefined,
    today: string
): Promise<void> {
    try {
        // Check if market is closed and we're trying to fetch today's data
        const marketForCheck = assetType === 'pk-equity' ? 'PSX' : assetType === 'us-equity' ? 'US' : null
        if (marketForCheck) {
            const marketClosed = isMarketClosed(marketForCheck)
            const todayInMarketTimezone = getTodayInMarketTimezone(marketForCheck)

            if (marketClosed && fetchStartDate === todayInMarketTimezone) {

                return
            }
        }

        let newData: HistoricalPriceRecord[] = []
        let source: 'scstrade' | 'stockanalysis' | 'binance' | 'investing' | 'manual-source' | 'kse-source' = 'stockanalysis'

        if (assetType === 'pk-equity') {
            // Try StockAnalysis first (primary source), then fallback to Manual Source
            const apiData = await retryWithBackoff(
                () => fetchStockAnalysisData(symbol, 'PSX'),
                3,
                1000,
                10000
            )
            if (apiData) {
                const filtered = fetchStartDate
                    ? apiData.filter(d => d.t >= fetchStartDate)
                    : apiData
                newData = filtered.map(convertStockAnalysisToRecord)
                source = 'stockanalysis'
            }

            // Fallback to Manual Source
            if (newData.length === 0) {

                /* Yahoo Finance Removed/Placeholder
                // 3. Try Yahoo Finance (Backup)
                const yahooPrice = await getLatestPriceFromYahoo(symbol + '.KA') // Accessing .KA for PSX
                if (yahooPrice) return yahooPrice
                */
                try {
                    const sourceData = await retryWithBackoff(
                        () => fetchPKEquityData(symbol, fetchStartDate, today),
                        2,
                        1000,
                        5000
                    )

                    if (sourceData && sourceData.length > 0) {
                        newData = sourceData
                        source = 'manual-source'
                    }
                } catch (sourceError) {
                    console.error(`[${assetType}-${symbol}] KSE Source fetch failed:`, sourceError)
                }
            }
        } else if (assetType === 'us-equity') {

            const apiData = await retryWithBackoff(
                () => fetchStockAnalysisData(symbol, 'US'),
                3,
                1000,
                10000
            )
            if (apiData) {
                const filtered = fetchStartDate
                    ? apiData.filter(d => d.t >= fetchStartDate)
                    : apiData
                newData = filtered.map(convertStockAnalysisToRecord)
                source = 'stockanalysis'
            }
        } else if (assetType === 'crypto') {
            const cryptoStartDate = fetchStartDate || '2010-01-01'

            const apiData = await retryWithBackoff(
                () => fetchBinanceHistoricalData(symbol, cryptoStartDate, today),
                3,
                1000,
                10000
            )
            if (apiData) {
                newData = apiData.map(convertBinanceToRecord)
                source = 'binance'
            }
        } else if (assetType === 'kse100') {
            const kseStartDate = fetchStartDate || '2000-01-01'

            const { fetchKSE100Data } = await import('@/lib/portfolio/kse-index-api')
            const apiData = await retryWithBackoff(
                () => fetchKSE100Data(kseStartDate, today),
                3,
                1000,
                10000
            )
            if (apiData) {
                newData = apiData
                source = 'kse-source'
            }
        }

        if (newData.length > 0) {
            await insertHistoricalData(assetType, symbol, newData, source)
        }
    } catch (error) {
        console.error(`Background fetch error for ${assetType}-${symbol}:`, error)
    }
}

// --- Public Service Function ---

export interface HistoricalDataResult {
    data: HistoricalPriceRecord[]
    source: string
    latestDate: string | null
}

export async function ensureHistoricalData(
    assetType: string,
    symbol: string,
    limit?: number,
    skipCache: boolean = false
): Promise<HistoricalDataResult> {
    const symbolUpper = symbol.toUpperCase()
    const cacheKey = generateHistoricalCacheKey(assetType as any, symbolUpper, undefined, undefined, limit)
    const cacheContext = { isHistorical: true }

    let storedData: { data: HistoricalPriceRecord[], latestStoredDate: string | null }

    // 1. Check Cache/DB
    if (skipCache) {
        storedData = await getHistoricalDataWithMetadata(assetType, symbolUpper, undefined, undefined, limit)
    } else {
        const cached = await cacheManager.get<any>(cacheKey)
        if (cached) {
            storedData = cached
        } else {
            storedData = await getHistoricalDataWithMetadata(assetType, symbolUpper, undefined, undefined, limit)
            if (storedData && storedData.data && storedData.data.length > 0) {
                await cacheManager.set(cacheKey, storedData, assetType as any, cacheContext)
            }
        }
    }

    // 2. Gap Detection & Fetch
    const supportsServerSideFetch = assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'kse100'

    if (supportsServerSideFetch) {
        const marketForTimezone = (assetType === 'pk-equity' || assetType === 'kse100') ? 'PSX' : assetType === 'us-equity' ? 'US' : 'crypto'
        const todayInMarketTimezone = getTodayInMarketTimezone(marketForTimezone)

        const fetchStartDate = storedData.latestStoredDate
            ? new Date(new Date(storedData.latestStoredDate).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            : undefined

        if (!storedData.latestStoredDate || (fetchStartDate && fetchStartDate <= todayInMarketTimezone)) {
            let shouldFetch = false
            let tradingDays = 0

            if (!storedData.latestStoredDate) {
                shouldFetch = true
            } else if (fetchStartDate) {
                tradingDays = calculateTradingDaysBetween(fetchStartDate, todayInMarketTimezone)
                if (tradingDays > 0) {
                    shouldFetch = true
                }
            }

            if (shouldFetch) {
                const market = (assetType === 'pk-equity' || assetType === 'kse100') ? 'PSX' : assetType === 'us-equity' ? 'US' : null
                await fetchNewDataInBackground(assetType, symbolUpper, market, fetchStartDate, todayInMarketTimezone)

                // Invalidate cache
                cacheManager.delete(cacheKey)

                // Reload data
                const updated = await getHistoricalDataWithMetadata(assetType, symbolUpper, undefined, undefined, limit)
                storedData = updated
            }
        }
    }

    return {
        data: storedData.data,
        source: 'database',
        latestDate: storedData.latestStoredDate
    }
}
