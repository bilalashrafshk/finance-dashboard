/**
 * Client-side Investing.com API Integration
 * Fetches data directly from browser (bypasses Cloudflare protection)
 * 
 * Note: This must be called from the browser/client-side, not server-side
 */

export interface InvestingHistoricalDataPoint {
  date: string // ISO date string (YYYY-MM-DD)
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

export interface InvestingAPIResponse {
  data: Array<{
    rowDate: string
    rowDateTimestamp: string
    last_close: string
    last_open: string
    last_max: string
    last_min: string
    volume: string
    last_closeRaw?: string
    last_openRaw?: string
    last_maxRaw?: string
    last_minRaw?: string
    volumeRaw?: number
  }>
}

export const KSE100_INSTRUMENT_ID = '49677'
export const SPX500_INSTRUMENT_ID = '166'

// Metals Instrument IDs
export const GOLD_INSTRUMENT_ID = '68'
export const SILVER_INSTRUMENT_ID = '8836'
export const PALLADIUM_INSTRUMENT_ID = '8883'
export const PLATINUM_INSTRUMENT_ID = '8831'
export const COPPER_INSTRUMENT_ID = '8831' // TODO: Verify correct ID for Copper

/**
 * Fetch a single chunk of historical data from Investing.com API
 * Helper function that makes one API request
 * This works from the browser because it has cookies/session established
 */
async function fetchInvestingHistoricalDataChunk(
  instrumentId: string,
  startDateStr: string,
  endDateStr: string
): Promise<InvestingHistoricalDataPoint[] | null> {
  try {
    const url = `https://api.investing.com/api/financialdata/historical/${instrumentId}`
    
    const params = new URLSearchParams({
      'start-date': startDateStr,
      'end-date': endDateStr,
      'time-frame': 'Daily',
      'add-missing-rows': 'false',
    })

    // Headers that work from browser (tested and confirmed working via CORS test)
    // Note: Browser automatically sets Origin, User-Agent, and Accept-Encoding
    // CORS is allowed by Investing.com, so this works reliably from the browser
    const headers: Record<string, string> = {
      'Accept': '*/*',
      'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8,tr;q=0.7,zh-CN;q=0.6,zh;q=0.5,ru;q=0.4',
      'Referer': 'https://www.investing.com/',
      'domain-id': 'www',
      'Sec-CH-UA': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site', // Works as 'same-site' (tested and confirmed)
      'Priority': 'u=1, i',
    }

    const fullUrl = `${url}?${params.toString()}`
    
    // Use deduplication to prevent duplicate requests
    const { deduplicatedFetch } = await import('./request-deduplication')
    const response = await deduplicatedFetch(fullUrl, { headers })
    
    if (!response.ok) {
      console.error(`[Investing Client API] API error: ${response.status} ${response.statusText}`)
      return null
    }

    const responseText = await response.text()
    
    // Check if response is HTML (Cloudflare challenge page)
    if (responseText.trim().startsWith('<!DOCTYPE') || responseText.includes('challenge-platform')) {
      console.error('[Investing Client API] API returned HTML (likely Cloudflare protection)')
      return null
    }

    let data: InvestingAPIResponse
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      console.error('[Investing Client API] Failed to parse API response as JSON:', e)
      console.error('[Investing Client API] Response text (first 500 chars):', responseText.substring(0, 500))
      return null
    }
    
    // Check for API errors in response
    if (data.error || (data as any).message) {
      console.error('[Investing Client API] API returned error:', data.error || (data as any).message)
      console.error('[Investing Client API] Full response:', JSON.stringify(data, null, 2))
      return null
    }
    
    // Handle different possible response structures
    let dataArray: any[] | null = null
    
    if (data.data && Array.isArray(data.data)) {
      dataArray = data.data
    } else if (Array.isArray(data)) {
      // Sometimes the API returns the array directly
      dataArray = data as any
    } else if ((data as any).results && Array.isArray((data as any).results)) {
      dataArray = (data as any).results
    } else if ((data as any).historicalData && Array.isArray((data as any).historicalData)) {
      dataArray = (data as any).historicalData
    }
    
    if (!dataArray || dataArray.length === 0) {
      console.error('[Investing Client API] Invalid response format from API or empty data')
      console.error('[Investing Client API] Response structure:', {
        hasData: !!data.data,
        dataType: typeof data.data,
        dataIsArray: Array.isArray(data.data),
        keys: Object.keys(data),
        sample: JSON.stringify(data).substring(0, 500),
        responseLength: responseText.length
      })
      // Return empty array instead of null to allow aggregation to continue
      return []
    }
    
    // Convert API response to our format
    const dataPoints: InvestingHistoricalDataPoint[] = dataArray.map((entry) => {
      // Parse date
      const dateStr = entry.rowDateTimestamp || entry.rowDate
      let dateISO: string
      
      try {
        if (dateStr.includes('T')) {
          dateISO = dateStr.split('T')[0]
        } else {
          // Parse "Nov 09, 2015" format
          const dateObj = new Date(dateStr)
          dateISO = dateObj.toISOString().split('T')[0]
        }
      } catch {
        dateISO = entry.rowDateTimestamp?.split('T')[0] || ''
      }

      // Parse numbers - prefer Raw values if available
      const parseNumber = (str: string, rawStr?: string) => {
        if (rawStr) {
          return parseFloat(rawStr)
        }
        return parseFloat(str.replace(/,/g, ''))
      }

      const parseVolume = (volStr: string, volRaw?: number) => {
        if (volRaw !== undefined && volRaw !== null) {
          return volRaw
        }
        if (!volStr) return null
        
        const cleaned = volStr.replace(/,/g, '').toUpperCase().trim()
        if (cleaned.endsWith('B')) {
          return parseFloat(cleaned.replace('B', '')) * 1_000_000_000
        } else if (cleaned.endsWith('M')) {
          return parseFloat(cleaned.replace('M', '')) * 1_000_000
        } else if (cleaned.endsWith('K')) {
          return parseFloat(cleaned.replace('K', '')) * 1_000
        } else {
          return parseFloat(cleaned) || null
        }
      }

      return {
        date: dateISO,
        open: parseNumber(entry.last_open, entry.last_openRaw),
        high: parseNumber(entry.last_max, entry.last_maxRaw),
        low: parseNumber(entry.last_min, entry.last_minRaw),
        close: parseNumber(entry.last_close, entry.last_closeRaw),
        volume: parseVolume(entry.volume, entry.volumeRaw),
      }
    })

    return dataPoints
  } catch (error) {
    console.error(`[Investing Client API] Error fetching chunk ${startDateStr} to ${endDateStr}:`, error)
    return null
  }
}

