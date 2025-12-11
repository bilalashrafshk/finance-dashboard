import { NextRequest, NextResponse } from 'next/server'
import { getSBPInterestRates, insertSBPInterestRates, shouldRefreshSBPInterestRates } from '@/lib/portfolio/db-client'

/**
 * SBP Interest Rates API Route
 * 
 * GET /api/sbp/interest-rates?seriesKey=TS_GP_IR_SIRPR_AH.SBPOL0030&startDate=2020-01-01&endDate=2024-12-31
 * 
 * Fetches State Bank of Pakistan interest rate data.
 * - Checks database first
 * - Fetches from SBP API if data is older than 3 days
 * - Automatically stores fetched data in database
 * - Supports date ranges for historical data
 */

const SBP_API_BASE_URL = 'https://easydata.sbp.org.pk/api/v1/series'

interface SBPAPIResponse {
  columns: string[]
  rows: Array<Array<string | number>>
}

async function fetchSBPInterestRatesFromAPI(
  seriesKey: string,
  startDate?: string,
  endDate?: string
): Promise<Array<{
  date: string
  value: number
  unit: string
  observation_status: string
  status_comments: string
  series_name: string
}>> {
  const apiKey = process.env.SBP_API_KEY

  if (!apiKey) {
    throw new Error('SBP_API_KEY environment variable is not set')
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    format: 'json'
  })

  if (startDate) {
    params.append('start_date', startDate)
  }
  if (endDate) {
    params.append('end_date', endDate)
  }

  const url = `${SBP_API_BASE_URL}/${seriesKey}/data?${params.toString()}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`SBP API error (${response.status}): ${errorText.substring(0, 200)}`)
  }

  const data: SBPAPIResponse = await response.json()

  if (!data.rows || data.rows.length === 0) {
    return []
  }

  // Find column indices
  const dateColIdx = data.columns.findIndex(col =>
    col.toLowerCase().includes('date') || col.toLowerCase().includes('observation date')
  )
  const valueColIdx = data.columns.findIndex(col =>
    col.toLowerCase().includes('value') || col.toLowerCase().includes('observation value')
  )
  const seriesNameColIdx = data.columns.findIndex(col =>
    col.toLowerCase().includes('series name')
  )
  const unitColIdx = data.columns.findIndex(col =>
    col.toLowerCase().includes('unit')
  )
  const statusColIdx = data.columns.findIndex(col =>
    col.toLowerCase().includes('status') && !col.toLowerCase().includes('comment')
  )
  const commentsColIdx = data.columns.findIndex(col =>
    col.toLowerCase().includes('comment')
  )

  return data.rows.map(row => ({
    date: String(row[dateColIdx] || ''),
    value: parseFloat(String(row[valueColIdx] || 0)),
    unit: String(row[unitColIdx] || 'Percent'),
    observation_status: String(row[statusColIdx] || 'Normal'),
    status_comments: String(row[commentsColIdx] || ''),
    series_name: String(row[seriesNameColIdx] || '')
  }))
}

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

  // Validate series key format
  const validSeriesKeys = [
    'TS_GP_IR_SIRPR_AH.SBPOL0010', // Reverse Repo Rate
    'TS_GP_IR_SIRPR_AH.SBPOL0020', // Repo Rate
    'TS_GP_IR_SIRPR_AH.SBPOL0030', // Policy Target Rate
  ]

  if (!validSeriesKeys.includes(seriesKey)) {
    return NextResponse.json(
      { error: `Invalid seriesKey. Must be one of: ${validSeriesKeys.join(', ')}` },
      { status: 400 }
    )
  }

  try {
    // Check if we need to refresh (3-day cache)
    const needsRefresh = refresh || await shouldRefreshSBPInterestRates(seriesKey)

    // Get data from database first
    let { data, latestStoredDate, earliestStoredDate } = await getSBPInterestRates(
      seriesKey,
      startDate,
      endDate
    )

    // If no data in database or needs refresh, fetch from API
    if (needsRefresh || data.length === 0) {


      try {
        // If no date range provided, fetch all available historical data
        // Set default start date based on series (earliest available date)
        let fetchStartDate = startDate
        let fetchEndDate = endDate

        if (!fetchStartDate) {
          // Set start date based on series availability
          if (seriesKey.includes('SBPOL0030')) {
            // Policy Target Rate - started May 2015
            fetchStartDate = '2015-05-25'
          } else if (seriesKey.includes('SBPOL0020')) {
            // Repo Rate - started August 2009
            fetchStartDate = '2009-08-17'
          } else if (seriesKey.includes('SBPOL0010')) {
            // Reverse Repo Rate - started January 1956
            fetchStartDate = '1956-01-01'
          } else {
            // Default: 10 years back
            const date = new Date()
            date.setFullYear(date.getFullYear() - 10)
            fetchStartDate = date.toISOString().split('T')[0]
          }
        }

        if (!fetchEndDate) {
          // Default end date: today
          fetchEndDate = new Date().toISOString().split('T')[0]
        }

        // Fetch from API with date range
        const apiData = await fetchSBPInterestRatesFromAPI(seriesKey, fetchStartDate, fetchEndDate)

        if (apiData.length > 0) {
          // Store in database
          const seriesName = apiData[0].series_name
          const insertResult = await insertSBPInterestRates(
            seriesKey,
            seriesName,
            apiData.map(d => ({
              date: d.date,
              value: d.value,
              unit: d.unit,
              observation_status: d.observation_status,
              status_comments: d.status_comments
            }))
          )



          // Re-fetch from database to get the stored data
          const dbResult = await getSBPInterestRates(seriesKey, startDate, endDate)
          data = dbResult.data
          latestStoredDate = dbResult.latestStoredDate
          earliestStoredDate = dbResult.earliestStoredDate
        } else {

        }
      } catch (apiError: any) {
        console.error(`[SBP API] Error fetching from API for ${seriesKey}:`, apiError.message)
        // If API fails but we have data in DB, use that
        if (data.length === 0) {
          throw apiError // Only throw if we have no data at all
        }

      }
    } else {

    }

    // Sort by date descending (most recent first)
    const sortedData = [...data].sort((a, b) =>
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
      latestStoredDate,
      earliestStoredDate,
      source: needsRefresh ? 'api' : 'database',
      cached: !needsRefresh
    })
  } catch (error: any) {
    console.error('[SBP API] Error fetching interest rates:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch SBP interest rates',
        details: error.message
      },
      { status: 500 }
    )
  }
}

