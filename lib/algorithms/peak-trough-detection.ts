// Peak and Trough Detection Algorithm

export interface ExtremePoint {
  index: number
  value: number
}

/**
 * Detect peaks (local maxima) in a time series
 */
export function detectPeaks(values: number[]): ExtremePoint[] {
  const peaks: ExtremePoint[] = []

  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] > values[i - 1] && values[i] > values[i + 1]) {
      peaks.push({ index: i, value: values[i] })
    }
  }

  return peaks
}

/**
 * Detect troughs (local minima) in a time series
 */
export function detectTroughs(values: number[]): ExtremePoint[] {
  const troughs: ExtremePoint[] = []

  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] < values[i - 1] && values[i] < values[i + 1]) {
      troughs.push({ index: i, value: values[i] })
    }
  }

  return troughs
}

/**
 * Get top N extremes from peaks/troughs, ensuring global extremes are included
 */
export function getTopExtremes(
  peaks: ExtremePoint[],
  troughs: ExtremePoint[],
  allValues: number[],
  nExtremes: number = 5,
): { topPeaks: ExtremePoint[]; bottomTroughs: ExtremePoint[] } {
  const n = Math.min(nExtremes, Math.max(3, Math.floor(peaks.length / 3)))
  
  // Sort and get top extremes
  peaks.sort((a, b) => b.value - a.value)
  troughs.sort((a, b) => a.value - b.value)

  const topPeaks = peaks.slice(0, Math.min(n, peaks.length))
  const bottomTroughs = troughs.slice(0, Math.min(n, troughs.length))

  // Ensure global extremes are included
  const globalMaxIdx = allValues.indexOf(Math.max(...allValues))
  const globalMinIdx = allValues.indexOf(Math.min(...allValues))

  if (!topPeaks.some((p) => p.index === globalMaxIdx)) {
    topPeaks.push({ index: globalMaxIdx, value: allValues[globalMaxIdx] })
  }
  if (!bottomTroughs.some((t) => t.index === globalMinIdx)) {
    bottomTroughs.push({ index: globalMinIdx, value: allValues[globalMinIdx] })
  }

  return { topPeaks, bottomTroughs }
}






