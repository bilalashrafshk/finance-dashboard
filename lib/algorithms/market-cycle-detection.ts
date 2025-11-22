// Market Cycle Detection Algorithm
// Detects trough-to-peak cycles with validation based on drawdown recovery time

import { detectTroughs, detectPeaks, type ExtremePoint } from './peak-trough-detection'

export interface PriceDataPoint {
  date: string // ISO date string (YYYY-MM-DD)
  close: number
}

export interface MarketCycle {
  cycleId: number
  cycleName: string // "Cycle 1", "Cycle 2", etc.
  startDate: string // Trough date
  endDate: string   // Peak date
  startPrice: number
  endPrice: number
  roi: number       // Percentage (e.g., 45.2 for 45.2%)
  durationTradingDays: number
  priceData: Array<{ date: string; price: number; tradingDay: number }> // Normalized data for charting
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6 // 0 = Sunday, 6 = Saturday
}

/**
 * Calculate the number of trading days between two dates (excluding weekends)
 * This is a simple approximation - doesn't account for market holidays
 */
function calculateTradingDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  
  if (start >= end) {
    return 0
  }
  
  let tradingDays = 0
  const current = new Date(start)
  
  while (current <= end) {
    if (!isWeekend(current)) {
      tradingDays++
    }
    current.setDate(current.getDate() + 1)
  }
  
  return tradingDays
}

/**
 * Find the next peak after a given index
 */
function findNextPeak(
  data: PriceDataPoint[],
  startIndex: number,
  peaks: ExtremePoint[]
): ExtremePoint | null {
  // Find peaks that occur after startIndex
  const futurePeaks = peaks.filter(p => p.index > startIndex)
  if (futurePeaks.length === 0) {
    return null
  }
  
  // Return the first peak (chronologically)
  return futurePeaks.sort((a, b) => a.index - b.index)[0] || null
}

/**
 * Check if a peak is valid based on drawdown recovery criteria
 * A peak is valid if after it, there's a 30%+ drawdown that takes >252 trading days to recover
 * 
 * @param data - Full price data array
 * @param peakIndex - Index of the peak to validate
 * @param peakPrice - Price at the peak
 * @returns Object with validation result and recovery index if invalid
 */
function validatePeak(
  data: PriceDataPoint[],
  peakIndex: number,
  peakPrice: number
): { isValid: boolean; recoveryIndex: number | null } {
  const DRAWDOWN_THRESHOLD = 0.30 // 30% drawdown
  const MIN_RECOVERY_DAYS = 252 // 1 year in trading days
  
  // Find the maximum drawdown after the peak
  let maxDrawdown = 0
  let drawdownIndex = peakIndex
  let lowestPriceAfterPeak = peakPrice
  
  // First pass: find the maximum drawdown point
  for (let i = peakIndex + 1; i < data.length; i++) {
    const price = data[i].close
    const drawdown = (peakPrice - price) / peakPrice
    
    if (price < lowestPriceAfterPeak) {
      lowestPriceAfterPeak = price
      drawdownIndex = i
      maxDrawdown = drawdown
    }
  }
  
  // If no significant drawdown found (less than 30%), peak might be at end of data
  if (maxDrawdown < DRAWDOWN_THRESHOLD) {
    const remainingData = data.length - peakIndex
    if (remainingData < 100) {
      // Less than 100 data points remaining - likely at end of dataset, consider valid
      return { isValid: true, recoveryIndex: null }
    }
    // No significant drawdown and plenty of data - might not be a real peak
    return { isValid: false, recoveryIndex: null }
  }
  
  // We have a 30%+ drawdown, now check recovery time
  const drawdownDate = data[drawdownIndex].date
  
  // Look for recovery (price >= peak price) after the drawdown
  for (let j = drawdownIndex + 1; j < data.length; j++) {
    if (data[j].close >= peakPrice) {
      // Price recovered to peak level
      const recoveryDate = data[j].date
      const recoveryTradingDays = calculateTradingDaysBetween(drawdownDate, recoveryDate)
      
      if (recoveryTradingDays <= MIN_RECOVERY_DAYS) {
        // Recovery happened too quickly (within 1 year) - peak is invalid
        return { isValid: false, recoveryIndex: j }
      } else {
        // Recovery took longer than 1 year - peak is valid
        return { isValid: true, recoveryIndex: null }
      }
    }
  }
  
  // If we haven't recovered yet, check if enough time has passed since drawdown
  const lastDate = data[data.length - 1].date
  const tradingDaysFromDrawdown = calculateTradingDaysBetween(drawdownDate, lastDate)
  
  if (tradingDaysFromDrawdown > MIN_RECOVERY_DAYS) {
    // Enough time has passed without recovery - peak is valid
    return { isValid: true, recoveryIndex: null }
  } else {
    // Not enough time has passed - can't determine yet, consider invalid
    // Continue searching for next peak
    return { isValid: false, recoveryIndex: null }
  }
}

