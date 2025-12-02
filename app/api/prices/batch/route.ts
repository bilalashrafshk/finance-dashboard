import { NextRequest, NextResponse } from 'next/server'
import { getTodayPriceFromDatabase, getTodayPriceWithTimestamp, getLatestPriceFromDatabase } from '@/lib/portfolio/db-client'
import { getTodayInMarketTimezone, isMarketClosed } from '@/lib/portfolio/market-hours'
import { fetchMultipleBinancePrices, parseSymbolToBinance } from '@/lib/portfolio/binance-api'
import { fetchPKEquityPrice, fetchUSEquityPrice, fetchMetalsPrice, fetchIndicesPrice } from '@/lib/portfolio/unified-price-api'

/**
 * Batch Price API
 * 
 * POST /api/prices/batch
 * Body: { assets: [{ type: 'crypto', symbol: 'BTC' }, { type: 'pk-equity', symbol: 'LUCK' }] }
 * 
 * Fetches prices for multiple assets efficiently:
 * 1. Groups assets by type
 * 2. Checks database first for all assets
 * 3. For stale/missing data, performs optimized external fetching:
 *    - Crypto: Uses Binance bulk endpoint (1 request for all)
 *    - Others: Fetches individually (parallelized)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { assets } = body

    if (!assets || !Array.isArray(assets)) {
      return NextResponse.json({ error: 'Invalid assets array' }, { status: 400 })
    }

    const results: Record<string, any> = {}
    const assetsToFetch: typeof assets = []

    // 1. Check DB for all assets
    // We do this in parallel for speed
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

      // Determine base URL for internal API calls
      const url = new URL(request.url)
      const baseUrl = url.origin ||
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

      // Bulk fetch Crypto (efficient)
      if (cryptoAssets.length > 0) {
        const symbols = cryptoAssets.map((a: any) => parseSymbolToBinance(a.symbol))
        try {
          // We use the centralized route logic by calling the library function, 
          // BUT we can optimize by calling the bulk binance function directly here 
          // to save time, then we'd need to handle DB insertion.
          // To keep it simple and "wrapper-like" as requested, we can just call 
          // the unified API for each, but let's try to be smarter for crypto at least.

          // For true bulk efficiency, we get all prices from Binance in 1 go
          const prices = await fetchMultipleBinancePrices(symbols)

          // Now we update DB for each found price
          // We can do this asynchronously without blocking the response if we want speed,
          // but for data integrity we'll await. To speed up, we run parallel DB inserts.
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

              // We need to update the DB so next time it's cached
              // We return the live values to the user NOW (fast).
              // We trigger the DB updates in the background (fire and forget).

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
      // These APIs (StockAnalysis/Investing) don't support bulk well anyway
      await Promise.all(otherAssets.map(async (asset: any) => {
        const uniqueKey = `${asset.type}:${asset.symbol.toUpperCase()}`
        let data = null

        try {
          if (asset.type === 'pk-equity') {
            data = await fetchPKEquityPrice(asset.symbol, false, baseUrl)
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
              source: 'api' // or what the api returned
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
          // Try fallback to latest DB price on error too
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

    return NextResponse.json({ results })

  } catch (error) {
    console.error('Batch price API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

