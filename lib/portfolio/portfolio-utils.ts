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
  // For commodities, always use purchase price (no unrealized P&L until sold/realized)
  if (holding.assetType === 'commodities') {
    return holding.quantity * holding.purchasePrice
  }
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
 * Only works client-side (browser environment)
 */
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

/**
 * Calculate realized PnL per asset from trades
 * Groups by asset key (assetType:symbol:currency) and sums realized PnL from sell transactions
 * @param trades - Array of all trades
 * @returns Map of asset key to realized PnL amount
 */
/**
 * Calculate realized PnL per asset from trades using FIFO logic
 * Groups by asset key (assetType:symbol:currency) and sums realized PnL from sell transactions
 * @param trades - Array of all trades
 * @returns Map of asset key to realized PnL amount
 */
export function calculateRealizedPnLPerAsset(trades: Trade[]): Map<string, number> {
  // Use the centralized FIFO calculation
  // We don't need current prices for realized P&L, so pass empty map
  const { calculateFifoMetrics } = require('./fifo-utils')
  const { realizedPnL } = calculateFifoMetrics(trades)
  return realizedPnL
}

/**
 * Calculate total invested amount per asset from buy/add transactions
 * Groups by asset key (assetType:symbol:currency) and sums totalAmount from buy/add transactions
 * @param trades - Array of all trades
 * @returns Map of asset key to total invested amount
 */
export function calculateInvestedPerAsset(trades: Trade[]): Map<string, number> {
  const investedMap = new Map<string, number>()

  trades.forEach((trade) => {
    if (trade.tradeType === 'buy' || trade.tradeType === 'add') {
      // Group by asset key (assetType:symbol:currency)
      const assetKey = `${trade.assetType}:${trade.symbol.toUpperCase()}:${trade.currency}`
      const currentInvested = investedMap.get(assetKey) || 0
      investedMap.set(assetKey, currentInvested + trade.totalAmount)
    }
  })

  return investedMap
}

/**
 * Calculate net deposits (Total Deposits - Total Withdrawals)
 * This represents the actual capital injected into the portfolio
 * @param trades - Array of all trades
 * @returns Net deposits amount
 */
export function calculateNetDeposits(trades: Trade[]): number {
  let deposits = 0
  let withdrawals = 0

  trades.forEach((trade) => {
    // 'add' = Deposit (Cash injection)
    if (trade.tradeType === 'add') {
      deposits += trade.totalAmount
    }
    // 'remove' = Withdrawal (Cash extraction)
    else if (trade.tradeType === 'remove') {
      withdrawals += trade.totalAmount
    }
  })

  return deposits - withdrawals
}

export async function calculateTotalRealizedPnL(): Promise<number> {
  // Only run in browser environment
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return 0
  }

  try {
    const token = localStorage.getItem('auth_token')
    if (!token) {
      return 0
    }

    // Use optimized endpoint with caching
    const response = await fetch('/api/user/realized-pnl', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      return 0
    }

    const data = await response.json()
    return data.realizedPnL || 0
  } catch (error) {
    // Silently fail - this is not critical for the app to function
    if (process.env.NODE_ENV === 'development') {
      console.error('Error calculating realized PnL:', error)
    }
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

  // Adjust Total Invested to be Net Deposits (Current Cost Basis - Realized Gains)
  // This ensures that if you sell and hold Cash, your "Invested" amount reflects original principal
  // Formula: Total Invested = Current Value - Total PnL (Realized + Unrealized)
  // Note: summary.totalInvested (calculated earlier) is Sum(Cost Basis).
  // Since Cash Cost Basis = Quantity, it includes Realized Gains.
  // So: Adjusted Invested = Sum(Cost Basis) - Realized PnL.
  if (realizedPnL !== 0) {
    summary.totalInvested = summary.totalInvested - realizedPnL
    // Recalculate percentages based on new invested amount
    if (summary.totalInvested !== 0) {
      summary.totalGainLossPercent = (summary.totalGainLoss / summary.totalInvested) * 100
      summary.dividendsCollectedPercent = (dividendsCollected / summary.totalInvested) * 100
    }
  }

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

  // Note: Realized PnL is calculated from all sell transactions across all currencies
  // For a more accurate unified view, we'd need to track realized PnL per currency and convert
  // For now, we'll use the total realized PnL (which may be in different currencies)
  // This is a limitation but acceptable for most use cases
  summary.realizedPnL = realizedPnL
  summary.totalPnL = summary.totalGainLoss + realizedPnL

  // Adjust Total Invested to be Net Deposits (see explanation above)
  if (realizedPnL !== 0) {
    summary.totalInvested = summary.totalInvested - realizedPnL
    // Recalculate percentages based on new invested amount
    if (summary.totalInvested !== 0) {
      summary.totalGainLossPercent = (summary.totalGainLoss / summary.totalInvested) * 100
    }
  }

  return summary
}

