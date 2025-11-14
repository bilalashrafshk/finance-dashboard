/**
 * StockAnalysis.com API Client
 * Fetches historical stock data directly from StockAnalysis.com API
 * Supports both PSX (Pakistan Stock Exchange) and US equities
 */

export interface StockAnalysisDataPoint {
  t: string // Date (YYYY-MM-DD)
  o: number // Open
  h: number // High
  l: number // Low
  c: number // Close
  a: number // Adjusted close
  v: number // Volume
  ch: number // Change percentage
}

export interface StockAnalysisResponse {
  status?: string
  data: StockAnalysisDataPoint[]
}

export type MarketType = 'PSX' | 'US'

/**
 * Fetch historical data from StockAnalysis.com API
 * @param ticker - Stock ticker symbol
 * @param market - Market type: 'PSX' for Pakistan stocks, 'US' for US stocks (default: 'PSX')
 */
export async function fetchStockAnalysisData(
  ticker: string,
  market: MarketType = 'PSX'
): Promise<StockAnalysisDataPoint[] | null> {
  try {
    // PSX stocks use PSX- prefix, US stocks use ticker directly
    const symbol = market === 'PSX' 
      ? `PSX-${ticker.toUpperCase()}`
      : ticker.toUpperCase()
    
    const url = `https://stockanalysis.com/api/symbol/a/${symbol}/history?range=10Y&period=Daily`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://stockanalysis.com/',
      },
    })

    if (!response.ok) {
      console.error(`StockAnalysis API error: ${response.status} ${response.statusText}`)
      return null
    }

    const data: StockAnalysisResponse = await response.json()

    // Handle different response formats
    if (Array.isArray(data)) {
      return data
    }

    if (data && typeof data === 'object' && 'data' in data) {
      // Check if status indicates success (or just return data if status field doesn't exist)
      if (!data.status || data.status === 'success' || Array.isArray(data.data)) {
        return data.data
      }
    }

    console.error('Unexpected StockAnalysis API response format:', data)
    return null
  } catch (error) {
    console.error(`Error fetching StockAnalysis data for ${ticker} (${market}):`, error)
    return null
  }
}

/**
 * Get the latest price from StockAnalysis.com API
 * @param ticker - Stock ticker symbol
 * @param market - Market type: 'PSX' for Pakistan stocks, 'US' for US stocks (default: 'PSX')
 */
export async function getLatestPriceFromStockAnalysis(
  ticker: string,
  market: MarketType = 'PSX'
): Promise<{ price: number; date: string } | null> {
  const data = await fetchStockAnalysisData(ticker, market)
  
  if (!data || data.length === 0) {
    return null
  }

  // Data is sorted with most recent first
  const latest = data[0]
  
  return {
    price: latest.c, // Close price
    date: latest.t, // Date
  }
}

