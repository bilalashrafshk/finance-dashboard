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

  // Find the recovery point (first index where price >= peakPrice)
  let recoveryIndex = -1
  for (let i = peakIndex + 1; i < data.length; i++) {
    if (data[i].close >= peakPrice) {
      recoveryIndex = i
      break
    }
  }

  // Determine the range to search for drawdown
  // If no recovery found, search until end of data
  const searchEndIndex = recoveryIndex !== -1 ? recoveryIndex : data.length

  // Find max drawdown within this period
  let lowestPrice = peakPrice
  let lowestIndex = peakIndex

  for (let i = peakIndex + 1; i < searchEndIndex; i++) {
    if (data[i].close < lowestPrice) {
      lowestPrice = data[i].close
      lowestIndex = i
    }
  }

  const maxDrawdown = (peakPrice - lowestPrice) / peakPrice

  // If drawdown is less than 30%, it's not a valid cycle peak
  if (maxDrawdown < DRAWDOWN_THRESHOLD) {
    const remainingData = data.length - peakIndex
    if (remainingData < 100 && recoveryIndex === -1) {
      // Near end of data, treat as valid ongoing cycle
      return { isValid: true, recoveryIndex: null }
    }

    // Drawdown wasn't deep enough to be a cycle peak.
    // We should NOT jump to recovery, because we want to find the HIGHER peak 
    // that might occur before or after that recovery.
    // Return null recoveryIndex to indicate "just continue searching linearly"
    return { isValid: false, recoveryIndex: null }
  }

  // We have a significant drawdown (>30%)

  // If we found a recovery, check the time taken
  if (recoveryIndex !== -1) {
    const peakDate = data[peakIndex].date
    const recoveryDate = data[recoveryIndex].date
    const tradingDays = calculateTradingDaysBetween(peakDate, recoveryDate)

    if (tradingDays > MIN_RECOVERY_DAYS) {
      return { isValid: true, recoveryIndex: null }
    } else {
      // Recovered too quickly (V-shape recovery < 1 year)
      return { isValid: false, recoveryIndex: recoveryIndex }
    }
  }

  // If no recovery (yet), check time since peak or time since drawdown start
  const peakDate = data[peakIndex].date
  const lastDate = data[data.length - 1].date
  const timeSincePeak = calculateTradingDaysBetween(peakDate, lastDate)

  if (timeSincePeak > MIN_RECOVERY_DAYS) {
    // It's been > 1 year and we are still down > 30% (or haven't recovered)
    return { isValid: true, recoveryIndex: null }
  }

  return { isValid: false, recoveryIndex: null }
}

/**
 * Find the lowest daily close during the drawdown period after a validated peak
 * This becomes the next cycle's trough
 * 
 * The drawdown period is: from when 30% drawdown occurs until recovery to peak level
 * We find the lowest close during this entire period
 * 
 * @param data - Full price data array
 * @param peakIndex - Index of the validated peak
 * @param peakPrice - Price at the peak
 * @returns The lowest point during drawdown, or null if not found
 */
export function findLowestPointDuringDrawdown(
  data: PriceDataPoint[],
  peakIndex: number,
  peakPrice: number
): { index: number; price: number } | null {
  // Find recovery point
  let recoveryIndex = -1
  for (let i = peakIndex + 1; i < data.length; i++) {
    if (data[i].close >= peakPrice) {
      recoveryIndex = i
      break
    }
  }

  const searchEndIndex = recoveryIndex !== -1 ? recoveryIndex : data.length

  let lowestPrice = peakPrice
  let lowestIndex = peakIndex

  for (let i = peakIndex + 1; i < searchEndIndex; i++) {
    if (data[i].close < lowestPrice) {
      lowestPrice = data[i].close
      lowestIndex = i
    }
  }

  if (lowestIndex !== peakIndex) {
    return { index: lowestIndex, price: lowestPrice }
  }

  return null
}

/**
 * Detect market cycles from trough to peak
 * 
 * Algorithm (as specified):
 * 1. Start from hardcoded first trough: July 13, 1998 (or from lastSavedCycleEndDate if provided)
 * 2. Find next validated peak (30%+ drawdown, >252 trading days to recover)
 * 3. After validated peak, find lowest daily close during the >1 year drawdown period
 * 4. That lowest point becomes the next cycle's trough
 * 5. Repeat from step 2
 * 
 * @param data - Full price data array
 * @param startFromDate - Optional: Start detecting cycles from this date (ISO string). 
 *                        If not provided, uses hardcoded July 13, 1998.
 *                        Used to only detect new cycles after saved cycles.
 */
