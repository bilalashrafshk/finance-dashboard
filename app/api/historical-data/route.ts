import { NextRequest, NextResponse } from 'next/server'
import { ensureHistoricalData } from '@/lib/portfolio/historical-data-service'

/**
 * Historical Data API Route
 * 
 * GET /api/historical-data?assetType=pk-equity&symbol=PTC&market=PSX
 * 
 * Delegates to ensureHistoricalData service.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const assetType = searchParams.get('assetType')
  const symbol = searchParams.get('symbol')
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : undefined
  const skipCache = searchParams.get('skipCache') === 'true'

  if (!assetType || !symbol) {
    return NextResponse.json(
      { error: 'assetType and symbol parameters are required' },
      { status: 400 }
    )
  }

  try {
    const result = await ensureHistoricalData(assetType, symbol, limit, skipCache)

    return NextResponse.json({
      assetType,
      symbol: symbol.toUpperCase(),
      data: result.data,
      count: result.data.length,
      storedCount: result.data.length,
      newCount: 0,
      latestDate: result.latestDate,
      source: result.source,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error: any) {
    console.error(`Error in historical data API for ${assetType}-${symbol}:`, error)
    return NextResponse.json(
      { error: 'Failed to fetch historical data', details: error.message },
      { status: 500 }
    )
  }
}
