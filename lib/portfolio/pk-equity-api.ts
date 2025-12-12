/**
 * PK Equity API Client
 * Fetches historical price data from manual/secondary source for PK equity stocks
 * Secondary/fallback source for PK equity prices (used when StockAnalysis fails)
 */

export interface SourceDataPoint {
  trading_Date: string // "/Date(timestamp)/" format
  trading_open: number
  trading_high: number
  trading_low: number
  trading_close: number
  trading_vol: number
  trading_change: number
}

export interface SourceResponse {
  d: SourceDataPoint[]
}

/**
 * Get company name in Source format from ticker
 * Format: "TICKER - Company Name"
 * First tries to get from database using centralized db-client, then constructs a fallback
 */
async function getCompanyNameForSource(ticker: string): Promise<string> {
  try {
    // Use centralized database client
    const { getCompanyProfileName } = await import('./db-client')
    const name = await getCompanyProfileName(ticker, 'pk-equity')

    if (name) {
      // Check if already in Source format
      if (name.includes(' - ')) {
        return name
      }
      // Construct Source format
      return `${ticker.toUpperCase()} - ${name}`
    }
  } catch (error) {
    console.error(`[PKEquity] Error getting company name for ${ticker}:`, error)
  }

  // Fallback: construct from ticker only
  // This might not work for all tickers, but it's a fallback
  return `${ticker.toUpperCase()} - ${ticker.toUpperCase()}`
}

/**
 * Parse Source date format "/Date(timestamp)/" to YYYY-MM-DD
 */
function parseSourceDate(dateStr: string): string {
  const match = dateStr.match(/\/Date\((\d+)\)\//)
  if (match) {
    const timestamp = parseInt(match[1])
    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  throw new Error(`Invalid Source date format: ${dateStr}`)
}

/**
 * Convert Source data point to our database format
 */
function convertSourceToRecord(data: SourceDataPoint): {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  adjusted_close: null
  change_pct: number
} {
  return {
    date: parseSourceDate(data.trading_Date),
    open: data.trading_open,
    high: data.trading_high,
    low: data.trading_low,
    close: data.trading_close,
    volume: data.trading_vol,
    adjusted_close: null,
    change_pct: data.trading_change,
  }
}

/**
 * Fetch historical data from PK Equity Source API
 * @param ticker - Stock ticker symbol (e.g., 'HBL', 'PTC')
 * @param startDate - Start date (YYYY-MM-DD) - optional, defaults to 1 year ago
 * @param endDate - End date (YYYY-MM-DD) - optional, defaults to today
 */
export async function fetchPKEquityData(
  ticker: string,
  startDate?: string,
  endDate?: string
): Promise<Array<{
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  adjusted_close: null
  change_pct: number
}> | null> {
  try {
    const tickerUpper = ticker.toUpperCase()

    // Get company name in Source format
    const companyName = await getCompanyNameForSource(tickerUpper)

    // Format dates for Source API (MM/DD/YYYY)
    const formatDateForAPI = (dateStr: string): string => {
      const date = new Date(dateStr)
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const year = date.getFullYear()
      return `${month}/${day}/${year}`
    }

    const endDateFormatted = endDate ? formatDateForAPI(endDate) : formatDateForAPI(new Date().toISOString().split('T')[0])

    // Default to 1 year ago if no start date
    let startDateFormatted: string
    if (startDate) {
      startDateFormatted = formatDateForAPI(startDate)
    } else {
      const oneYearAgo = new Date()
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      startDateFormatted = formatDateForAPI(oneYearAgo.toISOString().split('T')[0])
    }

    const url = 'https://scstrade.com/MarketStatistics/MS_HistoricalPrices.aspx/chart'

    // Request more rows to get all data (Source supports up to 2000 rows per request)
    const requestBody = {
      par: companyName,
      date1: startDateFormatted,
      date2: endDateFormatted,
      _search: false,
      nd: Date.now(),
      page: 1,
      rows: 2000, // Maximum rows per request
      sidx: 'trading_Date',
      sord: 'desc' // Descending (most recent first)
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        // Referer/Origin kept as is for functionality
        'Referer': 'https://scstrade.com/MarketStatistics/MS_HistoricalPrices.aspx',
        'Origin': 'https://scstrade.com',
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      console.error(`[PKEquity] API error for ${tickerUpper}: ${response.status} ${response.statusText}`)
      return null
    }

    const data: SourceResponse = await response.json()

    if (!data.d || !Array.isArray(data.d) || data.d.length === 0) {
      return null
    }

    // Convert to our format and sort by date (ascending - oldest first)
    const records = data.d.map(convertSourceToRecord)
    records.sort((a, b) => a.date.localeCompare(b.date))

    return records
  } catch (error) {
    console.error(`[PKEquity] Error fetching data for ${ticker}:`, error)
    return null
  }
}

/**
 * Get the latest price from PK Equity Source API
 * @param ticker - Stock ticker symbol
 */
export async function getLatestPriceFromPKEquity(
  ticker: string
): Promise<{ price: number; date: string } | null> {
  const data = await fetchPKEquityData(ticker)

  if (!data || data.length === 0) {
    return null
  }

  // Data is sorted with oldest first, so get the last record (most recent)
  const latest = data[data.length - 1]

  return {
    price: latest.close,
    date: latest.date,
  }
}

