/**
 * Portfolio Calculation Utilities
 * 
 * Functions for calculating portfolio metrics, summaries, and allocations.
 */

import type { Holding, PortfolioSummary, AssetTypeAllocation, AssetType } from './types'
import { ASSET_TYPE_LABELS } from './types'
import { convertDividendToRupees, filterDividendsByPurchaseDate, calculateTotalDividendsForHolding } from './dividend-utils'

/**
 * Combine holdings by asset (assetType + symbol + currency)
 * Returns a single holding per asset with weighted average purchase price and combined quantity
 */
export function combineHoldingsByAsset(holdings: Holding[]): Holding[] {
  const groupedMap = new Map<string, Holding[]>()
  
  // Group holdings by assetType + symbol + currency (case-insensitive)
  holdings.forEach(holding => {
    const key = `${holding.assetType}:${holding.symbol.toUpperCase()}:${holding.currency}`
    if (!groupedMap.has(key)) {
      groupedMap.set(key, [])
    }
    groupedMap.get(key)!.push(holding)
  })
  
  // Combine each group into a single holding
  const combinedHoldings: Holding[] = []
  
  groupedMap.forEach((groupHoldings, key) => {
    if (groupHoldings.length === 1) {
      // Single holding, no need to combine
      combinedHoldings.push(groupHoldings[0])
    } else {
      // Multiple holdings of same asset - combine them
      const firstHolding = groupHoldings[0]
      const totalQuantity = groupHoldings.reduce((sum, h) => sum + h.quantity, 0)
      const totalInvested = groupHoldings.reduce((sum, h) => sum + (h.purchasePrice * h.quantity), 0)
      const averagePurchasePrice = totalQuantity > 0 ? totalInvested / totalQuantity : firstHolding.purchasePrice
      
      // Use earliest purchase date
      const earliestPurchaseDate = groupHoldings.reduce((earliest, h) => {
        return new Date(h.purchaseDate) < new Date(earliest) ? h.purchaseDate : earliest
      }, groupHoldings[0].purchaseDate)
      
      // Create combined holding
      const combinedHolding: Holding = {
        ...firstHolding,
        id: key, // Use key as ID for combined holdings
        quantity: totalQuantity,
        purchasePrice: averagePurchasePrice,
        purchaseDate: earliestPurchaseDate,
      }
      
      combinedHoldings.push(combinedHolding)
    }
  })
  
  return combinedHoldings
}

export interface HoldingDividend {
  holdingId: string
  symbol: string
  dividends: Array<{
    date: string
    dividendAmount: number // In rupees
    totalCollected: number // Total collected for this holding (dividendAmount * quantity)
  }>
  totalCollected: number // Total dividends collected for this holding
}

/**
 * Calculate the total invested amount for a holding
 */
export function calculateInvested(holding: Holding): number {
  return holding.quantity * holding.purchasePrice
}

/**
 * Calculate the current value of a holding
 */
export function calculateCurrentValue(holding: Holding): number {
  return holding.quantity * holding.currentPrice
}

/**
 * Calculate portfolio value for a specific date
 * Uses currentPrice for today's date, historical prices for past dates
 * This ensures consistency between summary stats and charts
 * Combines holdings by asset (assetType + symbol + currency) before calculation
 */
export function calculatePortfolioValueForDate(
  holdings: Holding[],
  date: string | Date,
  historicalPriceMap?: Map<string, { date: string; price: number }[]>
): number {
  // Combine holdings by asset before calculation
  const combinedHoldings = combineHoldingsByAsset(holdings)
  
  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0]
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  
  let totalValue = 0
  
  for (const holding of combinedHoldings) {
    const purchaseDate = new Date(holding.purchaseDate)
    
    // Only include holdings purchased on or before this date
    if (dateObj >= purchaseDate) {
      let price: number | null = null
      
      // For today's date, always use currentPrice to match summary
      if (dateStr === todayStr) {
        price = holding.currentPrice
      } else if (historicalPriceMap) {
        // For past dates, use historical data if available
        const historicalData = historicalPriceMap.get(holding.symbol)
        if (historicalData && historicalData.length > 0) {
          // Find exact date match or closest before
          let pricePoint = historicalData.find(d => d.date === dateStr)
          
          if (!pricePoint) {
            // Find closest date before (or equal to) the target date
            const beforeDates = historicalData.filter(d => d.date <= dateStr)
            if (beforeDates.length > 0) {
              // Sort by date descending to get the closest before date
              pricePoint = beforeDates.sort((a, b) => b.date.localeCompare(a.date))[0]
            }
          }
          
          if (pricePoint) {
            price = pricePoint.price
          }
        }
      }
      
      // Fallback to currentPrice if no historical data found
      if (price === null) {
        price = holding.currentPrice
      }
      
      totalValue += holding.quantity * price
    }
  }
  
  return totalValue
}

