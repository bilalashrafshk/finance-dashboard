import { NextRequest, NextResponse } from 'next/server'
import { ensureSBPEconomicData } from '@/lib/portfolio/sbp-service'

/**
 * SBP Economic Data API Route (CPI, GDP, etc.)
 * 
 * GET /api/sbp/economic-data?seriesKey=TS_GP_PT_CPI_M.P00011516&startDate=2020-01-01&endDate=2024-12-31
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const seriesKey = searchParams.get('seriesKey')
  const startDate = searchParams.get('startDate') || undefined
  const endDate = searchParams.get('endDate') || undefined
  const refresh = searchParams.get('refresh') === 'true'

  if (!seriesKey) {
    return NextResponse.json(
      { error: 'seriesKey parameter is required' },
      { status: 400 }
    )
  }

  try {
    const result = await ensureSBPEconomicData(seriesKey, startDate, endDate, refresh)

    // Sort by date descending (most recent first)
    const sortedData = [...result.data].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )

    if (sortedData.length === 0) {
      return NextResponse.json(
        {
          error: 'No data available for this series',
          details: 'Please check that SBP_API_KEY is set and the series key is correct'
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      seriesKey,
      seriesName: sortedData[0]?.series_name || '',
      data: sortedData,
      count: sortedData.length,
      startDate: startDate || null,
      endDate: endDate || null,
      latestStoredDate: result.latestStoredDate,
      earliestStoredDate: result.earliestStoredDate,
      source: result.source,
      cached: result.cached
    })
  } catch (error: any) {
    // Provide more specific error messages
    let errorMessage = error.message || 'Unknown error'
    let statusCode = 500

    if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
      errorMessage = 'Database tables do not exist. Please run the migration script or SQL schema.'
      statusCode = 500
    } else if (error.message?.includes('SBP_API_KEY')) {
      errorMessage = 'SBP_API_KEY environment variable is not set'
      statusCode = 500
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch economic data',
        details: errorMessage,
        hint: error.message?.includes('does not exist')
          ? 'Run the SQL from scripts/create-sbp-economic-tables.sql in your Neon SQL Editor'
          : undefined
      },
      { status: statusCode }
    )
  }
}

