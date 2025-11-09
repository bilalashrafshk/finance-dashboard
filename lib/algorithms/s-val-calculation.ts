// S_val Calculation Algorithm

import type { FairValueBands } from "./fair-value-bands"
import type { WeeklyData } from "./fair-value-bands"

/**
 * Calculate percentile rank of a value within a sorted array
 * Returns value in [0, 1] range using linear interpolation
 * Uses standard percentile rank formula: (count of values <= value) / total count
 */
function percentileRank(value: number, sortedArray: number[]): number {
  if (sortedArray.length === 0) return 0.5

  const n = sortedArray.length

  // Handle edge cases
  if (value <= sortedArray[0]) return 0
  if (value >= sortedArray[n - 1]) return 1

  // Find the position where value would be inserted
  let lowerIdx = 0
  let upperIdx = n - 1

  // Binary search for efficiency
  while (upperIdx - lowerIdx > 1) {
    const mid = Math.floor((lowerIdx + upperIdx) / 2)
    if (sortedArray[mid] < value) {
      lowerIdx = mid
    } else {
      upperIdx = mid
    }
  }

  // Now we have sortedArray[lowerIdx] <= value <= sortedArray[upperIdx]
  const lowerVal = sortedArray[lowerIdx]
  const upperVal = sortedArray[upperIdx]

  // If exact match at lower bound
  if (lowerVal === value) {
    // Count how many values are <= this value (including duplicates)
    let count = lowerIdx + 1
    while (count < n && sortedArray[count] === value) {
      count++
    }
    return count / n
  }

  // Linear interpolation between lower and upper bounds
  const fraction = (value - lowerVal) / (upperVal - lowerVal)
  
  // Percentile rank with interpolation
  // Lower rank: (lowerIdx + 1) / n
  // Upper rank: (upperIdx + 1) / n
  const lowerRank = (lowerIdx + 1) / n
  const upperRank = (upperIdx + 1) / n

  return lowerRank + fraction * (upperRank - lowerRank)
}

/**
 * Calculate S_val (valuation metric) using fixed historic percentile mapping
 * Maps z-scores to [0,1] range based on their percentile rank in historical distribution
 * This naturally bounds values without clipping and prevents retroactive changes
 * 
 * @param cutoffDate - Optional date to use only data up to this date for percentile calculation
 *                     If null, uses all historical data
 */
export function calculateSVal(
  weeklyData: WeeklyData[],
  bands: FairValueBands,
  cutoffDate: Date | null = null,
): number[] {
  // Calculate log residuals
  const logPrice = weeklyData.map((week) => Math.log(week.ethUsdClose))
  const logFair = bands.fair.map((fair) => Math.log(fair))
  const resid = logPrice.map((lp, i) => lp - logFair[i])

  // Calculate z-scores using the sigma from bands
  const zVal = resid.map((r) => r / bands.sigma)

  // Determine which z-scores to use for percentile calculation
  let referenceZVal: number[]
  if (cutoffDate) {
    // Use only z-scores up to the cutoff date
    referenceZVal = zVal.filter((z, i) => {
      const date = weeklyData[i].date
      return date <= cutoffDate && !isNaN(z) && isFinite(z)
    })
  } else {
    // Use all historical z-scores
    referenceZVal = zVal.filter((z) => !isNaN(z) && isFinite(z))
  }

  if (referenceZVal.length === 0) {
    return zVal.map(() => 0.5) // Default to middle if no valid data
  }

  // Create sorted array of reference z-scores for percentile mapping
  const sortedZVal = [...referenceZVal].sort((a, b) => a - b)

  // Map each z-score to its percentile rank in the reference distribution
  // This naturally bounds values to [0, 1] without clipping
  const sVal = zVal.map((z) => {
    if (!isNaN(z) && isFinite(z)) {
      return percentileRank(z, sortedZVal)
    }
    return 0.5 // Default for invalid values
  })

  return sVal
}

