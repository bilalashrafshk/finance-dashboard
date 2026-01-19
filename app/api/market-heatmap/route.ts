import { NextRequest, NextResponse } from 'next/server'
import { getDbClient } from '@/lib/portfolio/db-client'

import { getTodayInMarketTimezone, isMarketClosed } from '@/lib/portfolio/market-hours'

// Dynamic route (relying on cache headers)

export interface MarketHeatmapStock {
  symbol: string
  name: string
  marketCap: number
  price: number
  previousPrice: number | null
  changePercent: number | null
  sector: string | null
  industry: string | null
}

/**
 * GET /api/market-heatmap?date=2024-01-15&limit=100
 * 
 * Returns top N PK equities by market cap with price data for the specified date
 * Includes previous day's price to calculate change percentage
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const limit = parseInt(searchParams.get('limit') || '100', 10)
    const timeframe = searchParams.get('timeframe') || '1D' // 1D, 1W, 1M, YTD
    const startDateParam = searchParams.get('startDate') || undefined

    if (!date) {
      return NextResponse.json({ error: 'Date parameter is required (YYYY-MM-DD)' }, { status: 400 })
    }

    // Validate simple YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }

    const { MarketHeatmapService } = await import('@/lib/market/heatmap-service')
    const result = await MarketHeatmapService.getHeatmapData(date, limit, timeframe, startDateParam)

    const response = NextResponse.json({
      success: true,
      ...result,
      count: result.stocks.length
    })

    // Dynamic Cache Control
    const isHistoricalParams = date < getTodayInMarketTimezone('PSX')
    let cacheControl = 'public, max-age=300, stale-while-revalidate=600' // Default: 5 min cache

    if (isHistoricalParams) {
      // Historical data check
      const now = new Date()
      const queryDate = new Date(date)
      const diffTime = Math.abs(now.getTime() - queryDate.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

      if (diffDays <= 7) {
        // Recent history (last 7 days): Cache short-term to allow updates (e.g. error corrections)
        cacheControl = 'public, max-age=3600, stale-while-revalidate=86400'
      } else {
        // Deep history: Immutable (1 year)
        cacheControl = 'public, max-age=31536000, immutable'
      }
    } else {
      // Today's data
      if (isMarketClosed('PSX')) {
        cacheControl = 'public, max-age=3600, stale-while-revalidate=86400'
      }
    }

    response.headers.set('Cache-Control', cacheControl)
    return response

  } catch (error: any) {
    console.error('Heatmap API Error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch heatmap', details: error.message }, { status: 500 })
  }
}

