// S_rel Calculation Algorithm (ETH/BTC trendline-based relative metric)

import { linearRegression, percentile } from "./helpers"
import { detectPeaks, detectTroughs, getTopExtremes } from "./peak-trough-detection"
import type { WeeklyData } from "./fair-value-bands"

/**
 * Calculate S_rel (relative metric) based on ETH/BTC trendlines
 * Uses peak/trough detection and linear regression to create upper/lower trendlines
 */
export function calculateSRel(weeklyData: WeeklyData[]): number[] {
  // Convert to log space for peak/trough detection
  const r = weeklyData.map((week) => Math.log(week.ethBtcClose)).filter((v) => !isNaN(v) && isFinite(v))
  const tYears = weeklyData.map((_, i) => {
    const diffMs = weeklyData[i].date.getTime() - weeklyData[0].date.getTime()
    return diffMs / (365.25 * 24 * 60 * 60 * 1000)
  })

  // Find peaks and troughs
  const peaks = detectPeaks(r)
  const troughs = detectTroughs(r)

  // Get top extremes
  const nExtremes = Math.min(5, Math.max(3, Math.floor(peaks.length / 3)))
  const { topPeaks, bottomTroughs } = getTopExtremes(peaks, troughs, r, nExtremes)

  let sRel = new Array(weeklyData.length).fill(0.5) // default middle

  if (topPeaks.length >= 2 && bottomTroughs.length >= 2) {
    const peakTimes = topPeaks.map((p) => tYears[p.index])
    const troughTimes = bottomTroughs.map((t) => tYears[t.index])

    // Fit trendlines in LOG space
    const cuLog = linearRegression(
      peakTimes,
      topPeaks.map((p) => p.value),
    )
    const clLog = linearRegression(
      troughTimes,
      bottomTroughs.map((t) => t.value),
    )

    // Calculate trendlines
    const upperHatLog = tYears.map((t) => cuLog.slope * t + cuLog.intercept)
    const lowerHatLog = tYears.map((t) => clLog.slope * t + clLog.intercept)

    const gap = upperHatLog.map((upper, i) => upper - lowerHatLog[i])
    const rDiff = r.slice(1).map((val, i) => Math.abs(val - r[i]))
    const minGap = rDiff.length > 0 ? percentile(rDiff, 95) * 0.1 : 0.1

    const adjustedGap = gap.map((g) => Math.max(g, minGap))
    const adjustedUpper = lowerHatLog.map((lower, i) => lower + adjustedGap[i])

    // Calculate relative position
    sRel = r.map((logPrice, i) => {
      const relPos = (logPrice - lowerHatLog[i]) / adjustedGap[i]
      return Math.max(0, Math.min(1, relPos))
    })
  }

  return sRel
}






