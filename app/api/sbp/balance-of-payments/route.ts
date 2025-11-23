import { NextRequest, NextResponse } from 'next/server'
import { getBOPData, insertBOPData, shouldRefreshBOPData } from '@/lib/portfolio/db-client'

/**
 * Balance of Payments API Route
 * 
 * GET /api/sbp/balance-of-payments?seriesKey=TS_GP_ES_PKBOPSTND_M.BOPSNA01810&startDate=2020-01-01&endDate=2024-12-31
 * 
 * Fetches Pakistan's Balance of Payments data from SBP EasyData API.
 * - Checks database first
 * - Fetches from SBP EasyData API if data is older than 3 days
 * - Automatically stores fetched data in database
 * - Supports date ranges for historical data
 */

const SBP_API_BASE_URL = 'https://easydata.sbp.org.pk/api/v1/series'

interface SBPAPIResponse {
  columns: string[]
  rows: Array<Array<string | number>>
}

async function fetchBOPDataFromAPI(
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
    unit: String(row[unitColIdx] || 'Million USD'),
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
  
  // Validate series key format (Balance of Payments dataset)
  if (!seriesKey.startsWith('TS_GP_ES_PKBOPSTND_M.')) {
    return NextResponse.json(
      { error: 'Invalid seriesKey. Must be from Balance of Payments dataset (TS_GP_ES_PKBOPSTND_M.*)' },
      { status: 400 }
    )
  }
  
  try {
    // Check if we need to refresh (3-day cache)
    const needsRefresh = refresh || await shouldRefreshBOPData(seriesKey)
    
    if (needsRefresh) {
      console.log(`[BOP API] Fetching fresh data for ${seriesKey} (cache expired or refresh requested)`)
      
      // Fetch from API
      const apiData = await fetchBOPDataFromAPI(seriesKey, startDate, endDate)
      
      if (apiData.length > 0) {
        // Store in database
        const seriesName = apiData[0].series_name
        const insertResult = await insertBOPData(
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
        
        console.log(`[BOP API] Stored ${insertResult.inserted} new records, skipped ${insertResult.skipped} duplicates for ${seriesKey}`)
      }
    } else {
      console.log(`[BOP API] Using cached data for ${seriesKey} (less than 3 days old)`)
    }
    
    // Get data from database
    const { data, latestStoredDate, earliestStoredDate } = await getBOPData(
      seriesKey,
      startDate,
      endDate
    )
    
    // Sort by date descending (most recent first)
    const sortedData = [...data].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    
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
    console.error('[BOP API] Error fetching balance of payments data:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch Balance of Payments data',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

