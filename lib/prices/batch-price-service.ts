import { getTodayPriceWithTimestamp, getLatestPriceFromDatabase } from '@/lib/portfolio/db-client'
import { getTodayInMarketTimezone } from '@/lib/portfolio/market-hours'
import { fetchMultipleBinancePrices, parseSymbolToBinance } from '@/lib/portfolio/binance-api'
import { fetchUSEquityPrice, fetchMetalsPrice, fetchIndicesPrice } from '@/lib/portfolio/unified-price-api'
import { fetchPKEquityPriceService } from '@/lib/prices/pk-equity-service'

export interface BatchPriceResult {
    price?: number
    date?: string
    source?: string
    error?: string
}

export async function fetchBatchPrices(
    assets: Array<{ type: string; symbol: string }>,
    baseUrl: string
): Promise<Record<string, BatchPriceResult>> {
    const results: Record<string, BatchPriceResult> = {}
    const assetsToFetch: typeof assets = []

    // 1. Check DB for all assets
    await Promise.all(assets.map(async (asset) => {
        const { type, symbol } = asset
        const symbolUpper = symbol.toUpperCase()
        const uniqueKey = `${type}:${symbolUpper}`

        // Determine "today" based on market
        const market = type === 'pk-equity' ? 'PSX' : type === 'us-equity' || type === 'metals' || type === 'spx500' ? 'US' : 'crypto'
        const today = getTodayInMarketTimezone(market as any)

        // Check DB
        const dbData = await getTodayPriceWithTimestamp(type, symbolUpper, today)

        let isStale = true
        if (dbData) {
            if (type === 'crypto') {
                // Crypto: Stale if > 15 mins
                const lastUpdated = new Date(dbData.updatedAt).getTime()
                const ageInMinutes = (Date.now() - lastUpdated) / (1000 * 60)
                isStale = ageInMinutes > 15
            } else {
                // Others: Valid if exists for "today" (since daily candles)
                isStale = false
            }
        }

        if (!isStale && dbData) {
            results[uniqueKey] = {
                price: dbData.price,
                date: today,
                source: 'database'
            }
        } else {
            assetsToFetch.push(asset)
        }
    }))

    // 2. Fetch missing/stale data
    if (assetsToFetch.length > 0) {
        const cryptoAssets = assetsToFetch.filter((a: any) => a.type === 'crypto')
        const otherAssets = assetsToFetch.filter((a: any) => a.type !== 'crypto')

        // Bulk fetch Crypto (efficient)
        if (cryptoAssets.length > 0) {
            const symbols = cryptoAssets.map((a: any) => parseSymbolToBinance(a.symbol))
            try {
                const prices = await fetchMultipleBinancePrices(symbols)

                await Promise.all(cryptoAssets.map(async (asset: any) => {
                    const binanceSymbol = parseSymbolToBinance(asset.symbol)
                    const price = prices[binanceSymbol]
                    const uniqueKey = `${asset.type}:${asset.symbol.toUpperCase()}`

                    if (price) {
                        results[uniqueKey] = {
                            price,
                            date: getTodayInMarketTimezone('crypto'),
                            source: 'api'
                        }

                        // Background update
                        import('@/lib/portfolio/unified-price-api').then(({ fetchCryptoPrice }) => {
                            fetchCryptoPrice(binanceSymbol, true, baseUrl).catch(err => console.error('Bg update failed', err))
                        })

                    } else {
                        results[uniqueKey] = { error: 'Price not found' }
                    }
                }))
            } catch (e) {
                console.error("Bulk crypto fetch failed", e)
            }
        }

        // Fetch others individually (parallel)
        await Promise.all(otherAssets.map(async (asset: any) => {
            const uniqueKey = `${asset.type}:${asset.symbol.toUpperCase()}`
            let data = null

            try {
                if (asset.type === 'pk-equity') {
                    // Use SERVICE directly (No HTTP)
                    const result = await fetchPKEquityPriceService(asset.symbol, false)
                    if (result) {
                        data = { price: result.price, date: result.date }
                    }
                } else if (asset.type === 'us-equity') {
                    data = await fetchUSEquityPrice(asset.symbol, false, baseUrl)
                } else if (asset.type === 'metals') {
                    data = await fetchMetalsPrice(asset.symbol, false, 0, baseUrl)
                } else if (asset.type === 'spx500' || asset.type === 'kse100') {
                    data = await fetchIndicesPrice(asset.symbol, false, 0, baseUrl)
                }

                if (data && data.price !== null) {
                    results[uniqueKey] = {
                        price: data.price,
                        date: data.date,
                        source: 'api'
                    }
                } else {
                    // Try fallback to latest DB price
                    const latestDb = await getLatestPriceFromDatabase(asset.type, asset.symbol)
                    if (latestDb) {
                        results[uniqueKey] = {
                            price: latestDb.price,
                            date: latestDb.date,
                            source: 'database_fallback'
                        }
                    } else {
                        results[uniqueKey] = { error: 'Price not found' }
                    }
                }
            } catch (e) {
                console.error(`Fetch failed for ${asset.symbol}`, e)
                try {
                    const latestDb = await getLatestPriceFromDatabase(asset.type, asset.symbol)
                    if (latestDb) {
                        results[uniqueKey] = {
                            price: latestDb.price,
                            date: latestDb.date,
                            source: 'database_fallback'
                        }
                    } else {
                        results[uniqueKey] = { error: 'Fetch failed' }
                    }
                } catch (dbError) {
                    results[uniqueKey] = { error: 'Fetch failed' }
                }
            }
        }))
    }

    return results
}
