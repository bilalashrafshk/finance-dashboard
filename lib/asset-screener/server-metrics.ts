import { unstable_cache } from 'next/cache'
import { TrackedAsset } from '@/components/asset-screener/add-asset-dialog'
import { calculateAllMetrics, PriceDataPoint } from '@/lib/asset-screener/metrics-calculations'
import { fetchHistoricalData } from '@/lib/portfolio/unified-price-api'

export async function getAssetMetrics(asset: TrackedAsset, baseUrl?: string) {
    try {
        // Determine asset type for unified API
        let apiAssetType: 'crypto' | 'pk-equity' | 'us-equity' | 'metals' | 'indices' = 'us-equity'
        let symbol = asset.symbol

        // We don't need market variable for fetchHistoricalData, but we use assetType to determine apiAssetType
        if (asset.assetType === 'crypto') {
            apiAssetType = 'crypto'
            if (symbol.includes('-')) symbol = symbol.replace('-', '')
        } else if (asset.assetType === 'pk-equity') {
            apiAssetType = 'pk-equity'
        } else if (asset.assetType === 'us-equity') {
            apiAssetType = 'us-equity'
        } else if (asset.assetType === 'metals') {
            apiAssetType = 'metals'
        } else if (asset.assetType === 'kse100' || asset.assetType === 'spx500') {
            apiAssetType = 'indices'
        }

        // Calculate dates for fetching history
        // We fetch 1 year of data for all metrics including Max Drawdown
        const endDate = new Date().toISOString().split('T')[0]
        const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

        // Fetch data in parallel using direct function calls
        const promises = [
            fetchHistoricalData(apiAssetType, symbol, startDate, endDate, baseUrl).catch(e => {
                console.error(`Error fetching historical data for ${asset.symbol}:`, e)
                return null
            }),
            // Benchmark data
            (asset.assetType === 'pk-equity' || asset.assetType === 'kse100')
                ? fetchHistoricalData('indices', 'KSE100', startDate, endDate, baseUrl).catch(e => {
                    console.error(`Error fetching KSE100 benchmark data:`, e)
                    return null
                })
                : (asset.assetType === 'us-equity' || asset.assetType === 'spx500')
                    ? fetchHistoricalData('indices', 'SPX500', startDate, endDate, baseUrl).catch(e => {
                        console.error(`Error fetching SPX500 benchmark data:`, e)
                        return null
                    })
                    : Promise.resolve(null)
        ]

        const [histDataResponse, benchDataResponse] = await Promise.all(promises)

        let historicalData: PriceDataPoint[] = []
        let benchmarkData: PriceDataPoint[] = []
        let currentPrice: number | null = null

        if (histDataResponse && histDataResponse.data) {
            historicalData = histDataResponse.data
                .map((r: any) => ({ date: r.date, close: parseFloat(r.close) }))
                .filter((p: any) => !isNaN(p.close))
                .sort((a: any, b: any) => a.date.localeCompare(b.date))

            if (historicalData.length > 0) {
                currentPrice = historicalData[historicalData.length - 1].close
            }
        }

        if (benchDataResponse && benchDataResponse.data) {
            benchmarkData = benchDataResponse.data
                .map((r: any) => ({ date: r.date, close: parseFloat(r.close) }))
                .filter((p: any) => !isNaN(p.close))
                .sort((a: any, b: any) => a.date.localeCompare(b.date))
        }

        // Calculate metrics
        if (currentPrice !== null && historicalData.length > 0) {
            // We use the last 252 points for 1-year metrics
            const oneYearData = historicalData.slice(-252)

            const metrics = calculateAllMetrics(
                currentPrice,
                historicalData, // Pass full history for CAGR/MaxDD
                asset.assetType,
                benchmarkData.length > 0 ? benchmarkData : undefined,
                undefined, // riskFreeRates
                oneYearData // 1-year data for Beta/Sharpe
            )

            return {
                price: currentPrice,
                ytdReturn: metrics.ytdReturnPercent ?? null,
                beta: metrics.beta1Year ?? null,
                sharpeRatio: metrics.sharpeRatio1Year ?? null,
                maxDrawdown: metrics.maxDrawdown ?? null, // calculateAllMetrics calculates MaxDD from full history
                loading: false
            }
        } else {
            console.log(`[Server Metrics] Missing data for ${asset.symbol}: Price=${currentPrice}, HistData=${historicalData.length}`)
        }

        return {
            price: null,
            ytdReturn: null,
            beta: null,
            sharpeRatio: null,
            maxDrawdown: null,
            loading: false
        }

    } catch (error) {
        console.error(`Error calculating metrics for ${asset.symbol}:`, error)
        return {
            price: null,
            ytdReturn: null,
            beta: null,
            sharpeRatio: null,
            maxDrawdown: null,
            loading: false
        }
    }
}

// Cached version
// We use the asset ID and updated timestamp as part of the cache key if available, 
// or just revalidate every 60 seconds
export const getCachedAssetMetrics = unstable_cache(
    async (asset: TrackedAsset, baseUrl?: string) => getAssetMetrics(asset, baseUrl),
    ['asset-metrics'],
    { revalidate: 60, tags: ['asset-metrics'] }
)

// Temporary bypass for debugging
// export const getCachedAssetMetrics = async (asset: TrackedAsset, baseUrl?: string) => getAssetMetrics(asset, baseUrl)
