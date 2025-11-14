/**
 * PSX (Pakistan Stock Exchange) API Integration
 * 
 * Functions to fetch stock prices from PSX website by scraping.
 * URL pattern: https://dps.psx.com.pk/company/{ticker}
 */

export interface PSXQuote {
  ticker: string
  bidPrice: number | null
  askPrice: number | null
  open: number | null
  high: number | null
  low: number | null
  volume: string | null
  lastPrice: number | null
}

/**
 * Fetch current bid price for a PSX stock ticker
 * @param ticker - Stock ticker symbol (e.g., 'PTC', 'HBL', 'UBL')
 * @returns Current bid price as number, or null if error
 */
export async function fetchPSXBidPrice(ticker: string): Promise<number | null> {
  try {
    const normalizedTicker = ticker.toUpperCase().trim()
    const url = `https://dps.psx.com.pk/company/${normalizedTicker}` // Use uppercase, not lowercase
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    
    if (!response.ok) {
      return null
    }

    const html = await response.text()
    
    // Parse HTML to find bid price
    // Structure: <div class="stats_label">Bid Price</div><div class="stats_value">34.56</div> or 1,741.20
    // We want the REG tab's bid price, not FUT tab's
    // Try multiple patterns to handle different HTML formatting
    
    // First, try to find the REG tab panel and extract bid price from there
    const regTabMatch = html.match(/<div[^>]*class="tabs__panel"[^>]*data-name="REG"[^>]*>([\s\S]{0,2000}?)<\/div>\s*<div[^>]*class="tabs__panel"/i)
    let bidPriceMatch = null
    
    if (regTabMatch && regTabMatch[1]) {
      // Extract bid price from REG tab content
      const regContent = regTabMatch[1]
      bidPriceMatch = regContent.match(/<div[^>]*class="stats_label"[^>]*>Bid Price<\/div>\s*<div[^>]*class="stats_value"[^>]*>([\d,.]+)<\/div>/i)
    }
    
    // Pattern 1: Exact structure with optional whitespace - handle numbers with commas (fallback)
    if (!bidPriceMatch) {
      bidPriceMatch = html.match(/<div[^>]*class="stats_label"[^>]*>Bid Price<\/div>\s*<div[^>]*class="stats_value"[^>]*>([\d,.]+)<\/div>/i)
    }
    
    // Pattern 2: More flexible - handle any attributes order
    if (!bidPriceMatch) {
      bidPriceMatch = html.match(/<div[^>]*class="stats_label"[^>]*>\s*Bid Price\s*<\/div>[\s\S]{0,50}?<div[^>]*class="stats_value"[^>]*>\s*([\d,.]+)\s*<\/div>/i)
    }
    
    // Pattern 3: Look within stats_item container
    if (!bidPriceMatch) {
      const statsItemMatch = html.match(/<div[^>]*class="stats_item"[^>]*>[\s\S]{0,200}?<div[^>]*class="stats_label"[^>]*>Bid Price<\/div>[\s\S]{0,100}?<div[^>]*class="stats_value"[^>]*>([\d,.]+)<\/div>/i)
      if (statsItemMatch) {
        bidPriceMatch = statsItemMatch
      }
    }
    
    // Pattern 4: Fallback - find Bid Price text and look for nearby number
    if (!bidPriceMatch) {
      const bidIndex = html.indexOf('Bid Price')
      if (bidIndex > -1) {
        const snippet = html.substring(bidIndex, bidIndex + 200)
        const fallbackMatch = snippet.match(/stats_value[^>]*>([\d,.]+)/i)
        if (fallbackMatch) {
          bidPriceMatch = fallbackMatch
        }
      }
    }
    
    if (bidPriceMatch && bidPriceMatch[1]) {
      // Remove commas and parse
      const priceStr = bidPriceMatch[1].replace(/,/g, '')
      const price = parseFloat(priceStr)
      
      // If bid price is 0.00, fall back to current price from quote section
      if (price === 0) {
        // Try to extract current price from quote section
        // Pattern 1: <div class="quote__close">Rs.34.45</div>
        const quotePriceMatch = html.match(/<div[^>]*class="quote__close"[^>]*>Rs\.([\d,.]+)<\/div>/i)
        if (quotePriceMatch && quotePriceMatch[1]) {
          const quotePriceStr = quotePriceMatch[1].replace(/,/g, '')
          const quotePrice = parseFloat(quotePriceStr)
          if (!isNaN(quotePrice) && quotePrice > 0) {
            return quotePrice
          }
        }
        
        // Pattern 2: data-current="34.45" in numRange divs (from REG tab)
        const currentPriceMatch = html.match(/<div[^>]*class="tabs__panel"[^>]*data-name="REG"[^>]*>[\s\S]{0,3000}?data-current="([\d,.]+)"/i)
        if (currentPriceMatch && currentPriceMatch[1]) {
          const currentPriceStr = currentPriceMatch[1].replace(/,/g, '')
          const currentPrice = parseFloat(currentPriceStr)
          if (!isNaN(currentPrice) && currentPrice > 0) {
            return currentPrice
          }
        }
      }
      
      return price
    }

    // If no bid price found at all, try to extract current price from quote section
    const quotePriceMatch = html.match(/<div[^>]*class="quote__close"[^>]*>Rs\.([\d,.]+)<\/div>/i)
    if (quotePriceMatch && quotePriceMatch[1]) {
      const quotePriceStr = quotePriceMatch[1].replace(/,/g, '')
      const quotePrice = parseFloat(quotePriceStr)
      if (!isNaN(quotePrice) && quotePrice > 0) {
        return quotePrice
      }
    }
    
    // Try data-current from REG tab
    const currentPriceMatch = html.match(/<div[^>]*class="tabs__panel"[^>]*data-name="REG"[^>]*>[\s\S]{0,3000}?data-current="([\d,.]+)"/i)
    if (currentPriceMatch && currentPriceMatch[1]) {
      const currentPriceStr = currentPriceMatch[1].replace(/,/g, '')
      const currentPrice = parseFloat(currentPriceStr)
      if (!isNaN(currentPrice) && currentPrice > 0) {
        return currentPrice
      }
    }

    return null
  } catch (error) {
    console.error(`Error fetching PSX bid price for ${ticker}:`, error)
    return null
  }
}

