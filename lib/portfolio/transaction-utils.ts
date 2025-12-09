/**
 * Calculate holdings from transactions
 * This is the core function that makes transactions the source of truth
 */

import type { Holding } from './types'

export interface Trade {
  id: number
  userId: number
  holdingId: number | null
  tradeType: 'buy' | 'sell' | 'add' | 'remove'
  assetType: string
  symbol: string
  name: string
  quantity: number
  price: number
  totalAmount: number
  currency: string
  tradeDate: string
  notes: string | null
  createdAt: string
}

interface CalculatedHolding {
  assetType: string
  symbol: string
  name: string
  currency: string
  quantity: number
  totalInvested: number
  averagePurchasePrice: number
  firstPurchaseDate: string
  lastPurchaseDate: string
  notes?: string
}

/**
 * Calculate current holdings from transactions
 * Groups transactions by assetType + symbol + currency
 * Calculates weighted average purchase price
 * Returns holdings with current price (needs to be fetched separately)
 */
/**
 * Calculate current holdings from transactions using FIFO logic
 * Groups transactions by assetType + symbol + currency
 * Calculates weighted average purchase price based on remaining FIFO lots
 * Returns holdings with current price (needs to be fetched separately)
 */
import { calculateFifoMetrics } from './fifo-utils'

export function calculateHoldingsFromTransactions(
  trades: Trade[],
  currentPrices: Map<string, number> = new Map()
): Holding[] {
  const { holdings } = calculateFifoMetrics(trades, currentPrices)

  // Convert Map to Array
  return Array.from(holdings.values())
}

/**
 * Get current price for an asset
 * This should fetch from your price API
 */
export async function getCurrentPrice(
  assetType: string,
  symbol: string,
  currency: string
): Promise<number> {
  try {
    // Import price fetching functions dynamically
    const { fetchPKEquityPrice } = await import('./unified-price-api')
    const { fetchUSEquityPrice } = await import('./unified-price-api')
    const { fetchCryptoPrice } = await import('./unified-price-api')
    const { fetchMetalsPrice } = await import('./unified-price-api')

    let price = 0

    switch (assetType) {
      case 'pk-equity':
        const pkData = await fetchPKEquityPrice(symbol)
        price = pkData?.price || 0
        break
      case 'us-equity':
        const usData = await fetchUSEquityPrice(symbol)
        price = usData?.price || 0
        break
      case 'crypto':
        const cryptoData = await fetchCryptoPrice(symbol)
        price = cryptoData?.price || 0
        break
      case 'metals':
        const metalsData = await fetchMetalsPrice(symbol)
        price = metalsData?.price || 0
        break
      case 'commodities':
        // For commodities, fetch from commodity price API
        // Note: This is mainly for historical data; for current valuation, we use purchasePrice
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
          const today = new Date().toISOString().split('T')[0]
          const response = await fetch(`${baseUrl}/api/commodity/price?symbol=${encodeURIComponent(symbol)}&date=${today}`)
          if (response.ok) {
            const data = await response.json()
            price = data.price || 0
          }
        } catch (error) {
          console.error(`Error fetching commodity price for ${symbol}:`, error)
          price = 0
        }
        break
      case 'cash':
        // Cash is always 1:1
        price = 1
        break
      default:
        price = 0
    }

    return price
  } catch (error) {
    console.error(`Error fetching price for ${assetType}:${symbol}:`, error)
    return 0
  }
}

