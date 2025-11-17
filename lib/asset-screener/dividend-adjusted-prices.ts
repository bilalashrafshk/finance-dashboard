/**
 * Dividend-Adjusted Price Calculations
 * 
 * Calculates total return with dividend reinvestment.
 * Assumes dividends are reinvested at the ex-dividend date price.
 */

import type { PriceDataPoint } from './metrics-calculations'

export interface DividendRecord {
  date: string // YYYY-MM-DD
  dividend_amount: number // Already in Rupees per share
}

export interface DividendAdjustedPoint {
  date: string
  originalPrice: number
  adjustedValue: number // Portfolio value with reinvested dividends
  totalShares: number // Cumulative shares after reinvestment
  returnPercent: number // Percentage return from start
}

/**
 * Calculate dividend-adjusted prices with reinvestment
 * 
 * @param priceData - Historical price data (sorted by date ascending)
 * @param dividendData - Dividend records (sorted by date ascending)
 * @returns Array of adjusted price points with total return calculation
 */
export function calculateDividendAdjustedPrices(
  priceData: PriceDataPoint[],
  dividendData: DividendRecord[]
): DividendAdjustedPoint[] {
  if (priceData.length === 0) {
    return []
  }

  // Sort data by date (ascending)
  const sortedPrices = [...priceData].sort((a, b) => a.date.localeCompare(b.date))
  const sortedDividends = [...dividendData].sort((a, b) => a.date.localeCompare(b.date))

  // Create a map of prices by date for quick lookup
  const priceMap = new Map<string, number>()
  sortedPrices.forEach(point => {
    priceMap.set(point.date, point.close)
  })

  // Find the starting price (first available price)
  const startDate = sortedPrices[0].date
  const startPrice = sortedPrices[0].close
  const initialValue = startPrice // Starting with 1 share

  // Track cumulative shares (start with 1 share)
  let totalShares = 1.0
  const result: DividendAdjustedPoint[] = []
  let processedDividendIndex = 0 // Track which dividends we've already processed

  // Process each price point chronologically
  for (const pricePoint of sortedPrices) {
    const currentDate = pricePoint.date
    const currentPrice = pricePoint.close

    // Process any dividends that occurred before or on this date that we haven't processed yet
    while (processedDividendIndex < sortedDividends.length) {
      const dividend = sortedDividends[processedDividendIndex]
      
      // Only process dividends on or before current date
      if (dividend.date > currentDate) {
        break // This dividend is in the future, stop processing
      }

      // Find the price on or after the dividend date to use for reinvestment
      let reinvestmentPrice: number | null = null
      
      // First, try to find exact date match
      if (priceMap.has(dividend.date)) {
        reinvestmentPrice = priceMap.get(dividend.date)!
      } else {
        // Find the first price after the dividend date
        const dividendDate = new Date(dividend.date)
        for (const price of sortedPrices) {
          const priceDate = new Date(price.date)
          if (priceDate >= dividendDate) {
            reinvestmentPrice = price.close
            break
          }
        }
      }

      // If we found a price, reinvest the dividend
      if (reinvestmentPrice && reinvestmentPrice > 0) {
        // Calculate additional shares from dividend reinvestment
        const additionalShares = dividend.dividend_amount / reinvestmentPrice
        totalShares += additionalShares
      }

      processedDividendIndex++ // Mark this dividend as processed
    }

    // Calculate current portfolio value
    const portfolioValue = totalShares * currentPrice

    // Calculate return percentage from start
    const returnPercent = ((portfolioValue - initialValue) / initialValue) * 100

    result.push({
      date: currentDate,
      originalPrice: currentPrice,
      adjustedValue: portfolioValue,
      totalShares: totalShares,
      returnPercent: returnPercent,
    })
  }

  return result
}

/**
 * Normalize adjusted prices to percentage starting from 100
 * 
 * @param adjustedPoints - Dividend-adjusted points
 * @returns Normalized points where starting value = 100
 */
export function normalizeToPercentage(
  adjustedPoints: DividendAdjustedPoint[]
): PriceDataPoint[] {
  if (adjustedPoints.length === 0) {
    return []
  }

  const startValue = adjustedPoints[0].adjustedValue
  if (startValue === 0) {
    return adjustedPoints.map(p => ({ date: p.date, close: 0 }))
  }

  return adjustedPoints.map(point => ({
    date: point.date,
    close: (point.adjustedValue / startValue) * 100,
  }))
}

/**
 * Normalize original prices to percentage starting from 100
 * 
 * @param priceData - Original price data
 * @returns Normalized points where starting value = 100
 */
export function normalizeOriginalPricesToPercentage(
  priceData: PriceDataPoint[]
): PriceDataPoint[] {
  if (priceData.length === 0) {
    return []
  }

  const sortedPrices = [...priceData].sort((a, b) => a.date.localeCompare(b.date))
  const startPrice = sortedPrices[0].close

  if (startPrice === 0) {
    return sortedPrices.map(p => ({ date: p.date, close: 0 }))
  }

  return sortedPrices.map(point => ({
    date: point.date,
    close: (point.close / startPrice) * 100,
  }))
}

