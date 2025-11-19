/**
 * Unified Price API Client
 * Helper functions for calling unified price API routes
 */

export interface PriceResponse {
  symbol?: string
  ticker?: string
  price: number
  date: string
  source: string
  needsClientFetch?: boolean
  instrumentId?: string
  message?: string
  data?: Array<{
    date: string
    open: number | null
    high: number | null
    low: number | null
    close: number
    volume: number | null
  }>
  count?: number
}

export interface HistoricalDataResponse {
  symbol?: string
  ticker?: string
  data: Array<{
    date: string
    open: number | null
    high: number | null
    low: number | null
    close: number
    volume: number | null
  }>
  count: number
  startDate: string | null
  endDate: string | null
  source: string
}


/**
 * Helper to get absolute URL for server-side fetching
 */
function getAbsoluteUrl(path: string, baseUrl?: string): string {
  if (typeof window !== 'undefined') return path // Client-side: relative URL is fine
  
  // Server-side: need absolute URL
  const base = baseUrl || process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  return `${base}${path}`
}

/**
 * Fetch current price for crypto
 */
export async function fetchCryptoPrice(symbol: string, refresh = false, baseUrl?: string): Promise<PriceResponse | null> {
  try {
    const params = new URLSearchParams({ symbol })
    if (refresh) params.set('refresh', 'true')
    
    const url = getAbsoluteUrl(`/api/crypto/price?${params}`, baseUrl)
    const response = await fetch(url)
    
    if (!response.ok) {
      console.error(`[UNIFIED API] fetchCryptoPrice failed: ${response.status}`)
      return null
    }
    
    const data = await response.json()
    return data
  } catch (error) {
    console.error(`[UNIFIED API] fetchCryptoPrice exception:`, error)
    return null
  }
}

/**
 * Fetch current price for PK equity
 */
export async function fetchPKEquityPrice(ticker: string, refresh = false, baseUrl?: string): Promise<PriceResponse | null> {
  try {
    const params = new URLSearchParams({ ticker })
    if (refresh) params.set('refresh', 'true')
    
    const url = getAbsoluteUrl(`/api/pk-equity/price?${params}`, baseUrl)
    const response = await fetch(url)
    if (!response.ok) return null
    
    return await response.json()
  } catch (error) {
    console.error(`Error fetching PK equity price for ${ticker}:`, error)
    return null
  }
}

/**
 * Fetch current price for US equity
 */
export async function fetchUSEquityPrice(ticker: string, refresh = false, baseUrl?: string): Promise<PriceResponse | null> {
  try {
    const params = new URLSearchParams({ ticker })
    if (refresh) params.set('refresh', 'true')
    
    const url = getAbsoluteUrl(`/api/us-equity/price?${params}`, baseUrl)
    const response = await fetch(url)
    if (!response.ok) return null
    
    return await response.json()
  } catch (error) {
    console.error(`Error fetching US equity price for ${ticker}:`, error)
    return null
  }
}

/**
 * Fetch current price for metals
 * Handles client-side fetch if needed
 */
export async function fetchMetalsPrice(symbol: string, refresh = false, _recursionDepth = 0, baseUrl?: string): Promise<PriceResponse | null> {
  // Prevent infinite recursion
  if (_recursionDepth > 2) {
    console.error(`[UNIFIED API] fetchMetalsPrice: Max recursion depth reached for ${symbol}`)
    return null
  }

  try {
    const params = new URLSearchParams({ symbol })
    if (refresh && _recursionDepth === 0) {
      // Only add refresh on first call, not on recursive calls
      params.set('refresh', 'true')
    }
    
    const url = getAbsoluteUrl(`/api/metals/price?${params}`, baseUrl)
    const response = await fetch(url)
    if (!response.ok) return null
    
    const data: PriceResponse = await response.json()
    
    // If client-side fetch is needed, handle it
    if (data.needsClientFetch && data.instrumentId) {
      if (typeof window === 'undefined') return data // Cannot do client fetch on server
      
      const { getLatestPriceFromInvestingClient } = await import('@/lib/portfolio/investing-client-api')
      const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
      
      // Fetch from client-side API
      const priceData = await getLatestPriceFromInvestingClient(data.instrumentId)
      
      if (priceData) {
        // Store in database
        const storeResponse = await deduplicatedFetch('/api/historical-data/store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetType: 'metals',
            symbol: symbol.toUpperCase(),
            data: [{
              date: priceData.date,
              open: priceData.price,
              high: priceData.price,
              low: priceData.price,
              close: priceData.price,
              volume: null,
            }],
            source: 'investing',
          }),
        })
        
        if (storeResponse.ok) {
          // Return the data we just fetched and stored (no need to re-request)
          return {
            symbol: symbol.toUpperCase(),
            price: priceData.price,
            date: priceData.date,
            source: 'investing',
          }
        }
      }
      
      // If fetch failed but we have priceData, return it anyway
      if (priceData) {
        return {
          symbol: symbol.toUpperCase(),
          price: priceData.price,
          date: priceData.date,
          source: 'investing',
        }
      }
      
      return null
    }
    
    return data
  } catch (error) {
    console.error(`Error fetching metals price for ${symbol}:`, error)
    return null
  }
}