/**
 * Detect market cycles from trough to peak
 * 
 * Algorithm:
 * 1. Find all troughs
 * 2. For each trough, find the next peak
 * 3. Validate peak: After peak, check if there's a 30%+ drawdown that takes >252 trading days to recover
 * 4. If peak is valid → cycle complete
 * 5. If peak is invalid (recovery <252 trading days) → continue from recovery point, find next peak
 * 6. Calculate ROI and duration
 */
export function detectMarketCycles(data: PriceDataPoint[]): MarketCycle[] {
  if (data.length < 100) {
    return [] // Need sufficient data
  }
  
  // Extract prices and dates
  const prices = data.map(d => d.close)
  const dates = data.map(d => d.date)
  
  // Detect troughs and peaks
  const troughs = detectTroughs(prices)
  const peaks = detectPeaks(prices)
  
  // Filter troughs to avoid noise - minimum distance between troughs
  const MIN_TROUGH_DISTANCE = 60 // Minimum 60 data points between troughs
  const filteredTroughs = troughs.filter((trough, idx) => {
    if (idx === 0) return true
    const prevTrough = troughs[idx - 1]
    return trough.index - prevTrough.index >= MIN_TROUGH_DISTANCE
  })
  
  const cycles: MarketCycle[] = []
  let currentIndex = 0
  
  // Process each trough
  for (let i = 0; i < filteredTroughs.length; i++) {
    const trough = filteredTroughs[i]
    
    // Skip if we've already processed past this trough
    if (trough.index < currentIndex) {
      continue
    }
    
    // Find next peak after this trough
    let searchStartIndex = trough.index
    let validatedPeak: ExtremePoint | null = null
    
    // Keep searching for a valid peak
    while (searchStartIndex < data.length - 1) {
      const nextPeak = findNextPeak(data, searchStartIndex, peaks)
      
      if (!nextPeak) {
        // No more peaks found - might be at end of data
        break
      }
      
      // Validate this peak
      const validation = validatePeak(data, nextPeak.index, nextPeak.value)
      
      if (validation.isValid) {
        // Found a valid peak!
        validatedPeak = nextPeak
        break
      } else if (validation.recoveryIndex !== null) {
        // Peak was invalid, continue from recovery point
        searchStartIndex = validation.recoveryIndex
      } else {
        // Peak was invalid but no recovery found yet - continue from peak
        searchStartIndex = nextPeak.index + 1
      }
    }
    
    if (validatedPeak) {
      // Create cycle from trough to validated peak
      const startDate = dates[trough.index]
      const endDate = dates[validatedPeak.index]
      const startPrice = trough.value
      const endPrice = validatedPeak.value
      const roi = ((endPrice - startPrice) / startPrice) * 100
      const durationTradingDays = calculateTradingDaysBetween(startDate, endDate)
      
      // Extract price data for this cycle (normalized for charting)
      const cyclePriceData: Array<{ date: string; price: number; tradingDay: number }> = []
      let tradingDayCounter = 0
      
      for (let j = trough.index; j <= validatedPeak.index; j++) {
        const date = dates[j]
        const price = prices[j]
        
        // Count trading days from start
        if (j === trough.index) {
          tradingDayCounter = 0
        } else {
          const prevDate = dates[j - 1]
          tradingDayCounter += calculateTradingDaysBetween(prevDate, date)
        }
        
        cyclePriceData.push({
          date,
          price,
          tradingDay: tradingDayCounter
        })
      }
      
      cycles.push({
        cycleId: cycles.length + 1,
        cycleName: `Cycle ${cycles.length + 1}`,
        startDate,
        endDate,
        startPrice,
        endPrice,
        roi,
        durationTradingDays,
        priceData: cyclePriceData
      })
      
      // Move current index past this cycle
      currentIndex = validatedPeak.index + 1
    }
  }
  
  // Sort cycles by start date (oldest first)
  cycles.sort((a, b) => a.startDate.localeCompare(b.startDate))
  
  // Rename cycles to ensure correct order (Cycle 1 = oldest)
  cycles.forEach((cycle, idx) => {
    cycle.cycleId = idx + 1
    cycle.cycleName = `Cycle ${idx + 1}`
  })
  
  return cycles
}

/**
 * Normalize cycle data for overlay chart
 * All cycles start at 100% and day 0
 */
export function normalizeCyclesForChart(cycles: MarketCycle[]): Array<{
  cycleName: string
  data: Array<{ tradingDay: number; normalizedPrice: number }>
  roi: number
  durationTradingDays: number
}> {
  return cycles.map(cycle => {
    if (cycle.priceData.length === 0) {
      return {
        cycleName: cycle.cycleName,
        data: [],
        roi: cycle.roi,
        durationTradingDays: cycle.durationTradingDays
      }
    }
    
    const startPrice = cycle.startPrice
    const normalizedData = cycle.priceData.map(point => ({
      tradingDay: point.tradingDay,
      normalizedPrice: (point.price / startPrice) * 100 // Normalize to 100% at start
    }))
    
    return {
      cycleName: cycle.cycleName,
      data: normalizedData,
      roi: cycle.roi,
      durationTradingDays: cycle.durationTradingDays
    }
  })
}

