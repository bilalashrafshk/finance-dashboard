import { NextRequest, NextResponse } from 'next/server'
import { fetchStockAnalysisData } from '@/lib/portfolio/stockanalysis-api'

/**
 * StockAnalysis Historical Data API Route
 * 
 * GET /api/stockanalysis/historical?ticker=PTC&market=PSX
 * 
 * Fetches historical data from StockAnalysis.com API
 * Supports both PSX and US equities
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const ticker = searchParams.get('ticker')
  const market = (searchParams.get('market') || 'PSX') as 'PSX' | 'US'

  if (!ticker) {
    return NextResponse.json(
      { error: 'Ticker parameter is required' },
      { status: 400 }
    )
  }

  try {
    const data = await fetchStockAnalysisData(ticker.toUpperCase(), market)
    
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'No historical data found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ticker: ticker.toUpperCase(),
      market,
      data,
      count: data.length,
    })
  } catch (error: any) {
    console.error('Error in StockAnalysis historical API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch historical data', details: error.message },
      { status: 500 }
    )
  }
}