/**
 * Fetch current price for indices
 * Handles client-side fetch if needed (only if DB has some data)
 * If DB is empty, returns needsClientFetch: true and caller should fetch all historical data first
 */
export async function fetchIndicesPrice(symbol: string, refresh = false, _recursionDepth = 0, baseUrl?: string): Promise<PriceResponse | null> {
  // Prevent infinite recursion
  if (_recursionDepth > 2) {
    console.error(`[UNIFIED API] fetchIndicesPrice: Max recursion depth reached for ${symbol}`)
    return null
  }

  try {
    const params = new URLSearchParams({ symbol })
    if (refresh && _recursionDepth === 0) {
      // Only add refresh on first call, not on recursive calls
      params.set('refresh', 'true')
    }
    
    const url = getAbsoluteUrl(`/api/indices/price?${params}`, baseUrl)
    const response = await fetch(url)
    if (!response.ok) return null
    
    const data: PriceResponse = await response.json()
    
    // If client-side fetch is needed, check if DB has any data first
    if (data.needsClientFetch && data.instrumentId) {
      if (typeof window === 'undefined') return data // Cannot do client fetch on server

      // Check if DB has any data - if not, caller should fetch all historical data first
      const assetType = symbol.toUpperCase() === 'SPX500' ? 'spx500' : 'kse100'
      const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
      
      try {
        const checkResponse = await deduplicatedFetch(`/api/historical-data?assetType=${assetType}&symbol=${encodeURIComponent(symbol.toUpperCase())}&limit=1`)
        if (checkResponse.ok) {
          const checkData = await checkResponse.json()
          const hasData = checkData.data && checkData.data.length > 0
          
          // If DB is empty, return needsClientFetch response - caller should fetch all historical data first
          if (!hasData) {
            return data // Return the needsClientFetch response
          }
        }
      } catch (checkError) {
        console.error(`[UNIFIED API] fetchIndicesPrice: Error checking DB for ${symbol}:`, checkError)
        // If check fails, assume DB is empty and return needsClientFetch
        return data
      }
      
      // DB has some data, try to fetch latest price only
      const { getLatestPriceFromInvestingClient } = await import('@/lib/portfolio/investing-client-api')
      
      try {
        // Fetch from client-side API (only latest price, not all historical data)
        const priceData = await getLatestPriceFromInvestingClient(data.instrumentId)
        
        if (priceData) {
          // Store in database
          const storeResponse = await deduplicatedFetch('/api/historical-data/store', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assetType,
              symbol: symbol.toUpperCase(),
              data: [{
                date: priceData.date,
                open: priceData.price,
                high: priceData.price,
                low: priceData.price,
                close: priceData.price,
                volume: null,
              }],
              source: 'investing',
            }),
          })
          
          if (storeResponse.ok) {
            // Return the data we just fetched and stored (no need to re-request)
            return {
              symbol: symbol.toUpperCase(),
              price: priceData.price,
              date: priceData.date,
              source: 'investing',
            }
          }
        }
        
        // If fetch failed but we have priceData, return it anyway
        if (priceData) {
          return {
            symbol: symbol.toUpperCase(),
            price: priceData.price,
            date: priceData.date,
            source: 'investing',
          }
        }
      } catch (fetchError) {
        console.error(`[UNIFIED API] fetchIndicesPrice: Error fetching latest price for ${symbol}:`, fetchError)
        // If fetch fails, return needsClientFetch response
        return data
      }
      
      return null
    }
    
    return data
  } catch (error) {
    console.error(`Error fetching indices price for ${symbol}:`, error)
    return null
  }
}

/**
 * Fetch historical data for any asset type
 */
export async function fetchHistoricalData(
  assetType: 'crypto' | 'pk-equity' | 'us-equity' | 'metals' | 'indices',
  symbol: string,
  startDate?: string,
  endDate?: string
): Promise<HistoricalDataResponse | null> {
  try {
    const routeMap: Record<string, string> = {
      'crypto': '/api/crypto/price',
      'pk-equity': '/api/pk-equity/price',
      'us-equity': '/api/us-equity/price',
      'metals': '/api/metals/price',
      'indices': '/api/indices/price',
    }
    
    const route = routeMap[assetType]
    if (!route) return null
    
    const params = new URLSearchParams()
    if (assetType === 'crypto' || assetType === 'metals' || assetType === 'indices') {
      params.set('symbol', symbol)
    } else {
      params.set('ticker', symbol)
    }
    
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    
    const response = await fetch(`${route}?${params}`)
    if (!response.ok) return null
    
    return await response.json() as HistoricalDataResponse
  } catch (error) {
    console.error(`Error fetching historical data for ${assetType}-${symbol}:`, error)
    return null
  }
}