// Memoization cache for asset allocation calculations
const assetAllocationCache = new Map<string, AssetTypeAllocation[]>()
const ALLOCATION_CACHE_TTL = 30 * 1000 // 30 seconds

/**
 * Calculate asset type allocation
 * Combines holdings by asset (assetType + symbol + currency) before calculation
 * Memoized to avoid recalculating on every render
 */
export function calculateAssetAllocation(holdings: Holding[]): AssetTypeAllocation[] {
  // Create cache key from holdings
  const cacheKey = holdings
    .map(h => `${h.assetType}:${h.symbol}:${h.currency}:${h.quantity}:${h.currentPrice}`)
    .sort()
    .join('|')

  // Check cache
  const cached = assetAllocationCache.get(cacheKey)
  if (cached) {
    return cached
  }
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

  const result = Array.from(allocationMap.entries())
    .map(([assetType, data]) => ({
      assetType,
      value: data.value,
      percentage: (data.value / totalValue) * 100,
      count: data.count,
    }))
    .sort((a, b) => b.value - a.value)

  // Cache the result
  assetAllocationCache.set(cacheKey, result)

  // Clean up old cache entries periodically
  if (assetAllocationCache.size > 100) {
    // Keep only the most recent 50 entries
    const entries = Array.from(assetAllocationCache.entries())
    assetAllocationCache.clear()
    entries.slice(-50).forEach(([key, value]) => {
      assetAllocationCache.set(key, value)
    })
  }

  return result
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
  // Handle very large numbers that might cause scientific notation
  // If value is too large, cap it at a reasonable maximum
  if (Math.abs(value) > 1000000) {
    return `${value >= 0 ? '+' : ''}∞%`
  }

  // Use toLocaleString to avoid scientific notation for large numbers
  const formatted = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: false
  })

  return `${value >= 0 ? '+' : ''}${formatted}%`
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

  // Smart Caching for Dividends
  // Dividends change rarely, so we can cache them for 24 hours
  const cacheKey = 'dividends_cache_v1'
  const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

  try {
    const cachedData = localStorage.getItem(cacheKey)
    if (cachedData) {
      const { timestamp, data } = JSON.parse(cachedData)
      const age = Date.now() - timestamp

      // If cache is valid (less than 24 hours old)
      if (age < CACHE_TTL) {
        // Check if we have data for all requested symbols in the cache
        const cachedSymbols = new Set(data.map((d: any) => d.symbol))
        const allSymbolsPresent = pkEquityHoldings.every(h => cachedSymbols.has(h.symbol))

        if (allSymbolsPresent) {
          // Return cached data, but filter/recalculate based on current holdings (quantity/purchase date might have changed)
          return pkEquityHoldings.map(holding => {
            const cachedRecord = data.find((d: any) => d.symbol === holding.symbol)
            if (!cachedRecord) return { holdingId: holding.id, symbol: holding.symbol, dividends: [], totalCollected: 0 }

            // Recalculate based on current quantity and purchase date
            // The cached record contains raw dividend events
            const relevantDividends = filterDividendsByPurchaseDate(cachedRecord.rawDividends || [], holding.purchaseDate)
              .map((d: any) => {
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
          })
        }
      }
    }
  } catch (e) {
    console.warn('Error reading dividend cache:', e)
  }

  // Use batch API for better performance
  try {
    const token = localStorage.getItem('auth_token')
    const holdingsData = pkEquityHoldings.map(h => ({
      symbol: h.symbol,
      purchaseDate: h.purchaseDate,
    }))

    const response = await fetch('/api/user/dividends/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ holdings: holdingsData }),
    })

    if (response.ok) {
      const data = await response.json()
      const dividendsMap = data.dividends || {}

      // Prepare data for cache (store raw dividends per symbol)
      const cacheData = Object.entries(dividendsMap).map(([symbol, rawDividends]) => ({
        symbol,
        rawDividends
      }))

      // Save to cache
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          timestamp: Date.now(),
          data: cacheData
        }))
      } catch (e) {
        console.warn('Error writing dividend cache:', e)
      }

      // Process results
      return pkEquityHoldings.map((holding) => {
        const dividendRecords = dividendsMap[holding.symbol.toUpperCase()] || []

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
      })
    }
  } catch (error) {
    console.error('Error fetching batch dividends:', error)
  }

  // Fallback to individual calls if batch fails
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
/**
 * Portfolio history entry from API
 */
