import { NextRequest, NextResponse } from 'next/server'
import { fetchScreenerBatchData } from '@/lib/screener/batch-data-fetcher'

/**
 * Screener Data Batch API
 * 
 * POST /api/screener/data-batch
 * Body: { symbols: ['PTC', 'LUCK', 'HBL', ...], assetType: 'pk-equity' }
 * 
 * Efficiently fetches all data needed for screener calculations:
 * - Latest prices
 * - Company profiles (sector, industry, face_value, market_cap)
 * - Financials (last 4 quarters for EPS calculation)
 * 
 * Optimized for 200+ assets with minimal database queries.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { symbols, assetType = 'pk-equity' } = body

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'Symbols array is required' }, { status: 400 })
    }

    const results = await fetchScreenerBatchData(symbols, assetType)

    return NextResponse.json({ 
      results,
      count: Object.keys(results).length,
      requested: symbols.length
    })
  } catch (error: any) {
    console.error('[Screener Data Batch] Error:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch screener data',
      details: error.message 
    }, { status: 500 })
  }
}