/**
 * Calculate current portfolio value (for today)
 * This is the centralized function used by both summary and charts
 */
export function calculateCurrentPortfolioValue(holdings: Holding[]): number {
  return calculatePortfolioValueForDate(holdings, new Date())
}

/**
 * Calculate gain/loss for a holding
 */
export function calculateGainLoss(holding: Holding): number {
  return calculateCurrentValue(holding) - calculateInvested(holding)
}

/**
 * Calculate gain/loss percentage for a holding
 */
export function calculateGainLossPercent(holding: Holding): number {
  const invested = calculateInvested(holding)
  if (invested === 0) return 0
  return (calculateGainLoss(holding) / invested) * 100
}

/**
 * Calculate CAGR (Compound Annual Growth Rate) for portfolio
 * Based on earliest purchase date to current value
 */
export function calculatePortfolioCAGR(holdings: Holding[], currentValue: number, totalInvested: number): number | undefined {
  if (holdings.length === 0 || totalInvested === 0 || currentValue <= 0) {
    return undefined
  }

  // Find earliest purchase date
  const purchaseDates = holdings.map(h => new Date(h.purchaseDate))
  const earliestDate = new Date(Math.min(...purchaseDates.map(d => d.getTime())))
  const today = new Date()
  
  // Calculate years between earliest purchase and today
  const years = (today.getTime() - earliestDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  
  // Need at least 6 months of data for meaningful CAGR
  if (years < 0.5) {
    return undefined
  }

  // CAGR = ((Ending Value / Beginning Value) ^ (1 / Number of Years)) - 1
  const cagr = Math.pow(currentValue / totalInvested, 1 / years) - 1
  return cagr * 100 // Convert to percentage
}

/**
 * Calculate portfolio summary statistics
 * Uses centralized calculateCurrentPortfolioValue for consistency
 * Combines holdings by asset (assetType + symbol + currency) before calculation
 */
export function calculatePortfolioSummary(holdings: Holding[]): PortfolioSummary {
  // Combine holdings by asset before calculation
  const combinedHoldings = combineHoldingsByAsset(holdings)
  
  const totalInvested = combinedHoldings.reduce((sum, h) => sum + calculateInvested(h), 0)
  const currentValue = calculateCurrentPortfolioValue(combinedHoldings) // Use centralized function
  const totalGainLoss = currentValue - totalInvested
  const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0
  const cagr = calculatePortfolioCAGR(combinedHoldings, currentValue, totalInvested)

  return {
    totalInvested,
    currentValue,
    totalGainLoss,
    totalGainLossPercent,
    holdingsCount: combinedHoldings.length, // Count of unique assets, not individual holdings
    cagr,
  }
}

/**
 * Calculate total realized PnL from all sell transactions
 * Fetches all sell transactions and sums up realized PnL
 */
export async function calculateTotalRealizedPnL(): Promise<number> {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    if (!token) {
      return 0
    }

    const response = await fetch('/api/user/trades', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      return 0
    }

    const data = await response.json()
    const trades = data.trades || []

    // Sum realized PnL from all sell transactions
    let totalRealizedPnL = 0
    trades.forEach((trade: any) => {
      if (trade.tradeType === 'sell' && trade.notes) {
        // Extract realized PnL from notes: "Realized P&L: 123.45 USD"
        const match = trade.notes.match(/Realized P&L: ([\d.-]+)/)
        if (match) {
          totalRealizedPnL += parseFloat(match[1])
        }
      }
    })

    return totalRealizedPnL
  } catch (error) {
    console.error('Error calculating realized PnL:', error)
    return 0
  }
}

/**
 * Calculate portfolio summary statistics with dividends and realized PnL
 * @param holdings - Holdings to calculate summary for
 */
export async function calculatePortfolioSummaryWithDividends(
  holdings: Holding[]
): Promise<PortfolioSummary> {
  const summary = calculatePortfolioSummary(holdings)
  const dividendsCollected = await calculateTotalDividendsCollected(holdings)
  const realizedPnL = await calculateTotalRealizedPnL()
  
  summary.dividendsCollected = dividendsCollected
  summary.dividendsCollectedPercent = summary.totalInvested > 0 ? (dividendsCollected / summary.totalInvested) * 100 : 0
  summary.realizedPnL = realizedPnL
  summary.totalPnL = summary.totalGainLoss + realizedPnL // Total = Unrealized + Realized
  
  return summary
}

