
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { getPortfolioHistory } from '@/lib/portfolio/portfolio-history-service'

// GET - Get historical portfolio value
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const url = new URL(request.url)
    const currency = url.searchParams.get('currency') || 'USD'
    const unified = url.searchParams.get('unified') === 'true'
    const daysParam = url.searchParams.get('days')
    const forceRefresh = url.searchParams.get('refresh') === 'true'
    const assetType = url.searchParams.get('assetType') || undefined

    const days = daysParam && daysParam !== 'ALL' ? parseInt(daysParam) : 'ALL'

    const { history, isCached, lastUpdated } = await getPortfolioHistory(
      user.id,
      {
        currency,
        unified,
        days: days as number | 'ALL',
        assetType
      },
      forceRefresh
    )

    // Set cache headers
    // Stale-while-revalidate strategy:
    // - Client cache: 300s (5 min)
    // - SWR: 60s
    const headers = {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      'X-Is-Cached': isCached.toString(),
      'X-History-Count': history.length.toString(),
      ...(lastUpdated ? { 'Last-Modified': new Date(lastUpdated).toUTCString() } : {})
    }

    return NextResponse.json(
      {
        success: true,
        history,
        meta: {
          cached: isCached,
          lastUpdated
        }
      },
      { headers }
    )

  } catch (error: any) {
    console.error('Error fetching portfolio history:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get portfolio history',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

