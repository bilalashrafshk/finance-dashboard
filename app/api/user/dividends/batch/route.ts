import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { cacheManager } from '@/lib/cache/cache-manager'
import { getDividendDataBatch } from '@/lib/portfolio/db-client'

/**
 * Batch Dividend API
 * 
 * GET /api/user/dividends/batch?tickers=HBL,UBL,MCB
 * 
 * Fetches dividends for multiple PK equity tickers in a single request from the database.
 * Does NOT trigger scraping for missing data (to ensure speed).
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

    // Fetch dividends from DB in one query
    const dividendsMap = await getDividendDataBatch('pk-equity', tickers)

    // Filter by purchase date if provided
    if (holdingsParam) {
      Object.keys(dividendsMap).forEach(ticker => {
        const purchaseDate = holdingsMap.get(ticker)
        if (purchaseDate) {
          dividendsMap[ticker] = dividendsMap[ticker].filter(d => d.date >= purchaseDate)
        }
      })
    }

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

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const body = await request.json()
    const { holdings } = body // Array of {symbol, purchaseDate}

    if (!holdings || !Array.isArray(holdings)) {
      return NextResponse.json(
        { success: false, error: 'holdings array is required' },
        { status: 400 }
      )
    }

    const tickers = holdings.map((h: any) => h.symbol)
    const holdingsMap = new Map<string, string>() // symbol -> purchaseDate
    holdings.forEach((h: any) => {
      holdingsMap.set(h.symbol.toUpperCase(), h.purchaseDate)
    })

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
      return NextResponse.json({ success: true, dividends: cached })
    }

    // Fetch dividends from DB in one query
    const dividendsMap = await getDividendDataBatch('pk-equity', tickers)

    // Filter by purchase date
    Object.keys(dividendsMap).forEach(ticker => {
      const purchaseDate = holdingsMap.get(ticker)
      if (purchaseDate) {
        dividendsMap[ticker] = dividendsMap[ticker].filter(d => d.date >= purchaseDate)
      }
    })

    // Cache the result for 5 minutes
    cacheManager.setWithCustomTTL(cacheKey, dividendsMap, 5 * 60 * 1000)

    return NextResponse.json({ success: true, dividends: dividendsMap })
  } catch (error: any) {
    console.error('Batch dividends API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dividends' },
      { status: 500 }
    )
  }
}