/**
 * Calculate unified portfolio summary with realized PnL
 * @param holdings - All holdings to calculate summary for
 * @param exchangeRates - Map of currency to exchange rate (1 USD = X currency)
 */
export async function calculateUnifiedPortfolioSummaryWithRealizedPnL(
  holdings: Holding[],
  exchangeRates: Map<string, number>
): Promise<PortfolioSummary> {
  const summary = calculateUnifiedPortfolioSummary(holdings, exchangeRates)
  const realizedPnL = await calculateTotalRealizedPnL()
  
  // Convert realized PnL to USD if needed (it's stored in the original currency)
  // For now, we'll fetch it and assume it's already in the base currency
  // In a more sophisticated implementation, we'd track realized PnL per currency
  summary.realizedPnL = realizedPnL
  summary.totalPnL = summary.totalGainLoss + realizedPnL
  
  return summary
}

/**
 * Calculate asset type allocation
 * Combines holdings by asset (assetType + symbol + currency) before calculation
 */
export function calculateAssetAllocation(holdings: Holding[]): AssetTypeAllocation[] {
  // Combine holdings by asset before calculation
  const combinedHoldings = combineHoldingsByAsset(holdings)
  
  const totalValue = combinedHoldings.reduce((sum, h) => sum + calculateCurrentValue(h), 0)
  
  if (totalValue === 0) {
    return []
  }

  const allocationMap = new Map<AssetType, { value: number; count: number }>()

  combinedHoldings.forEach((holding) => {
    const value = calculateCurrentValue(holding)
    const existing = allocationMap.get(holding.assetType) || { value: 0, count: 0 }
    allocationMap.set(holding.assetType, {
      value: existing.value + value,
      count: existing.count + 1,
    })
  })

  return Array.from(allocationMap.entries())
    .map(([assetType, data]) => ({
      assetType,
      value: data.value,
      percentage: (data.value / totalValue) * 100,
      count: data.count,
    }))
    .sort((a, b) => b.value - a.value)
}

/**
 * Calculate asset type allocation with currency conversion to USD
 * Combines holdings by asset (assetType + symbol + currency) before calculation
 * @param holdings - All holdings to calculate allocation for
 * @param exchangeRates - Map of currency to exchange rate (1 USD = X currency)
 */
export function calculateUnifiedAssetAllocation(
  holdings: Holding[],
  exchangeRates: Map<string, number>
): AssetTypeAllocation[] {
  // Combine holdings by asset before calculation
  const combinedHoldings = combineHoldingsByAsset(holdings)
  
  let totalValue = 0
  const allocationMap = new Map<AssetType, { value: number; count: number }>()

  combinedHoldings.forEach((holding) => {
    const exchangeRate = holding.currency === 'USD' 
      ? 1 
      : (exchangeRates.get(holding.currency) || 1)
    
    const value = calculateCurrentValue(holding)
    const valueInUSD = convertToUSD(value, holding.currency, exchangeRate)
    
    totalValue += valueInUSD
    
    const existing = allocationMap.get(holding.assetType) || { value: 0, count: 0 }
    allocationMap.set(holding.assetType, {
      value: existing.value + valueInUSD,
      count: existing.count + 1,
    })
  })

  if (totalValue === 0) {
    return []
  }

  return Array.from(allocationMap.entries())
    .map(([assetType, data]) => ({
      assetType,
      value: data.value,
      percentage: (data.value / totalValue) * 100,
      count: data.count,
    }))
    .sort((a, b) => b.value - a.value)
}

/**
 * Get top performers (best and worst)
 */
export function getTopPerformers(holdings: Holding[], count: number = 5) {
  const sorted = [...holdings].sort((a, b) => {
    const gainA = calculateGainLossPercent(a)
    const gainB = calculateGainLossPercent(b)
    return gainB - gainA
  })

  return {
    best: sorted.slice(0, count),
    worst: sorted.slice(-count).reverse(),
  }
}

/**
 * Format currency value
 */
