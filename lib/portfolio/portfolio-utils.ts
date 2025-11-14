/**
 * Portfolio Calculation Utilities
 * 
 * Functions for calculating portfolio metrics, summaries, and allocations.
 */

import type { Holding, PortfolioSummary, AssetTypeAllocation, AssetType } from './types'
import { ASSET_TYPE_LABELS } from './types'

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
 * Calculate portfolio summary statistics
 */
export function calculatePortfolioSummary(holdings: Holding[]): PortfolioSummary {
  const totalInvested = holdings.reduce((sum, h) => sum + calculateInvested(h), 0)
  const currentValue = holdings.reduce((sum, h) => sum + calculateCurrentValue(h), 0)
  const totalGainLoss = currentValue - totalInvested
  const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0

  return {
    totalInvested,
    currentValue,
    totalGainLoss,
    totalGainLossPercent,
    holdingsCount: holdings.length,
  }
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

  return {
    totalInvested,
    currentValue,
    totalGainLoss,
    totalGainLossPercent,
    holdingsCount: holdings.length,
  }
}