export interface PortfolioHistoryEntry {
  date: string
  invested: number // Portfolio value (cash + market value)
  cashFlow?: number // Net cash flow on this date (deposits - withdrawals)
  cash?: number
  [key: string]: any // Allow other fields
}

/**
 * Adjusted portfolio history entry (accounting for cash flows)
 */
export interface AdjustedPortfolioHistoryEntry {
  date: string
  rawValue: number // Original portfolio value
  cashFlow: number // Net cash flow on this date
  cumulativeCashFlows: number // Cumulative cash flows up to this date
  adjustedValue: number // Portfolio value adjusted for cash flows (rawValue - cumulativeCashFlows)
}

/**
 * Adjusted daily return entry
 */
export interface AdjustedDailyReturn {
  date: string
  return: number // Daily return as percentage
  adjustedValue: number // Adjusted portfolio value on this date
  rawValue: number // Raw portfolio value on this date
}

/**
 * Calculate adjusted portfolio history accounting for net cash flows
 * This is the centralized function used by all performance metrics
 * 
 * Formula: Adjusted Value = Portfolio Value - Cumulative Net Deposits
 * 
 * This ensures metrics measure investment performance, not portfolio growth from deposits
 * 
 * @param history - Raw portfolio history from API
 * @returns Array of adjusted history entries
 */
/**
 * Calculate adjusted portfolio history (TWR Wealth Index)
 * 
 * Instead of subtracting cumulative cash flows (which breaks returns),
 * this calculates a "Wealth Index" based on Time-Weighted Returns.
 * This represents the growth of $1 invested at the start.
 * 
 * @param history - Raw portfolio history from API
 * @returns Array of adjusted history entries (adjustedValue = TWR Wealth Index)
 */
