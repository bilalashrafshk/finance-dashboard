// Inverse Risk-to-Price Calculation
// Finds ETH/USD price that achieves a target Risk_eq at a future date

import type { WeeklyData, FairValueBands, BandParams } from "./fair-value-bands"
import { calculateFairValueBands } from "./fair-value-bands"
import { linearRegression, percentile } from "./helpers"
import { detectPeaks, detectTroughs, getTopExtremes } from "./peak-trough-detection"
import type { RiskWeights } from "./risk-metrics"

export interface InverseRiskCalculationParams {
  targetRiskEq: number // Target Risk_eq value (e.g., 0.8, 0.9, 1.0)
  futureDate: Date // Future date to calculate for
  targetBtcPrice: number // Target BTC price at future date
  historicalWeeklyData: WeeklyData[] // Historical data up to today
  bandParams: BandParams // Fair value band parameters
  sValCutoffDate: Date | null // S_val cutoff date (from config)
  riskWeights: RiskWeights // Risk weights (default: 50/50)
}

export interface InverseRiskResult {
  ethUsdPrice: number // ETH/USD price that achieves target Risk_eq
  sVal: number // S_val at that price
  sRel: number // S_rel at that price
  riskEq: number // Actual Risk_eq (should match target)
  fairValue: number // Fair value at future date
  ethBtcRatio: number // ETH/BTC ratio at that price
}

/**
 * Calculate percentile rank of a value within a sorted array
 * Returns value in [0, 1] range using linear interpolation
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
  const lowerRank = (lowerIdx + 1) / n
  const upperRank = (upperIdx + 1) / n

  return lowerRank + fraction * (upperRank - lowerRank)
}

/**
 * Calculate S_rel for a single hypothetical ETH/BTC ratio at a future date
 * Uses trendlines calculated from historical data up to today, extrapolated to future date
 */
function calculateSRelForFutureDate(
  historicalWeeklyData: WeeklyData[],
  futureDate: Date,
  hypotheticalEthBtcRatio: number,
): number {
  if (historicalWeeklyData.length === 0) return 0.5

  // Convert historical ETH/BTC to log space
  const r = historicalWeeklyData.map((week) => Math.log(week.ethBtcClose)).filter((v) => !isNaN(v) && isFinite(v))
  const tYears = historicalWeeklyData.map((_, i) => {
    const diffMs = historicalWeeklyData[i].date.getTime() - historicalWeeklyData[0].date.getTime()
    return diffMs / (365.25 * 24 * 60 * 60 * 1000)
  })

  // Find peaks and troughs in historical data
  const peaks = detectPeaks(r)
  const troughs = detectTroughs(r)

  // Get top extremes
  const nExtremes = Math.min(5, Math.max(3, Math.floor(peaks.length / 3)))
  const { topPeaks, bottomTroughs } = getTopExtremes(peaks, troughs, r, nExtremes)

  if (topPeaks.length < 2 || bottomTroughs.length < 2) {
    return 0.5 // Default if not enough extremes
  }

  const peakTimes = topPeaks.map((p) => tYears[p.index])
  const troughTimes = bottomTroughs.map((t) => tYears[t.index])

  // Fit trendlines in LOG space using historical data
  const cuLog = linearRegression(
    peakTimes,
    topPeaks.map((p) => p.value),
  )
  const clLog = linearRegression(
    troughTimes,
    bottomTroughs.map((t) => t.value),
  )

  // Calculate time in years for future date (relative to first historical date)
  const futureTimeYears =
    (futureDate.getTime() - historicalWeeklyData[0].date.getTime()) / (365.25 * 24 * 60 * 60 * 1000)

  // Extrapolate trendlines to future date
  const upperHatLog = cuLog.slope * futureTimeYears + cuLog.intercept
  const lowerHatLog = clLog.slope * futureTimeYears + clLog.intercept

  const gap = upperHatLog - lowerHatLog
  const rDiff = r.slice(1).map((val, i) => Math.abs(val - r[i]))
  const minGap = rDiff.length > 0 ? percentile(rDiff, 95) * 0.1 : 0.1

  const adjustedGap = Math.max(gap, minGap)

  // Calculate S_rel for hypothetical ETH/BTC ratio
  const logEthBtc = Math.log(hypotheticalEthBtcRatio)
  const relPos = (logEthBtc - lowerHatLog) / adjustedGap
  return Math.max(0, Math.min(1, relPos))
}

/**
 * Calculate S_val for a single hypothetical ETH/USD price at a future date
 * Uses historical z-score distribution (up to cutoff date) for percentile mapping
 */
