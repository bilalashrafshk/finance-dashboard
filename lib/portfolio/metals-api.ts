/**
 * Metals API Integration
 * 
 * Functions to fetch metal prices from Investing.com
 * Based on: https://www.investing.com/commodities/metals
 */

export interface Metal {
  symbol: string
  name: string
  displayName: string
}

// Available metals from Investing.com API
export const AVAILABLE_METALS: Metal[] = [
  { symbol: 'GOLD', name: 'Gold', displayName: 'Gold' },
  { symbol: 'SILVER', name: 'Silver', displayName: 'Silver' },
  { symbol: 'PALLADIUM', name: 'Palladium', displayName: 'Palladium' },
  { symbol: 'PLATINUM', name: 'Platinum', displayName: 'Platinum' },
  { symbol: 'COPPER', name: 'Copper', displayName: 'Copper' },
]

/**
 * Map metal symbols to Investing.com instrument IDs
 * These IDs are used in the Investing.com API endpoint
 */
const METAL_INSTRUMENT_IDS: Record<string, string> = {
  'GOLD': '68',
  'SILVER': '8836',
  'PALLADIUM': '8883',
  'PLATINUM': '8831',
  'COPPER': '8831', // TODO: Verify correct ID for Copper (user didn't provide)
}

/**
 * Get instrument ID for a metal symbol
 */
export function getMetalInstrumentId(metalSymbol: string): string | null {
  const normalizedSymbol = metalSymbol.toUpperCase().trim()
  return METAL_INSTRUMENT_IDS[normalizedSymbol] || null
}

/**
 * Fetch current price for a metal from Investing.com API
 * @param metalSymbol - Metal symbol (e.g., 'GOLD', 'SILVER')
 * @returns Current price as number, or null if error
 */
export async function fetchMetalPrice(metalSymbol: string): Promise<number | null> {
  try {
    const normalizedSymbol = metalSymbol.toUpperCase().trim()
    const instrumentId = getMetalInstrumentId(normalizedSymbol)
    
    if (!instrumentId) {
      console.error(`Unknown metal symbol: ${normalizedSymbol}`)
      return null
    }

    // Server-side fetching not supported due to Cloudflare protection
    // This function is deprecated - use client-side API instead
    // getLatestPriceFromInvestingClient() from investing-client-api.ts
    console.warn(`fetchMetalPrice() is deprecated. Use client-side getLatestPriceFromInvestingClient() instead.`)
    return null
  } catch (error) {
    console.error(`Error fetching metal price for ${metalSymbol}:`, error)
    return null
  }
}

/**
 * Get all available metals
 */
export function getAvailableMetals(): Metal[] {
  return AVAILABLE_METALS
}

/**
 * Format metal symbol for display
 */
export function formatMetalForDisplay(symbol: string): string {
  const metal = AVAILABLE_METALS.find(m => m.symbol.toUpperCase() === symbol.toUpperCase())
  return metal ? metal.displayName : symbol
}

/**
 * Validate if a symbol is a valid metal
 */
export function isValidMetalSymbol(symbol: string): boolean {
  const normalized = symbol.toUpperCase().trim()
  return AVAILABLE_METALS.some(m => m.symbol === normalized)
}

