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
export function calculateHoldingsFromTransactions(
  trades: Trade[],
  currentPrices: Map<string, number> = new Map()
): Holding[] {
  // Group trades by asset key (assetType:symbol:currency)
  const holdingsMap = new Map<string, CalculatedHolding>()
  
  // Sort trades by date to process chronologically
  const sortedTrades = [...trades].sort((a, b) => 
    new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime()
  )
  
  for (const trade of sortedTrades) {
    const key = `${trade.assetType}:${trade.symbol.toUpperCase()}:${trade.currency}`
    
    let holding = holdingsMap.get(key)
    
    if (!holding) {
      holding = {
        assetType: trade.assetType,
        symbol: trade.symbol,
        name: trade.name,
        currency: trade.currency,
        quantity: 0,
        totalInvested: 0,
        averagePurchasePrice: 0,
        firstPurchaseDate: trade.tradeDate,
        lastPurchaseDate: trade.tradeDate,
        notes: trade.notes || undefined,
      }
      holdingsMap.set(key, holding)
    }
    
    // Update quantity based on trade type
    if (trade.tradeType === 'buy' || trade.tradeType === 'add') {
      // Add to position
      const previousTotal = holding.totalInvested
      const previousQuantity = holding.quantity
      const newInvested = trade.totalAmount
      const newQuantity = trade.quantity
      
      // Calculate weighted average purchase price
      if (previousQuantity + newQuantity > 0) {
        holding.averagePurchasePrice = (previousTotal + newInvested) / (previousQuantity + newQuantity)
      } else {
        holding.averagePurchasePrice = trade.price
      }
      
      holding.quantity += newQuantity
      holding.totalInvested += newInvested
      holding.lastPurchaseDate = trade.tradeDate

      // If it's a BUY of a non-cash asset, decrease CASH holding
      if (trade.tradeType === 'buy' && trade.assetType !== 'cash') {
        const cashKey = `cash:CASH:${trade.currency}`
        let cashHolding = holdingsMap.get(cashKey)
        
        if (!cashHolding) {
          // If cash doesn't exist, create it (will be negative)
          cashHolding = {
            assetType: 'cash',
            symbol: 'CASH',
            name: 'Cash',
            currency: trade.currency,
            quantity: 0,
            totalInvested: 0,
            averagePurchasePrice: 1,
            firstPurchaseDate: trade.tradeDate,
            lastPurchaseDate: trade.tradeDate,
          }
          holdingsMap.set(cashKey, cashHolding)
        }
        
        cashHolding.quantity -= trade.totalAmount
        cashHolding.totalInvested -= trade.totalAmount
        cashHolding.lastPurchaseDate = trade.tradeDate
      }

    } else if (trade.tradeType === 'sell' || trade.tradeType === 'remove') {
      // Reduce position (FIFO or average cost basis)
      // For simplicity, we'll use average cost basis
      const quantityToRemove = Math.min(trade.quantity, holding.quantity)
      const costBasis = holding.averagePurchasePrice * quantityToRemove
      
      holding.quantity -= quantityToRemove
      holding.totalInvested -= costBasis
      
      // If quantity becomes 0, reset average price
      if (holding.quantity <= 0) {
        holding.quantity = 0
        holding.totalInvested = 0
        holding.averagePurchasePrice = 0
      }

      // If it's a SELL of a non-cash asset, increase CASH holding
      if (trade.tradeType === 'sell' && trade.assetType !== 'cash') {
        const cashKey = `cash:CASH:${trade.currency}`
        let cashHolding = holdingsMap.get(cashKey)
        
        if (!cashHolding) {
          cashHolding = {
            assetType: 'cash',
            symbol: 'CASH',
            name: 'Cash',
            currency: trade.currency,
            quantity: 0,
            totalInvested: 0,
            averagePurchasePrice: 1,
            firstPurchaseDate: trade.tradeDate,
            lastPurchaseDate: trade.tradeDate,
          }
          holdingsMap.set(cashKey, cashHolding)
        }
        
        cashHolding.quantity += trade.totalAmount
        cashHolding.totalInvested += trade.totalAmount
        cashHolding.lastPurchaseDate = trade.tradeDate
      }
    }
    
    // Update name if it's more recent
    if (new Date(trade.tradeDate) >= new Date(holding.lastPurchaseDate)) {
      holding.name = trade.name
    }
  }
  
  // Convert to Holding format
  const holdings: Holding[] = []
  
  for (const [key, calculated] of holdingsMap.entries()) {
    // Skip holdings with zero quantity
    // Allow negative quantity only for Cash (to represent liabilities/overspending)
    if (calculated.quantity === 0 || (calculated.quantity < 0 && calculated.assetType !== 'cash')) {
      continue
    }
    
    // Get current price from map or use average purchase price as fallback
    const priceKey = `${calculated.assetType}:${calculated.symbol.toUpperCase()}:${calculated.currency}`
    const currentPrice = currentPrices.get(priceKey) || calculated.averagePurchasePrice
    
    holdings.push({
      id: key, // Use key as ID since holdings are calculated
      assetType: calculated.assetType,
      symbol: calculated.symbol,
      name: calculated.name,
      quantity: calculated.quantity,
      purchasePrice: calculated.averagePurchasePrice,
      purchaseDate: calculated.firstPurchaseDate,
      currentPrice: currentPrice,
      currency: calculated.currency,
      notes: calculated.notes,
      createdAt: calculated.firstPurchaseDate,
      updatedAt: calculated.lastPurchaseDate,
    })
  }
  
  return holdings
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

