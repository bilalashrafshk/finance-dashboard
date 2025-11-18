import { NextRequest, NextResponse } from 'next/server'
import { insertHistoricalData } from '@/lib/portfolio/db-client'

/**
 * POST /api/commodity/price
 * 
 * Store or update commodity price data
 * Used for commodities that don't have external price APIs
 * 
 * Body: {
 *   symbol: string (commodity name, e.g., "OIL", "WHEAT")
 *   date: string (YYYY-MM-DD)
 *   price: number (price per unit)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { symbol, date, price } = body

    if (!symbol || !date || price === undefined) {
      return NextResponse.json(
        { error: 'symbol, date, and price are required' },
        { status: 400 }
      )
    }

    if (isNaN(parseFloat(price)) || parseFloat(price) < 0) {
      return NextResponse.json(
        { error: 'price must be a valid positive number' },
        { status: 400 }
      )
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(date)) {
      return NextResponse.json(
        { error: 'date must be in YYYY-MM-DD format' },
        { status: 400 }
      )
    }

    // Store in historical_price_data table
    // For commodities, we use the same structure as other assets
    const priceRecord = {
      date,
      open: parseFloat(price),
      high: parseFloat(price),
      low: parseFloat(price),
      close: parseFloat(price),
      volume: null,
      adjusted_close: null,
      change_pct: null,
    }

    await insertHistoricalData(
      'commodities',
      symbol.toUpperCase().trim(),
      [priceRecord],
      'manual' // source
    )

    return NextResponse.json({
      success: true,
      message: 'Commodity price stored successfully',
      data: {
        symbol: symbol.toUpperCase().trim(),
        date,
        price: parseFloat(price),
      },
    })
  } catch (error: any) {
    console.error('Error storing commodity price:', error)
    return NextResponse.json(
      { error: 'Failed to store commodity price', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/commodity/price?symbol=OIL&date=2024-01-15
 * 
 * Retrieve commodity price for a specific date
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const symbol = searchParams.get('symbol')
    const date = searchParams.get('date')

    if (!symbol || !date) {
      return NextResponse.json(
        { error: 'symbol and date parameters are required' },
        { status: 400 }
      )
    }

    const { getHistoricalDataWithMetadata } = await import('@/lib/portfolio/db-client')
    const result = await getHistoricalDataWithMetadata(
      'commodities',
      symbol.toUpperCase().trim(),
      date,
      date,
      1
    )

    if (result.data.length === 0) {
      return NextResponse.json(
        { error: 'No price data found for this commodity and date' },
        { status: 404 }
      )
    }

    const priceData = result.data[0]

    return NextResponse.json({
      success: true,
      symbol: symbol.toUpperCase().trim(),
      date,
      price: parseFloat(priceData.close),
      data: priceData,
    })
  } catch (error: any) {
    console.error('Error retrieving commodity price:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve commodity price', details: error.message },
      { status: 500 }
    )
  }
}