export function calculateAdjustedPortfolioHistory(
  history: PortfolioHistoryEntry[]
): AdjustedPortfolioHistoryEntry[] {
  if (!history || history.length === 0) {
    return []
  }

  // Sort by date to ensure chronological order
  const sortedHistory = [...history].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  const adjustedHistory: AdjustedPortfolioHistoryEntry[] = []

  // Calculate Daily TWRs first
  const returns = calculateDailyTWR(sortedHistory);
  const returnsMap = new Map(returns.map(r => [r.date, r.return]));

  // Initialize Index
  // We start with the actual first value to assume a "Price" series
  // Or we can construct a normalized index. 
  // For 'adjustedValue' to be useful for charts and CAGR, it should act like the portfolio value "if no deposits/withdrawals happened".

  let currentIndexValue = sortedHistory[0].invested || 0;
  if (currentIndexValue === 0 && sortedHistory.length > 1) {
    // If start is 0, find first non-zero
    const firstNonZero = sortedHistory.find(h => (h.invested || 0) > 0);
    currentIndexValue = firstNonZero ? firstNonZero.invested : 100;
  }

  let cumulativeCashFlows = 0;

  for (let i = 0; i < sortedHistory.length; i++) {
    const entry = sortedHistory[i];
    const cashFlow = entry.cashFlow || 0;
    cumulativeCashFlows += cashFlow;

    // Apply Return to update Index
    // Index_t = Index_{t-1} * (1 + r_t)
    if (i > 0) {
      const dailyRetPct = returnsMap.get(entry.date) || 0;
      currentIndexValue = currentIndexValue * (1 + (dailyRetPct / 100));
    }

    adjustedHistory.push({
      date: entry.date,
      rawValue: entry.invested || 0,
      cashFlow,
      cumulativeCashFlows,
      adjustedValue: currentIndexValue
    })
  }

  return adjustedHistory
}

/**
 * Internal helper to calculate TWR for raw history
 * Formula: Return = (End) / (Start + Flow) - 1
 */
function calculateDailyTWR(sortedHistory: PortfolioHistoryEntry[]): { date: string, return: number }[] {
  const returns: { date: string, return: number }[] = [];
  if (sortedHistory.length < 2) return returns;

  for (let i = 1; i < sortedHistory.length; i++) {
    const today = sortedHistory[i];
    const yesterday = sortedHistory[i - 1];

    const startVal = yesterday.invested || 0;
    const endVal = today.invested || 0;
    const flow = today.cashFlow || 0; // Net Flow on 'today'

    // Denominator: Capital available to earn return
    // Assuming flow happens at START of day (or contributes to day's PnL)
    const adjustedStart = startVal + flow;

    let ret = 0;
    if (adjustedStart !== 0) {
      ret = (endVal / adjustedStart) - 1;
    }

    returns.push({
      date: today.date,
      return: ret * 100 // Convert to Percentage
    });
  }
  return returns;
}

/**
 * Calculate adjusted daily returns from history
 * Now delegates to the correct TWR logic.
 * 
 * @param adjustedHistory - Ignored (legacy signature)
 * @param rawHistory - Raw portfolio history (required)
 * @returns Array of daily return entries
 */
export function calculateAdjustedDailyReturns(
  adjustedHistory: AdjustedPortfolioHistoryEntry[],
  rawHistory: PortfolioHistoryEntry[]
): AdjustedDailyReturn[] {
  if (!rawHistory || rawHistory.length < 2) {
    return []
  }

  // Ensure sorted
  const sortedHistory = [...rawHistory].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  const twrReturns = calculateDailyTWR(sortedHistory);

  // We need to match the signature of AdjustedDailyReturn
  // which includes adjustedValue (the Index) and rawValue

  // We can re-use the passed adjustedHistory if it's already the Index (since we updated calculateAdjustedPortfolioHistory)
  // Or we map from the calculated TWR.

  // To be safe and consistent with the new Index logic:
  const indexMap = new Map(adjustedHistory.map(h => [h.date, h]));

  return twrReturns.map(r => {
    const adjEntry = indexMap.get(r.date);
    return {
      date: r.date,
      return: r.return,
      adjustedValue: adjEntry ? adjEntry.adjustedValue : 0,
      rawValue: adjEntry ? adjEntry.rawValue : 0
    }
  });
}

export async function calculateTotalDividendsCollected(
  holdings: Holding[]
): Promise<number> {
  const holdingDividends = await calculateDividendsCollected(holdings)
  return holdingDividends.reduce((sum, hd) => sum + hd.totalCollected, 0)
}


