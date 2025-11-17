/**
 * Binance API Integration
 * 
 * Functions to fetch cryptocurrency prices and available trading pairs from Binance.
 */

export interface BinanceTicker {
  symbol: string
  price: string
  priceChangePercent: string
  volume: string
  highPrice: string
  lowPrice: string
}

export interface BinanceSymbol {
  symbol: string
  baseAsset: string
  quoteAsset: string
  status: string
}

/**
 * Fetch current price for a crypto symbol from Binance
 * @param symbol - Trading pair symbol (e.g., 'BTCUSDT', 'ETHUSDT')
 * @returns Current price as number, or null if error
 */
export async function fetchBinancePrice(symbol: string): Promise<number | null> {
  try {
    // Normalize symbol: remove hyphens, convert to uppercase
    const normalizedSymbol = symbol.toUpperCase().replace(/[-_]/g, '')
    
    // If symbol doesn't end with USDT, try adding it
    const symbolToFetch = normalizedSymbol.endsWith('USDT') 
      ? normalizedSymbol 
      : `${normalizedSymbol}USDT`

    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbolToFetch}`)
    
    if (!response.ok) {
      // Try alternative: BTC/USD format
      if (symbolToFetch.includes('/')) {
        const [base, quote] = symbolToFetch.split('/')
        const altSymbol = `${base}${quote}`
        const altResponse = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${altSymbol}`)
        if (altResponse.ok) {
          const altData = await altResponse.json()
          return parseFloat(altData.price)
        }
      }
      return null
    }

    const data = await response.json()
    return parseFloat(data.price)
  } catch (error) {
    console.error(`Error fetching Binance price for ${symbol}:`, error)
    return null
  }
}

/**
 * Fetch ticker data (price, change, volume) for a crypto symbol
 */
export async function fetchBinanceTicker(symbol: string): Promise<BinanceTicker | null> {
  try {
    const normalizedSymbol = symbol.toUpperCase().replace(/[-_]/g, '')
    const symbolToFetch = normalizedSymbol.endsWith('USDT') 
      ? normalizedSymbol 
      : `${normalizedSymbol}USDT`

    const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbolToFetch}`)
    
    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return {
      symbol: data.symbol,
      price: data.lastPrice,
      priceChangePercent: data.priceChangePercent,
      volume: data.volume,
      highPrice: data.highPrice,
      lowPrice: data.lowPrice,
    }
  } catch (error) {
    console.error(`Error fetching Binance ticker for ${symbol}:`, error)
    return null
  }
}

/**
 * Fetch all available USDT trading pairs from Binance
 * @returns Array of symbol strings (e.g., ['BTCUSDT', 'ETHUSDT', ...])
 */
export async function fetchBinanceSymbols(): Promise<string[]> {
  try {
    const response = await fetch('https://api.binance.com/api/v3/exchangeInfo')
    
    if (!response.ok) {
      throw new Error('Failed to fetch Binance exchange info')
    }

    const data = await response.json()
    
    // Filter for USDT pairs that are currently trading
    const symbols = data.symbols
      .filter((s: BinanceSymbol) => 
        s.quoteAsset === 'USDT' && 
        s.status === 'TRADING'
      )
      .map((s: BinanceSymbol) => s.symbol)
      .sort()

    return symbols
  } catch (error) {
    console.error('Error fetching Binance symbols:', error)
    // Return popular cryptos as fallback
    return [
      'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
      'ADAUSDT', 'DOGEUSDT', 'DOTUSDT', 'MATICUSDT', 'AVAXUSDT',
      'LINKUSDT', 'UNIUSDT', 'LTCUSDT', 'ATOMUSDT', 'ETCUSDT',
    ]
  }
}

/**
 * Fetch prices for multiple symbols at once
 */
export async function fetchMultipleBinancePrices(symbols: string[]): Promise<Record<string, number>> {
  try {
    // Normalize symbols
    const normalizedSymbols = symbols.map(s => {
      const normalized = s.toUpperCase().replace(/[-_]/g, '')
      return normalized.endsWith('USDT') ? normalized : `${normalized}USDT`
    })

    const response = await fetch('https://api.binance.com/api/v3/ticker/price')
    
    if (!response.ok) {
      throw new Error('Failed to fetch Binance prices')
    }

    const allPrices = await response.json() as Array<{ symbol: string; price: string }>
    
    const priceMap: Record<string, number> = {}
    
    normalizedSymbols.forEach(symbol => {
      const priceData = allPrices.find(p => p.symbol === symbol)
      if (priceData) {
        priceMap[symbol] = parseFloat(priceData.price)
        // Also map without USDT suffix for flexibility
        const baseSymbol = symbol.replace('USDT', '')
        priceMap[baseSymbol] = parseFloat(priceData.price)
      }
    })

    return priceMap
  } catch (error) {
    console.error('Error fetching multiple Binance prices:', error)
    return {}
  }
}

/**
 * Format symbol for display (e.g., BTCUSDT -> BTC/USDT)
 */
export function formatSymbolForDisplay(symbol: string): string {
  if (symbol.endsWith('USDT')) {
    return `${symbol.replace('USDT', '')}/USDT`
  }
  return symbol
}

/**
 * Parse display symbol to Binance format (e.g., BTC/USDT -> BTCUSDT)
 */
export function parseSymbolToBinance(symbol: string): string {
  return symbol.toUpperCase().replace(/[-_/]/g, '').replace('USDT', '') + 'USDT'
}



