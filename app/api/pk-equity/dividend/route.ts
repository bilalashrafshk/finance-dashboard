import { NextRequest, NextResponse } from 'next/server'
import { fetchDividendData } from '@/lib/portfolio/dividend-api'
import { insertDividendData, getDividendData, hasDividendData } from '@/lib/portfolio/db-client'

/**
 * PK Equity Dividend API Route
 * 
 * GET /api/pk-equity/dividend?ticker=HBL
 * GET /api/pk-equity/dividend?ticker=HBL&startDate=2020-01-01&endDate=2025-12-31
 * GET /api/pk-equity/dividend?ticker=HBL&refresh=true
 * 
 * Fetches and stores dividend data for PK equity assets.
 * - Returns stored dividend data if available
 * - Fetches from scstrade.com API if refresh=true or no data exists
 * - Automatically stores fetched data in database
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const ticker = searchParams.get('ticker')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const refresh = searchParams.get('refresh') === 'true'

  if (!ticker) {
    return NextResponse.json(
      { error: 'Ticker parameter is required' },
      { status: 400 }
    )
  }

  try {
    const tickerUpper = ticker.toUpperCase()
    const assetType = 'pk-equity'

    // Check if we have data and user doesn't want refresh
    if (!refresh) {
      const existingData = await getDividendData(assetType, tickerUpper, startDate || undefined, endDate || undefined)
      
      if (existingData.length > 0) {
        return NextResponse.json({
          ticker: tickerUpper,
          dividends: existingData,
          count: existingData.length,
          source: 'database'
        })
      }
    }

    // Fetch from API
    console.log(`[Dividend API] Fetching dividend data for ${tickerUpper}...`)
    const dividendData = await fetchDividendData(tickerUpper, 100)

    if (!dividendData || dividendData.length === 0) {
      // No dividend data available - return empty array (this is valid)
      return NextResponse.json({
        ticker: tickerUpper,
        dividends: [],
        count: 0,
        source: 'api',
        message: 'No dividend data available for this ticker'
      })
    }

    // Store in database
    try {
      const result = await insertDividendData(assetType, tickerUpper, dividendData, 'scstrade')
      console.log(`[Dividend API] Stored ${result.inserted} dividend records for ${tickerUpper}`)
    } catch (error: any) {
      console.error(`[Dividend API] Error storing dividend data for ${tickerUpper}:`, error.message)
      // Continue even if storage fails - return the data anyway
    }

    // Filter by date range if provided
    let filteredData = dividendData
    if (startDate || endDate) {
      filteredData = dividendData.filter(record => {
        if (startDate && record.date < startDate) return false
        if (endDate && record.date > endDate) return false
        return true
      })
    }

    return NextResponse.json({
      ticker: tickerUpper,
      dividends: filteredData,
      count: filteredData.length,
      source: 'api'
    })
  } catch (error: any) {
    console.error(`[Dividend API] Error fetching dividend data for ${ticker}:`, error)
    return NextResponse.json(
      { error: `Failed to fetch dividend data: ${error.message}` },
      { status: 500 }
    )
  }
}

