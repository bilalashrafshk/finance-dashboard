import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { cacheManager } from '@/lib/cache/cache-manager'

/**
 * Batch Dividend API
 * 
 * GET /api/user/dividends/batch?tickers=HBL,UBL,MCB
 * 
 * Fetches dividends for multiple PK equity tickers in a single request.
 * Returns dividends for all requested tickers, filtered by purchase dates.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const tickersParam = searchParams.get('tickers')
    const holdingsParam = searchParams.get('holdings') // JSON array of {symbol, purchaseDate}

    if (!tickersParam && !holdingsParam) {
      return NextResponse.json(
        { success: false, error: 'tickers or holdings parameter is required' },
        { status: 400 }
      )
    }

    let tickers: string[] = []
    let holdingsMap = new Map<string, string>() // symbol -> purchaseDate

    if (holdingsParam) {
      try {
        const holdings = JSON.parse(holdingsParam)
        tickers = holdings.map((h: any) => h.symbol)
        holdings.forEach((h: any) => {
          holdingsMap.set(h.symbol.toUpperCase(), h.purchaseDate)
        })
      } catch (error) {
        return NextResponse.json(
          { success: false, error: 'Invalid holdings JSON format' },
          { status: 400 }
        )
      }
    } else {
      tickers = tickersParam!.split(',').map(t => t.trim()).filter(Boolean)
    }

    if (tickers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid tickers provided' },
        { status: 400 }
      )
    }

    // Check cache first
    const cacheKey = `dividends-batch:${tickers.sort().join(',')}`
    const cached = cacheManager.get<any>(cacheKey)
    if (cached) {
      return NextResponse.json(
        { success: true, dividends: cached },
        {
          headers: {
            'Cache-Control': 'private, max-age=300', // 5 minutes
            'X-Cache': 'HIT',
          },
        }
      )
    }

    // Fetch dividends for all tickers in parallel
    const baseUrl = request.nextUrl.origin
    const dividendPromises = tickers.map(async (ticker) => {
      try {
        const response = await fetch(`${baseUrl}/api/pk-equity/dividend?ticker=${encodeURIComponent(ticker)}`, {
          headers: {
            'Authorization': request.headers.get('Authorization') || '',
          },
        })

        if (!response.ok) {
          return { ticker: ticker.toUpperCase(), dividends: [], error: 'Failed to fetch' }
        }

        const data = await response.json()
        const dividends = data.dividends || []

        // Filter by purchase date if provided
        const purchaseDate = holdingsMap.get(ticker.toUpperCase())
        let filteredDividends = dividends
        if (purchaseDate) {
          filteredDividends = dividends.filter((d: any) => d.date >= purchaseDate)
        }

        return {
          ticker: ticker.toUpperCase(),
          dividends: filteredDividends,
        }
      } catch (error: any) {
        console.error(`Error fetching dividends for ${ticker}:`, error)
        return { ticker: ticker.toUpperCase(), dividends: [], error: error.message }
      }
    })

    const results = await Promise.all(dividendPromises)
    const dividendsMap: Record<string, any> = {}
    results.forEach(result => {
      dividendsMap[result.ticker] = result.dividends
    })

    // Cache the result for 5 minutes
    cacheManager.setWithCustomTTL(cacheKey, dividendsMap, 5 * 60 * 1000)

    return NextResponse.json(
      { success: true, dividends: dividendsMap },
      {
        headers: {
          'Cache-Control': 'private, max-age=300', // 5 minutes
          'X-Cache': 'MISS',
        },
      }
    )
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    console.error('Batch dividends API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dividends' },
      { status: 500 }
    )
  }
}