/**
 * Fetch full quote data for a PSX stock ticker
 */
export async function fetchPSXQuote(ticker: string): Promise<PSXQuote | null> {
  try {
    const normalizedTicker = ticker.toUpperCase().trim()
    const url = `https://dps.psx.com.pk/company/${normalizedTicker}` // Use uppercase, not lowercase
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    
    if (!response.ok) {
      return null
    }

    const html = await response.text()
    
    // Helper function to extract value by label
    const extractValue = (label: string, allowCommas = false): number | null => {
      const pattern = allowCommas
        ? new RegExp(`<div[^>]*class="stats_label"[^>]*>${label}<\\/div>\\s*<div[^>]*class="stats_value"[^>]*>([\\d,.]+)<\\/div>`, 'i')
        : new RegExp(`<div[^>]*class="stats_label"[^>]*>${label}<\\/div>\\s*<div[^>]*class="stats_value"[^>]*>([\\d.]+)<\\/div>`, 'i')
      const match = html.match(pattern)
      return match && match[1] ? parseFloat(match[1].replace(/,/g, '')) : null
    }
    
    // Extract bid price
    const bidPrice = extractValue('Bid Price')
    
    // Extract ask price
    const askPrice = extractValue('Ask Price')
    
    // Extract open price
    const open = extractValue('Open')
    
    // Extract high price
    const high = extractValue('High')
    
    // Extract low price
    const low = extractValue('Low')
    
    // Extract volume (with commas)
    const volumeMatch = html.match(/<div[^>]*class="stats_label"[^>]*>Volume<\/div>\s*<div[^>]*class="stats_value"[^>]*>([\d,]+)<\/div>/i)
    const volume = volumeMatch && volumeMatch[1] ? volumeMatch[1] : null
    
    // Try to find last price (might be in different format)
    // Sometimes it's shown as current price in the range indicators
    const lastPriceMatch = html.match(/data-current="([\d.]+)"/)
    const lastPrice = lastPriceMatch && lastPriceMatch[1] ? parseFloat(lastPriceMatch[1]) : null

    return {
      ticker: normalizedTicker,
      bidPrice,
      askPrice,
      open,
      high,
      low,
      volume,
      lastPrice: lastPrice || bidPrice || askPrice, // Use bid/ask as fallback
    }
  } catch (error) {
    console.error(`Error fetching PSX quote for ${ticker}:`, error)
    return null
  }
}

/**
 * Validate if a ticker might be a valid PSX ticker
 * PSX tickers are typically 2-5 uppercase letters
 */
export function isValidPSXTicker(ticker: string): boolean {
  const normalized = ticker.toUpperCase().trim()
  return /^[A-Z]{2,5}$/.test(normalized)
}

