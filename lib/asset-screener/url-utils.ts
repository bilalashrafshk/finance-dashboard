/**
 * URL Utilities for Asset Screener
 * 
 * Handles conversion between asset identifiers and URL slugs
 * Format: market-ticker (e.g., "psx-ogdc", "us-aapl")
 */

export type MarketPrefix = 'psx' | 'us' | 'crypto' | 'metals' | 'indices' | 'commodities'

/**
 * Get market prefix from asset type
 */
export function getMarketPrefix(assetType: string): MarketPrefix {
  switch (assetType) {
    case 'pk-equity':
    case 'kse100':
      return 'psx'
    case 'us-equity':
    case 'spx500':
      return 'us'
    case 'crypto':
      return 'crypto'
    case 'metals':
      return 'metals'
    case 'commodities':
    case 'commodity': // Handle potential variations
      return 'commodities'
    case 'indices':
      return 'indices'
    default:
      // Check if it contains commodity
      if (assetType.includes('commodity')) return 'commodities'
      return 'us' // Default fallback
  }
}

/**
 * Generate URL slug from asset
 * Format: market-ticker (e.g., "psx-ogdc", "us-aapl")
 */
export function generateAssetSlug(assetType: string, symbol: string): string {
  const market = getMarketPrefix(assetType)
  return `${market}-${symbol.toUpperCase()}`
}

/**
 * Parse URL slug to extract market and ticker
 * Returns { market, ticker } or null if invalid
 */
export function parseAssetSlug(slug: string): { market: MarketPrefix; ticker: string } | null {
  const parts = slug.split('-')
  if (parts.length < 2) {
    return null
  }

  const market = parts[0]
  const ticker = parts.slice(1).join('-') // Handle tickers that might contain hyphens
  const validMarkets: MarketPrefix[] = ['psx', 'us', 'crypto', 'metals', 'indices', 'commodities']

  if (!validMarkets.includes(market.toLowerCase() as MarketPrefix)) {
    return null
  }

  return {
    market: market.toLowerCase() as MarketPrefix,
    ticker: ticker.toUpperCase()
  }
}

/**
 * Get asset type from market prefix
 */
export function getAssetTypeFromMarket(market: MarketPrefix, ticker: string): string {
  switch (market) {
    case 'psx':
      if (ticker === 'KSE100') return 'kse100'
      return 'pk-equity'
    case 'us':
      if (ticker === 'SPX500') return 'spx500'
      return 'us-equity'
    case 'crypto':
      return 'crypto'
    case 'metals':
      return 'metals'
    case 'commodities':
      return 'commodities'
    case 'indices':
      return 'indices'
    default:
      return 'us-equity'
  }
}