export function formatCurrency(value: number, currency: string = 'USD'): string {
  // Handle PKR specially as it may not be recognized by Intl.NumberFormat
  if (currency === 'PKR') {
    return `Rs. ${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)}`
  }
  
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch (error) {
    // Fallback for unsupported currencies
    return `${currency} ${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)}`
  }
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals: number = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

/**
 * Group holdings by currency
 */
export function groupHoldingsByCurrency(holdings: Holding[]): Map<string, Holding[]> {
  const grouped = new Map<string, Holding[]>()
  
  holdings.forEach((holding) => {
    const currency = holding.currency || 'USD'
    const existing = grouped.get(currency) || []
    grouped.set(currency, [...existing, holding])
  })
  
  return grouped
}

/**
 * Convert a value from one currency to USD
 * @param value - The value in the source currency
 * @param fromCurrency - The source currency code
 * @param exchangeRate - Exchange rate as "1 USD = X currency" (e.g., 1 USD = 277.78 PKR)
 */
export function convertToUSD(value: number, fromCurrency: string, exchangeRate: number): number {
  if (fromCurrency === 'USD') return value
  // If 1 USD = X currency, then to convert currency to USD: value / X
  return value / exchangeRate
}

/**
 * Calculate unified portfolio summary in USD
 * Combines holdings by asset (assetType + symbol + currency) before calculation
 * @param holdings - All holdings to calculate summary for
 * @param exchangeRates - Map of currency to exchange rate (1 USD = X currency)
 */
export function calculateUnifiedPortfolioSummary(
  holdings: Holding[],
  exchangeRates: Map<string, number> // Map of currency to exchange rate (1 USD = X currency)
): PortfolioSummary {
  // Combine holdings by asset before calculation
  const combinedHoldings = combineHoldingsByAsset(holdings)
  
  let totalInvested = 0
  let currentValue = 0

  combinedHoldings.forEach((holding) => {
    const exchangeRate = holding.currency === 'USD' 
      ? 1 
      : (exchangeRates.get(holding.currency) || 1)
    
    const invested = calculateInvested(holding)
    const value = calculateCurrentValue(holding)
    
    totalInvested += convertToUSD(invested, holding.currency, exchangeRate)
    currentValue += convertToUSD(value, holding.currency, exchangeRate)
  })

  const totalGainLoss = currentValue - totalInvested
  const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0
  const cagr = calculatePortfolioCAGR(combinedHoldings, currentValue, totalInvested)

  return {
    totalInvested,
    currentValue,
    totalGainLoss,
    totalGainLossPercent,
    holdingsCount: combinedHoldings.length, // Count of unique assets, not individual holdings
    cagr,
  }
}

/**
 * Calculate dividends collected for PK equity holdings
 * @param holdings - PK equity holdings to calculate dividends for
 * @returns Promise resolving to array of holding dividends
 */
export async function calculateDividendsCollected(
  holdings: Holding[]
): Promise<HoldingDividend[]> {
  const pkEquityHoldings = holdings.filter(h => h.assetType === 'pk-equity')
  
  if (pkEquityHoldings.length === 0) {
    return []
  }

  // Fetch dividends for all holdings in parallel
  const dividendPromises = pkEquityHoldings.map(async (holding) => {
    try {
      const response = await fetch(`/api/pk-equity/dividend?ticker=${encodeURIComponent(holding.symbol)}`)
      if (!response.ok) {
        return { holdingId: holding.id, symbol: holding.symbol, dividends: [], totalCollected: 0 }
      }

      const data = await response.json()
      const dividendRecords = data.dividends || []
      
      // Filter dividends that occurred on or after purchase date
      const relevantDividends = filterDividendsByPurchaseDate(dividendRecords, holding.purchaseDate)
        .map((d: any) => {
          // Convert dividend_amount (percent/10) to rupees
          const dividendAmountRupees = convertDividendToRupees(d.dividend_amount)
          const totalCollected = calculateTotalDividendsForHolding(dividendAmountRupees, holding.quantity)
          
          return {
            date: d.date,
            dividendAmount: dividendAmountRupees,
            totalCollected
          }
        })
      
      const totalCollected = relevantDividends.reduce((sum: number, d: any) => sum + d.totalCollected, 0)
      
      return {
        holdingId: holding.id,
        symbol: holding.symbol,
        dividends: relevantDividends,
        totalCollected
      }
    } catch (error) {
      console.error(`Error fetching dividends for ${holding.symbol}:`, error)
      return { holdingId: holding.id, symbol: holding.symbol, dividends: [], totalCollected: 0 }
    }
  })

  return Promise.all(dividendPromises)
}

/**
 * Calculate total dividends collected across all PK equity holdings
 * @param holdings - All holdings (will filter for PK equity)
 * @returns Promise resolving to total dividends collected
 */
export async function calculateTotalDividendsCollected(
  holdings: Holding[]
): Promise<number> {
  const holdingDividends = await calculateDividendsCollected(holdings)
  return holdingDividends.reduce((sum, hd) => sum + hd.totalCollected, 0)
}