export function detectMarketCycles(
  data: PriceDataPoint[],
  startFromDate?: string
): MarketCycle[] {
  if (data.length < 100) {
    return [] // Need sufficient data
  }

  // Extract prices and dates (using daily closes only)
  const prices = data.map(d => d.close)
  const dates = data.map(d => d.date)

  // Detect peaks for finding validated peaks
  const peaks = detectPeaks(prices)

  // Determine starting date: use provided startFromDate or default to July 13, 1998
  const FIRST_TROUGH_DATE = startFromDate || '1998-07-13'

  // Helper to normalize date to YYYY-MM-DD format
  const normalizeDate = (dateStr: string): string => {
    // Handle both Date objects and ISO strings
    const date = new Date(dateStr)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Find the index for the starting date
  let firstTroughIndex = -1
  const normalizedStartDate = normalizeDate(FIRST_TROUGH_DATE)

  for (let i = 0; i < dates.length; i++) {
    const normalizedDate = normalizeDate(dates[i])
    if (normalizedDate === normalizedStartDate || normalizedDate >= normalizedStartDate) {
      firstTroughIndex = i
      break
    }
  }

  if (firstTroughIndex < 0) {
    // If date not found, use earliest available data
    firstTroughIndex = 0
  }

  // Find the actual lowest close near that date (within 60 days) to get the real trough
  const searchWindow = 60 // days
  let lowestPrice = prices[firstTroughIndex]
  let lowestIndex = firstTroughIndex

  for (let i = Math.max(0, firstTroughIndex - searchWindow); i < Math.min(data.length, firstTroughIndex + searchWindow); i++) {
    if (prices[i] < lowestPrice) {
      lowestPrice = prices[i]
      lowestIndex = i
    }
  }

  const cycles: MarketCycle[] = []
  let currentTroughIndex = lowestIndex
  let currentTroughPrice = lowestPrice

  // Process cycles iteratively
  while (currentTroughIndex < data.length - 1) {

    // Find next validated peak from current trough
    let searchStartIndex = currentTroughIndex
    let validatedPeak: ExtremePoint | null = null

    // Keep searching for a valid peak
    while (searchStartIndex < data.length - 1) {
      const nextPeak = findNextPeak(data, searchStartIndex, peaks)

      if (!nextPeak) {
        break
      }

      // Validate this peak
      const validation = validatePeak(data, nextPeak.index, nextPeak.value)

      if (validation.isValid) {
        // Found a valid peak!
        validatedPeak = nextPeak
        break
      } else if (validation.recoveryIndex !== null) {
        // Peak was invalid because recovery was too fast (V-shape)
        // Jump to recovery point to avoid finding lower peaks within the recovery
        searchStartIndex = validation.recoveryIndex
      } else {
        // Peak was invalid because drawdown wasn't deep enough (<30%)
        // Just continue searching for the next (higher) peak
        searchStartIndex = nextPeak.index + 1
      }
    }

    if (!validatedPeak) {
      // No validated peak found - this implies we are in an "ongoing" cycle 
      // where natural market action hasn't produced a >30% drawdown yet.

      // Find the highest price seen since the current trough to use as the temporary peak
      let maxPrice = -Infinity
      let maxIndex = -1

      // Search from trough to end of data
      for (let i = currentTroughIndex; i < prices.length; i++) {
        if (prices[i] > maxPrice) {
          maxPrice = prices[i]
          maxIndex = i
        }
      }

      if (maxIndex !== -1 && maxIndex >= currentTroughIndex) {
        // Create the ongoing cycle
        const startDate = dates[currentTroughIndex]
        const endDate = dates[maxIndex]
        const startPrice = currentTroughPrice
        const endPrice = maxPrice
        const roi = ((endPrice - startPrice) / startPrice) * 100
        const durationTradingDays = calculateTradingDaysBetween(startDate, endDate)

        // Extract price data
        const cyclePriceData: Array<{ date: string; price: number; tradingDay: number }> = []
        let tradingDayCounter = 0

        for (let j = currentTroughIndex; j <= prices.length - 1; j++) {
          // For ongoing cycles, we include ALL data up to present, 
          // even if it's past the "peak" (ATH)

          const date = dates[j]
          const price = prices[j]

          if (j === currentTroughIndex) {
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
          cycleName: `Cycle ${cycles.length + 1} (Ongoing)`,
          startDate,
          endDate, // This is the date of the ATH
          startPrice,
          endPrice, // Price at ATH
          roi,
          durationTradingDays, // Duration to ATH? Or to present? Kept to ATH for consistency with "endDate"
          priceData: cyclePriceData
        })
      }

      break
    }

    // Create cycle from current trough to validated peak
    const startDate = dates[currentTroughIndex]
    const endDate = dates[validatedPeak.index]
    const startPrice = currentTroughPrice
    const endPrice = validatedPeak.value
    const roi = ((endPrice - startPrice) / startPrice) * 100
    const durationTradingDays = calculateTradingDaysBetween(startDate, endDate)

    // Extract price data for this cycle (normalized for charting)
    const cyclePriceData: Array<{ date: string; price: number; tradingDay: number }> = []
    let tradingDayCounter = 0

    for (let j = currentTroughIndex; j <= validatedPeak.index; j++) {
      const date = dates[j]
      const price = prices[j]

      // Count trading days from start
      if (j === currentTroughIndex) {
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

    // For next cycle: Find the lowest daily close during the drawdown period
    const lowestPoint = findLowestPointDuringDrawdown(
      data,
      validatedPeak.index,
      validatedPeak.value
    )

    if (!lowestPoint) {
      // No valid drawdown period found - end of cycles
      break
    }

    // Set up for next cycle - use the lowest point during drawdown as the next trough
    currentTroughIndex = lowestPoint.index
    currentTroughPrice = lowestPoint.price
  }

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
