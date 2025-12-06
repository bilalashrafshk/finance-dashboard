import { NextRequest, NextResponse } from 'next/server'
import { fetchBatchFinancials } from '@/lib/financials/batch-financials-service'

/**
 * Batch Financials API
 * 
 * POST /api/financials/batch
 * Body: { symbols: ['PTC', 'LUCK', 'HBL', ...], assetType: 'pk-equity' }
 * 
 * Delegates to fetchBatchFinancials service.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { symbols, assetType = 'pk-equity' } = body

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'Symbols array is required' }, { status: 400 })
    }

    const result = await fetchBatchFinancials(symbols, assetType)

    return NextResponse.json(result)

  } catch (error: any) {
    console.error('[Financials Batch] Error:', error)
    return NextResponse.json({
      error: 'Failed to fetch financials data',
      details: error.message
    }, { status: 500 })
  }
}
