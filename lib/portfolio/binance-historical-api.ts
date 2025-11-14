/**
 * Binance Historical Data API Client
 * Fetches historical cryptocurrency data (klines/candlestick data) from Binance
 */

export interface BinanceKline {
  openTime: number // Timestamp in milliseconds
  open: string
  high: string
  low: string
  close: string
  volume: string
  closeTime: number
  quoteVolume: string
  trades: number
  takerBuyBaseVolume: string
  takerBuyQuoteVolume: string
}

export interface BinanceHistoricalDataPoint {
  date: string // ISO date string (YYYY-MM-DD)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Fetch historical klines (candlestick) data from Binance
 * @param symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param interval - Kline interval (1d, 1w, 1M, etc.)
 * @param limit - Number of data points (max 1000)
 * @param startTime - Optional start time in milliseconds
 * @param endTime - Optional end time in milliseconds
 */
export async function fetchBinanceKlines(
  symbol: string,
  interval: string = '1d',
  limit: number = 1000,
  startTime?: number,
  endTime?: number
): Promise<BinanceHistoricalDataPoint[] | null> {
  try {
    // Normalize symbol
    const normalizedSymbol = symbol.toUpperCase().replace(/[-_]/g, '')
    const symbolToFetch = normalizedSymbol.endsWith('USDT') 
      ? normalizedSymbol 
      : `${normalizedSymbol}USDT`

    let url = `https://api.binance.com/api/v3/klines?symbol=${symbolToFetch}&interval=${interval}&limit=${limit}`
    
    if (startTime) {
      url += `&startTime=${startTime}`
    }
    if (endTime) {
      url += `&endTime=${endTime}`
    }

    const response = await fetch(url)
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error(`Binance API error: ${response.status} ${response.statusText}`, errorText)
      return null
    }

    const klines: any[] = await response.json()
    
    // Handle empty response
    if (!klines || !Array.isArray(klines) || klines.length === 0) {
      return []
    }
    
    // Convert klines to our format
    const dataPoints: BinanceHistoricalDataPoint[] = klines.map((kline: any[]) => {
      const openTime = kline[0] // Open time in milliseconds
      const date = new Date(openTime)
      
      return {
        date: date.toISOString().split('T')[0], // YYYY-MM-DD
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
      }
    })

    // Sort by date (oldest first)
    return dataPoints.sort((a, b) => a.date.localeCompare(b.date))
  } catch (error) {
    console.error(`Error fetching Binance klines for ${symbol}:`, error)
    return null
  }
}

/**
 * Fetch historical data for a symbol (fetches multiple batches if needed)
 * @param symbol - Trading pair symbol
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD), defaults to today
 */
export async function fetchBinanceHistoricalData(
  symbol: string,
  startDate?: string,
  endDate?: string
): Promise<BinanceHistoricalDataPoint[] | null> {
  try {
    const normalizedSymbol = symbol.toUpperCase().replace(/[-_]/g, '')
    const symbolToFetch = normalizedSymbol.endsWith('USDT') 
      ? normalizedSymbol 
      : `${normalizedSymbol}USDT`

    const end = endDate ? new Date(endDate) : new Date()
    // When no startDate provided, fetch from 2010-01-01 to get all available historical data
    // This ensures we capture data for old purchase dates (e.g., 2022)
    // Note: Binance will return earliest available data if requested date is before data exists
    const defaultStartDate = new Date('2010-01-01')
    const start = startDate ? new Date(startDate) : defaultStartDate
    
    // Ensure start is before end
    if (start >= end) {
      return null
    }
    
    // Binance API limit is 1000 klines per request
    // 1 day interval = max ~2.7 years per request
    // We'll fetch in chunks if needed
    
    const allData: BinanceHistoricalDataPoint[] = []
    let currentStart = start.getTime()
    const endTime = end.getTime()
    
    while (currentStart < endTime) {
      // Calculate end time for this batch (1000 days max)
      const batchEndTime = Math.min(currentStart + (1000 * 24 * 60 * 60 * 1000), endTime)
      
      const batch = await fetchBinanceKlines(
        symbolToFetch,
        '1d',
        1000,
        currentStart,
        batchEndTime
      )
      
      if (!batch) {
        break
      }
      
      if (batch.length === 0) {
        // If we're requesting from a date before data exists, Binance might return empty
        // Try fetching without startTime to get earliest available data
        if (allData.length === 0 && currentStart === start.getTime()) {
          // Fetch with a very early startTime to get the earliest data
          // Use a date that's definitely before any crypto data exists (e.g., 2000-01-01)
          const veryEarlyDate = new Date('2000-01-01').getTime()
          const earliestBatch = await fetchBinanceKlines(symbolToFetch, '1d', 1000, veryEarlyDate)
          if (earliestBatch && earliestBatch.length > 0) {
            allData.push(...earliestBatch)
            const lastDate = new Date(earliestBatch[earliestBatch.length - 1].date)
            currentStart = lastDate.getTime() + (24 * 60 * 60 * 1000)
            // Continue to fetch remaining data up to endTime
            continue
          } else {
            break
          }
        }
        // If we already have some data, empty batch means we've reached the end
        break
      }
      
      allData.push(...batch)
      
      // Move to next batch
      // Use the last record's timestamp + 1 day to avoid duplicates
      const lastRecord = batch[batch.length - 1]
      const lastDate = new Date(lastRecord.date + 'T00:00:00Z') // Parse as UTC to avoid timezone issues
      currentStart = lastDate.getTime() + (24 * 60 * 60 * 1000) // Next day
      
      // If we got less than 1000, we've reached the end of available data
      if (batch.length < 1000) {
        break
      }
      
      // Safety check: if we've exceeded endTime, stop
      if (currentStart >= endTime) {
        break
      }
    }
    
    // Remove duplicates and sort
    const uniqueData = Array.from(
      new Map(allData.map(item => [item.date, item])).values()
    ).sort((a, b) => a.date.localeCompare(b.date))
    
    return uniqueData.length > 0 ? uniqueData : null
  } catch (error) {
    console.error(`Error fetching Binance historical data for ${symbol}:`, error)
    return null
  }
}

/**
 * Get the latest price from historical data
 */
export async function getLatestPriceFromBinanceHistorical(
  symbol: string
): Promise<{ price: number; date: string } | null> {
  // Fetch last 30 days to get latest price
  const data = await fetchBinanceKlines(symbol, '1d', 30)
  
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

