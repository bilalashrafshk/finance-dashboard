import { NextRequest, NextResponse } from 'next/server'
import { fetchBatchPrices } from '@/lib/prices/batch-price-service'

/**
 * Batch Price API
 * 
 * POST /api/prices/batch
 * Body: { assets: [{ type: 'crypto', symbol: 'BTC' }, { type: 'pk-equity', symbol: 'LUCK' }] }
 * 
 * Delegates to fetchBatchPrices service.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { assets } = body

    if (!assets || !Array.isArray(assets)) {
      return NextResponse.json({ error: 'Invalid assets array' }, { status: 400 })
    }

    // Determine base URL for internal API calls (passed to service)
    const url = new URL(request.url)
    const baseUrl = url.origin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

    const results = await fetchBatchPrices(assets, baseUrl)

    return NextResponse.json({ results })

  } catch (error) {
    console.error('Batch price API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
