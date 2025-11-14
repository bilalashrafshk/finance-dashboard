/**
 * Investing.com API Integration
 * Fetches historical data for indices (e.g., KSE 100, S&P 500)
 */

// Instrument IDs
export const KSE100_INSTRUMENT_ID = '49677'
export const SPX500_INSTRUMENT_ID = '166'

// Metals Instrument IDs
export const GOLD_INSTRUMENT_ID = '68'
export const SILVER_INSTRUMENT_ID = '8836'
export const PALLADIUM_INSTRUMENT_ID = '8883'
export const PLATINUM_INSTRUMENT_ID = '8831'
export const COPPER_INSTRUMENT_ID = '8831' // TODO: Verify correct ID for Copper

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
    last_closeRaw?: string // Raw numeric value (preferred if available)
    last_openRaw?: string
    last_maxRaw?: string
    last_minRaw?: string
  }>
}

/**
 * Fetch historical data from Investing.com API
 * @param instrumentId - The instrument ID (e.g., 49677 for KSE 100)
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD), defaults to today
 */
export async function fetchInvestingHistoricalData(
  instrumentId: string,
  startDate?: string,
  endDate?: string
): Promise<InvestingHistoricalDataPoint[] | null> {
  try {
    const url = `https://api.investing.com/api/financialdata/historical/${instrumentId}`
    
    const end = endDate ? new Date(endDate) : new Date()
    // Default start dates based on instrument type
    let defaultStart: Date
    if (instrumentId === SPX500_INSTRUMENT_ID) {
      defaultStart = new Date('1996-01-01')
    } else if (instrumentId === GOLD_INSTRUMENT_ID) {
      defaultStart = new Date('1990-01-01') // Gold has data from 1990
    } else if (instrumentId === SILVER_INSTRUMENT_ID || instrumentId === PALLADIUM_INSTRUMENT_ID || instrumentId === PLATINUM_INSTRUMENT_ID || instrumentId === COPPER_INSTRUMENT_ID) {
      defaultStart = new Date('1970-01-01') // Fetch from as far back as possible (API will return earliest available)
    } else {
      defaultStart = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000) // Default to 1 year ago for others
    }
    const start = startDate ? new Date(startDate) : defaultStart
    
    const params = new URLSearchParams({
      'start-date': start.toISOString().split('T')[0],
      'end-date': end.toISOString().split('T')[0],
      'time-frame': 'Daily',
      'add-missing-rows': 'false',
    })

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8,tr;q=0.7,zh-CN;q=0.6,zh;q=0.5,ru;q=0.4',
      'Origin': 'https://www.investing.com',
      'Referer': 'https://www.investing.com/',
      'domain-id': 'www',
      'Sec-CH-UA': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'Priority': 'u=1, i',
    }

    const response = await fetch(`${url}?${params.toString()}`, { headers })
    
    if (!response.ok) {
      console.error(`Investing.com API error: ${response.status} ${response.statusText}`)
      const errorText = await response.text()
      if (errorText.includes('Just a moment') || errorText.includes('challenge-platform')) {
        console.error('Investing.com API is blocked by Cloudflare protection')
      }
      return null
    }

    const responseText = await response.text()
    
    // Check if response is HTML (Cloudflare challenge page)
    if (responseText.trim().startsWith('<!DOCTYPE') || responseText.includes('challenge-platform')) {
      console.error('Investing.com API returned HTML (likely Cloudflare protection)')
      return null
    }

    let data: InvestingAPIResponse
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      console.error('Failed to parse Investing.com API response as JSON:', e)
      console.error('Response preview:', responseText.substring(0, 200))
      return null
    }
    
    if (!data.data || !Array.isArray(data.data)) {
      console.error('Invalid response format from Investing.com API. Response:', data)
      return null
    }

    // Convert API response to our format
    const dataPoints: InvestingHistoricalDataPoint[] = data.data.map((entry) => {
      // Parse date from "Nov 24, 2014" format
      const dateStr = entry.rowDateTimestamp || entry.rowDate
      const date = new Date(dateStr)
      const dateISO = date.toISOString().split('T')[0]
      
      // Parse numbers - prefer Raw values if available, otherwise parse formatted strings
      const parseNumber = (str: string, rawStr?: string) => {
        if (rawStr) {
          return parseFloat(rawStr)
        }
        return parseFloat(str.replace(/,/g, ''))
      }
      const parseVolume = (str: string) => {
        if (!str) return null
        const cleaned = str.replace(/,/g, '').toUpperCase()
        if (cleaned.endsWith('M')) {
          return parseFloat(cleaned.replace('M', '')) * 1000000
        } else if (cleaned.endsWith('K')) {
          return parseFloat(cleaned.replace('K', '')) * 1000
        } else if (cleaned.endsWith('B')) {
          return parseFloat(cleaned.replace('B', '')) * 1000000000
        }
        return parseFloat(cleaned)
      }
      
      return {
        date: dateISO,
        open: parseNumber(entry.last_open, entry.last_openRaw),
        high: parseNumber(entry.last_max, entry.last_maxRaw),
        low: parseNumber(entry.last_min, entry.last_minRaw),
        close: parseNumber(entry.last_close, entry.last_closeRaw),
        volume: parseVolume(entry.volume),
      }
    })

    // Sort by date (oldest first)
    return dataPoints.sort((a, b) => a.date.localeCompare(b.date))
  } catch (error) {
    console.error(`Error fetching Investing.com historical data:`, error)
    return null
  }
}

/**
 * Get the latest price from historical data
 */
export async function getLatestPriceFromInvesting(
  instrumentId: string
): Promise<{ price: number; date: string } | null> {
  // Fetch last 30 days to get latest price
  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000)
  
  const data = await fetchInvestingHistoricalData(
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


