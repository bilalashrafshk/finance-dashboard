import { NextRequest, NextResponse } from 'next/server'
import { batchPriceSchema, AssetCategory } from '@/validations/market-data'
import { MarketDataService } from '@/lib/services/market-data'
import { fetchBinancePrice, parseSymbolToBinance } from '@/lib/portfolio/binance-api'
import { fetchMetalsPrice, fetchIndicesPrice } from '@/lib/portfolio/unified-price-api'
import { fetchPKEquityPriceService } from '@/lib/prices/pk-equity-service'


export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Map 'assets' to 'tokens' (legacy compatibility)
    // The previous implementation used 'assets', new schema uses 'tokens'
    // We should support 'assets' to avoid breaking frontend if it hasn't changed
    const payload = { tokens: body.tokens || body.assets }

    // 1. Validation
    const validation = batchPriceSchema.safeParse(payload)
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.format() }, { status: 400 })
    }

    const { tokens } = validation.data
    const service = MarketDataService.getInstance()

    // Determining Base URL for relative fetchers (if needed)
    // Most fetchers here are internal services or direct API calls, but some might need it
    const url = new URL(request.url)
    const baseUrl = url.origin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // 2. Map tokens to Batch Items for Service
    const batchItems = tokens.map(token => {
      const { symbol, type } = token
      const symbolUpper = symbol.toUpperCase()

      let fetcher: () => Promise<{ price: number, date: string } | null>

      if (type === 'crypto') {
        fetcher = async () => {
          const binanceSymbol = parseSymbolToBinance(symbolUpper)
          const price = await fetchBinancePrice(binanceSymbol)
          return price !== null ? { price, date: new Date().toISOString() } : null
        }
      } else if (type === 'pk-equity') {
        fetcher = async () => {
          const res = await fetchPKEquityPriceService(symbolUpper)
          return res ? { price: res.price, date: res.date } : null
        }
      } else if (type === 'us-equity' || type === 'equity') {
        fetcher = async () => {
          // Direct fetch to avoid API self-call deadlock
          const { getLatestPriceFromStockAnalysis } = await import('@/lib/portfolio/stockanalysis-api')
          const res = await getLatestPriceFromStockAnalysis(symbolUpper, 'US')
          return res ? { price: res.price, date: res.date } : null
        }
      } else if (type === 'metals') {
        fetcher = async () => {
          // Safe to call API as /api/metals/price is NOT using MarketDataService yet (Loop safe)
          const res = await fetchMetalsPrice(symbolUpper, false, 0, baseUrl)
          return res ? { price: res.price, date: res.date } : null
        }
      } else if (type === 'index' || type === 'spx500') {
        fetcher = async () => {
          // Safe to call API as /api/indices/price is NOT using MarketDataService yet (Loop safe)
          const res = await fetchIndicesPrice(symbolUpper, false, 0, baseUrl)
          return res ? { price: res.price, date: res.date } : null
        }
      } else {
        // Fallback for unknown types
        fetcher = async () => null
      }

      // Map legacy type to Service AssetCategory if needed
      // 'pk-equity', etc are now in AssetCategory enum, so we pass it directly
      return {
        category: type as AssetCategory,
        symbol: symbolUpper,
        fetcher
      }
    })

    // 3. Execute Batch
    const batchResults = await service.ensureBatchData<{ price: number; date: string } | null>(batchItems)

    // 4. Format Output (Match legacy format: Key = "TYPE:SYMBOL")
    const results: Record<string, any> = {}

    batchItems.forEach(item => {
      const key = `${item.category}:${item.symbol}`
      const data = batchResults[item.symbol]

      if (data) {
        results[key] = {
          price: data.price,
          date: data.date,
          source: 'market-data-service'
        }
      } else {
        // Returning null/error object mimics legacy behavior
        results[key] = { error: 'Price not found' }
      }
    })

    return NextResponse.json({ results })

  } catch (error) {
    console.error('Batch price API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
