/**
 * Portfolio Calculation Utilities
 * 
 * Functions for calculating portfolio metrics, summaries, and allocations.
 */

import type { Holding, PortfolioSummary, AssetTypeAllocation, AssetType } from './types'
import { ASSET_TYPE_LABELS } from './types'
import { convertDividendToRupees, filterDividendsByPurchaseDate, calculateTotalDividendsForHolding } from './dividend-utils'

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
 */
export function calculatePortfolioValueForDate(
  holdings: Holding[],
  date: string | Date,
  historicalPriceMap?: Map<string, { date: string; price: number }[]>
): number {
  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0]
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  
  let totalValue = 0
  
  for (const holding of holdings) {
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
 */
export function calculatePortfolioSummary(holdings: Holding[]): PortfolioSummary {
  const totalInvested = holdings.reduce((sum, h) => sum + calculateInvested(h), 0)
  const currentValue = calculateCurrentPortfolioValue(holdings) // Use centralized function
  const totalGainLoss = currentValue - totalInvested
  const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0
  const cagr = calculatePortfolioCAGR(holdings, currentValue, totalInvested)

  return {
    totalInvested,
    currentValue,
    totalGainLoss,
    totalGainLossPercent,
    holdingsCount: holdings.length,
    cagr,
  }
}

/**
 * Calculate portfolio summary statistics with dividends
 * @param holdings - Holdings to calculate summary for
 */
export async function calculatePortfolioSummaryWithDividends(
  holdings: Holding[]
): Promise<PortfolioSummary> {
  const summary = calculatePortfolioSummary(holdings)
  const dividendsCollected = await calculateTotalDividendsCollected(holdings)
  summary.dividendsCollected = dividendsCollected
  summary.dividendsCollectedPercent = summary.totalInvested > 0 ? (dividendsCollected / summary.totalInvested) * 100 : 0
  return summary
}

/**
 * Calculate asset type allocation
 */
export function calculateAssetAllocation(holdings: Holding[]): AssetTypeAllocation[] {
  const totalValue = holdings.reduce((sum, h) => sum + calculateCurrentValue(h), 0)
  
  if (totalValue === 0) {
    return []
  }

  const allocationMap = new Map<AssetType, { value: number; count: number }>()

  holdings.forEach((holding) => {
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
 * @param holdings - All holdings to calculate allocation for
 * @param exchangeRates - Map of currency to exchange rate (1 USD = X currency)
 */
export function calculateUnifiedAssetAllocation(
  holdings: Holding[],
  exchangeRates: Map<string, number>
): AssetTypeAllocation[] {
  let totalValue = 0
  const allocationMap = new Map<AssetType, { value: number; count: number }>()

  holdings.forEach((holding) => {
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
 * @param holdings - All holdings to calculate summary for
 * @param exchangeRates - Map of currency to exchange rate (1 USD = X currency)
 */
export function calculateUnifiedPortfolioSummary(
  holdings: Holding[],
  exchangeRates: Map<string, number> // Map of currency to exchange rate (1 USD = X currency)
): PortfolioSummary {
  let totalInvested = 0
  let currentValue = 0

  holdings.forEach((holding) => {
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
  const cagr = calculatePortfolioCAGR(holdings, currentValue, totalInvested)

  return {
    totalInvested,
    currentValue,
    totalGainLoss,
    totalGainLossPercent,
    holdingsCount: holdings.length,
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

