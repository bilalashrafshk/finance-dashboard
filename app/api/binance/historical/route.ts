import { NextRequest, NextResponse } from 'next/server'
import { fetchBinanceHistoricalData } from '@/lib/portfolio/binance-historical-api'

/**
 * Binance Historical Data API Route
 * 
 * GET /api/binance/historical?symbol=BTC&startDate=2024-01-01&endDate=2025-01-01
 * 
 * Fetches historical cryptocurrency data from Binance API
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const symbol = searchParams.get('symbol')
  const startDate = searchParams.get('startDate') || undefined
  const endDate = searchParams.get('endDate') || undefined

  if (!symbol) {
    return NextResponse.json(
      { error: 'Symbol parameter is required' },
      { status: 400 }
    )
  }

  try {
    const data = await fetchBinanceHistoricalData(symbol, startDate, endDate)
    
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'No historical data found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      data,
      count: data.length,
    })
  } catch (error: any) {
    console.error('Error in Binance historical API:', error)
    return NextResponse.json(
      { error: 'Failed to fetch historical data', details: error.message },
      { status: 500 }
    )
  }
}