function calculateSValForFutureDate(
  historicalWeeklyData: WeeklyData[],
  bandParams: BandParams,
  sValCutoffDate: Date | null,
  futureDate: Date,
  hypotheticalEthUsdPrice: number,
): number {
  // Calculate fair value bands for historical data
  const historicalBands = calculateFairValueBands(historicalWeeklyData, bandParams)

  // Calculate fair value at future date
  const startTs = new Date(bandParams.startYear, bandParams.startMonth - 1, bandParams.startDay)
  const diffMs = futureDate.getTime() - startTs.getTime()
  const years = Math.max(0.01, diffMs / (365.25 * 24 * 60 * 60 * 1000))

  const lnReg = Math.log(bandParams.basePrice) + bandParams.baseCoeff + bandParams.growthCoeff * Math.log(years)
  const regPrice = Math.exp(lnReg)
  const futureFairValue = regPrice * bandParams.mainMult + bandParams.offset

  // Calculate z-score for hypothetical price
  const logPrice = Math.log(hypotheticalEthUsdPrice)
  const logFair = Math.log(futureFairValue)
  const residual = logPrice - logFair
  const zScore = residual / historicalBands.sigma

  // Calculate S_val using historical z-score distribution
  const logPriceHistorical = historicalWeeklyData.map((week) => Math.log(week.ethUsdClose))
  const logFairHistorical = historicalBands.fair.map((fair) => Math.log(fair))
  const residHistorical = logPriceHistorical.map((lp, i) => lp - logFairHistorical[i])
  const zValHistorical = residHistorical.map((r) => r / historicalBands.sigma)

  // Filter z-scores up to cutoff date
  let referenceZVal: number[]
  if (sValCutoffDate) {
    referenceZVal = zValHistorical.filter((z, i) => {
      const date = historicalWeeklyData[i].date
      return date <= sValCutoffDate && !isNaN(z) && isFinite(z)
    })
  } else {
    referenceZVal = zValHistorical.filter((z) => !isNaN(z) && isFinite(z))
  }

  if (referenceZVal.length === 0) {
    return 0.5 // Default if no valid data
  }

  // Calculate percentile rank
  const sortedZVal = [...referenceZVal].sort((a, b) => a - b)
  return percentileRank(zScore, sortedZVal)
}

/**
 * Calculate Risk_eq for a hypothetical ETH/USD price at a future date
 */
function calculateRiskEqForPrice(
  params: InverseRiskCalculationParams,
  hypotheticalEthUsdPrice: number,
): { sVal: number; sRel: number; riskEq: number } {
  // Guard against invalid inputs
  if (!params.targetBtcPrice || params.targetBtcPrice <= 0) {
    return { sVal: 0.5, sRel: 0.5, riskEq: 0.5 }
  }

  // Calculate ETH/BTC ratio
  const ethBtcRatio = hypotheticalEthUsdPrice / params.targetBtcPrice

  // Calculate S_val
  const sVal = calculateSValForFutureDate(
    params.historicalWeeklyData,
    params.bandParams,
    params.sValCutoffDate,
    params.futureDate,
    hypotheticalEthUsdPrice,
  )

  // Calculate S_rel
  const sRel = calculateSRelForFutureDate(
    params.historicalWeeklyData,
    params.futureDate,
    ethBtcRatio,
  )

  // Calculate Risk_eq
  const totalWeight = params.riskWeights.sValWeight + params.riskWeights.sRelWeight
  const normalizedSValWeight = params.riskWeights.sValWeight / totalWeight
  const normalizedSRelWeight = params.riskWeights.sRelWeight / totalWeight
  const riskEq = normalizedSValWeight * sVal + normalizedSRelWeight * sRel

  return { sVal, sRel, riskEq }
}

/**
 * Find ETH/USD price that achieves target Risk_eq using binary search
 */
export function calculateInverseRiskToPrice(params: InverseRiskCalculationParams): InverseRiskResult | null {
  // Calculate fair value at future date for reference
  const startTs = new Date(params.bandParams.startYear, params.bandParams.startMonth - 1, params.bandParams.startDay)
  const diffMs = params.futureDate.getTime() - startTs.getTime()
  const years = Math.max(0.01, diffMs / (365.25 * 24 * 60 * 60 * 1000))
  const lnReg = Math.log(params.bandParams.basePrice) + params.bandParams.baseCoeff + params.bandParams.growthCoeff * Math.log(years)
  const regPrice = Math.exp(lnReg)
  const futureFairValue = regPrice * params.bandParams.mainMult + params.bandParams.offset

  // Get historical bands for sigma
  const historicalBands = calculateFairValueBands(params.historicalWeeklyData, params.bandParams)

  // Binary search bounds - use fair value ± 5 sigma as reasonable bounds
  let minPrice = futureFairValue * Math.exp(-5 * historicalBands.sigma)
  let maxPrice = futureFairValue * Math.exp(5 * historicalBands.sigma)

  // Ensure positive prices
  minPrice = Math.max(0.01, minPrice)
  maxPrice = Math.max(minPrice * 2, maxPrice)

  const tolerance = 0.001 // Risk_eq tolerance
  const maxIterations = 100

  for (let i = 0; i < maxIterations; i++) {
    const midPrice = (minPrice + maxPrice) / 2
    const { riskEq } = calculateRiskEqForPrice(params, midPrice)

    const error = Math.abs(riskEq - params.targetRiskEq)

    if (error < tolerance) {
      // Found solution
      const { sVal, sRel } = calculateRiskEqForPrice(params, midPrice)
      const ethBtcRatio = midPrice / params.targetBtcPrice

      return {
        ethUsdPrice: midPrice,
        sVal,
        sRel,
        riskEq,
        fairValue: futureFairValue,
        ethBtcRatio,
      }
    }

    // Adjust search bounds
    if (riskEq < params.targetRiskEq) {
      minPrice = midPrice
    } else {
      maxPrice = midPrice
    }

    // Check if bounds are too close (convergence)
    if (maxPrice - minPrice < 0.01) {
      break
    }
  }

  // If we didn't converge, return the best estimate
  const bestPrice = (minPrice + maxPrice) / 2
  const { sVal, sRel, riskEq } = calculateRiskEqForPrice(params, bestPrice)
  const ethBtcRatio = bestPrice / params.targetBtcPrice

  return {
    ethUsdPrice: bestPrice,
    sVal,
    sRel,
    riskEq,
    fairValue: futureFairValue,
    ethBtcRatio,
  }
}
