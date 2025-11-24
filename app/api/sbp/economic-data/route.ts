import { NextRequest, NextResponse } from 'next/server'
import { getSBPEconomicData, insertSBPEconomicData, shouldRefreshSBPEconomicData } from '@/lib/portfolio/db-client'

/**
 * SBP Economic Data API Route (CPI, GDP, etc.)
 * 
 * GET /api/sbp/economic-data?seriesKey=TS_GP_PT_CPI_M.P00011516&startDate=2020-01-01&endDate=2024-12-31
 * 
 * Fetches economic data from SBP EasyData API.
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

async function fetchSBPEconomicDataFromAPI(
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
  
  try {
    // Get data from database first (will return empty if table doesn't exist)
    let { data, latestStoredDate, earliestStoredDate } = await getSBPEconomicData(
      seriesKey,
      startDate,
      endDate
    )
    
    // Check if we need to refresh (3-day cache)
    // If table doesn't exist, shouldRefreshSBPEconomicData will return null, which means we should refresh
    let needsRefresh = refresh
    try {
      needsRefresh = refresh || await shouldRefreshSBPEconomicData(seriesKey)
    } catch (error: any) {
      // If metadata table doesn't exist, treat as needs refresh
      if (error.message.includes('does not exist') || error.code === '42P01') {
        needsRefresh = true
      } else {
        throw error
      }
    }
    
    // If no data in database or needs refresh, fetch from API
    if (needsRefresh || data.length === 0) {
      console.log(`[Economic Data API] Fetching fresh data for ${seriesKey} (cache expired, refresh requested, or no data in DB)`)
      
      try {
        // Determine default start date based on series key
        let fetchStartDate = startDate
        let fetchEndDate = endDate
        
        if (!fetchStartDate) {
          // Set default start dates based on series key patterns
          if (seriesKey.includes('CPI')) {
            fetchStartDate = '2016-07-01' // CPI starts from Jul 2016
          } else if (seriesKey.includes('GDP')) {
            fetchStartDate = '2001-01-01' // GDP from 2001
          } else if (seriesKey.includes('ER_FAERPKR')) {
            fetchStartDate = '1947-08-01' // Exchange rate from Aug 1947
          } else if (seriesKey.includes('BOP_WR')) {
            fetchStartDate = '1972-07-01' // Remittances from Jul 1972
          } else if (seriesKey.includes('KIBOR')) {
            fetchStartDate = '2005-06-09' // KIBOR from Jun 2005
          } else if (seriesKey.includes('BOP_BPM6SUM')) {
            fetchStartDate = '2013-07-01' // SBP Gross Reserves from Jul 2013
          } else if (seriesKey.includes('FI_SUMFIPK')) {
            fetchStartDate = '1997-07-01' // Net FDI from Jul 1997
          } else if (seriesKey.includes('BAM_M2_W')) {
            fetchStartDate = '2014-07-04' // Broad Money M2 from Jul 2014
          } else if (seriesKey.includes('PSAUTO_M')) {
            fetchStartDate = '2004-07-01' // Vehicle sales from Jul 2004
          } else if (seriesKey.includes('CEMSEC_M')) {
            fetchStartDate = '1991-07-01' // Cement sales from Jul 1991
          } else if (seriesKey.includes('ELECGEN_M')) {
            fetchStartDate = '2012-07-01' // Electricity generation from Jul 2012
          } else if (seriesKey.includes('POLSALE_M')) {
            fetchStartDate = '2013-07-01' // POL sales from Jul 2013
          } else if (seriesKey.includes('BOP_SCRA_W')) {
            fetchStartDate = '2007-07-07' // SCRA from Jul 2007
          }
        }
        
        if (!fetchEndDate) {
          // Default end date: today
          fetchEndDate = new Date().toISOString().split('T')[0]
        }
        
        // Fetch from API with date range
        const apiData = await fetchSBPEconomicDataFromAPI(seriesKey, fetchStartDate, fetchEndDate)
      
        if (apiData.length > 0) {
          // Store in database
          const seriesName = apiData[0].series_name
          const insertResult = await insertSBPEconomicData(
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
          
          console.log(`[Economic Data API] Stored ${insertResult.inserted} new records, skipped ${insertResult.skipped} duplicates for ${seriesKey}`)
          
          // Re-fetch from database to get the stored data
          const dbResult = await getSBPEconomicData(seriesKey, startDate, endDate)
          data = dbResult.data
          latestStoredDate = dbResult.latestStoredDate
          earliestStoredDate = dbResult.earliestStoredDate
        } else {
          console.log(`[Economic Data API] No data returned from API for ${seriesKey}`)
        }
      } catch (apiError: any) {
        console.error(`[Economic Data API] Error fetching from API for ${seriesKey}:`, apiError.message)
        // If API fails but we have data in DB, use that
        if (data.length === 0) {
          throw apiError // Only throw if we have no data at all
        }
        console.log(`[Economic Data API] Using existing database data despite API error`)
      }
    } else {
      console.log(`[Economic Data API] Using cached data for ${seriesKey} (less than 3 days old)`)
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
    console.error('[Economic Data API] Error fetching economic data:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch economic data',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