/**
 * Fetch historical data from Investing.com API (client-side only)
 * Handles the 5000 data point limit by splitting large date ranges into multiple requests
 */
export async function fetchInvestingHistoricalDataClient(
  instrumentId: string,
  startDate?: string,
  endDate?: string
): Promise<InvestingHistoricalDataPoint[] | null> {
  try {
    const end = endDate ? new Date(endDate) : new Date()
    // Default start dates based on instrument type
    let defaultStart: Date
    if (instrumentId === SPX500_INSTRUMENT_ID) {
      defaultStart = new Date('1996-01-01')
    } else if (instrumentId === KSE100_INSTRUMENT_ID) {
      defaultStart = new Date('2000-01-01') // KSE100 has data from a long time ago
    } else if (instrumentId === GOLD_INSTRUMENT_ID) {
      defaultStart = new Date('1990-01-01') // Gold has data from 1990
    } else if (instrumentId === SILVER_INSTRUMENT_ID || instrumentId === PALLADIUM_INSTRUMENT_ID || instrumentId === PLATINUM_INSTRUMENT_ID || instrumentId === COPPER_INSTRUMENT_ID) {
      defaultStart = new Date('1970-01-01') // Fetch from as far back as possible (API will return earliest available)
    } else {
      defaultStart = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000) // Default to 1 year ago for others
    }
    const start = startDate ? new Date(startDate) : defaultStart
    
    const startDateStr = start.toISOString().split('T')[0]
    const endDateStr = end.toISOString().split('T')[0]
    
    // Calculate number of days
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    const MAX_POINTS_PER_REQUEST = 5000
    
    // If date range is small enough, make single request
    if (daysDiff <= MAX_POINTS_PER_REQUEST) {
      const dataPoints = await fetchInvestingHistoricalDataChunk(instrumentId, startDateStr, endDateStr)
      if (!dataPoints) return null
      
      // Sort by date (oldest first)
      return dataPoints.sort((a, b) => a.date.localeCompare(b.date))
    }
    
    // Date range is too large - split into multiple requests
    const chunks: Array<{ start: string; end: string }> = []
    let currentStart = new Date(start)
    
    // Create chunks of approximately MAX_POINTS_PER_REQUEST days each
    // Use slightly less (4800) to account for weekends/holidays and ensure we stay under limit
    const chunkSizeDays = MAX_POINTS_PER_REQUEST - 200 // 4800 days per chunk for safety
    
    while (currentStart < end) {
      const chunkEnd = new Date(currentStart)
      chunkEnd.setDate(chunkEnd.getDate() + chunkSizeDays)
      
      // Don't go past the end date
      if (chunkEnd > end) {
        chunkEnd.setTime(end.getTime())
      }
      
      chunks.push({
        start: currentStart.toISOString().split('T')[0],
        end: chunkEnd.toISOString().split('T')[0],
      })
      
      // Move to next chunk (start from day after current chunk end)
      currentStart = new Date(chunkEnd)
      currentStart.setDate(currentStart.getDate() + 1)
    }
    
    // Fetch all chunks in parallel (with a small delay between requests to avoid rate limiting)
    const allDataPoints: InvestingHistoricalDataPoint[] = []
    const chunkResults = await Promise.all(
      chunks.map(async (chunk, index) => {
        // Add small delay between requests to avoid rate limiting
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 100 * index))
        }
        return await fetchInvestingHistoricalDataChunk(instrumentId, chunk.start, chunk.end)
      })
    )
    
    // Aggregate results
    for (const chunkData of chunkResults) {
      if (chunkData && chunkData.length > 0) {
        allDataPoints.push(...chunkData)
      }
    }
    
    if (allDataPoints.length === 0) {
      console.error('[Investing Client API] No data points received from any chunk')
      return null
    }
    
    // Remove duplicates (by date) and sort
    const uniqueDataPoints = new Map<string, InvestingHistoricalDataPoint>()
    for (const point of allDataPoints) {
      // Keep the first occurrence of each date (or you could merge/average if needed)
      if (!uniqueDataPoints.has(point.date)) {
        uniqueDataPoints.set(point.date, point)
      }
    }
    
    const sortedDataPoints = Array.from(uniqueDataPoints.values()).sort((a, b) => a.date.localeCompare(b.date))
    
    return sortedDataPoints
  } catch (error) {
    console.error('Error fetching Investing.com historical data (client):', error)
    return null
  }
}

/**
 * Get the latest price from Investing.com API (client-side only)
 */
export async function getLatestPriceFromInvestingClient(
  instrumentId: string
): Promise<{ price: number; date: string } | null> {
  // Fetch last 30 days to get latest price
  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000)
  
  const data = await fetchInvestingHistoricalDataClient(
    instrumentId,
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0]
  )
  
  if (!data || data.length === 0) {
    return null
  }

  // Data is sorted oldest first, so get the last one
  const latest = data[data.length - 1]
  
  return {
    price: latest.close,
    date: latest.date,
  }
}

