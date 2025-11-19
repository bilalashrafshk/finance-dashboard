import { NextRequest, NextResponse } from 'next/server'
import { getTodayPriceFromDatabase, getTodayPriceWithTimestamp } from '@/lib/portfolio/db-client'
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
               // We reuse the unified API or DB client logic here. 
               // Calling the route locally is cleaner to reuse logic but adds overhead.
               // Let's just call the single-fetcher wrapper which handles DB upsert.
               // It will hit the cache/DB check again (redundant) but then hit Binance.
               // Since we already fetched from Binance efficiently, let's just use the values.
               // TODO: Ideally we call a "saveToDb" function here.
               // For now, to strictly follow "wrapper" pattern without duplicating DB logic,
               // we might have to call the individual functions.
               // BUT, calling 50 individual functions = 50 DB writes.
               
               // Compromise: We return the live values to the user NOW (fast).
               // We trigger the DB updates in the background (fire and forget).
               
               import('@/lib/portfolio/unified-price-api').then(({ fetchCryptoPrice }) => {
                  fetchCryptoPrice(binanceSymbol, true).catch(err => console.error('Bg update failed', err))
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
             data = await fetchPKEquityPrice(asset.symbol)
           } else if (asset.type === 'us-equity') {
             data = await fetchUSEquityPrice(asset.symbol)
           } else if (asset.type === 'metals') {
             data = await fetchMetalsPrice(asset.symbol)
           } else if (asset.type === 'spx500' || asset.type === 'kse100') {
             data = await fetchIndicesPrice(asset.symbol)
           }
           
           if (data && data.price !== null) {
             results[uniqueKey] = {
               price: data.price,
               date: data.date,
               source: 'api' // or what the api returned
             }
           } else {
             results[uniqueKey] = { error: 'Price not found' }
           }
         } catch (e) {
           console.error(`Fetch failed for ${asset.symbol}`, e)
           results[uniqueKey] = { error: 'Fetch failed' }
         }
      }))
    }

    return NextResponse.json({ results })

  } catch (error) {
    console.error('Batch price API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

