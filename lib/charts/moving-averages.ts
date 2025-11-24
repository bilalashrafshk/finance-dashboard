/**
 * Moving Average Calculations and Data Resampling Utilities
 * Uses technicalindicators library for optimized calculations
 */

import { SMA, EMA } from 'technicalindicators'

export interface PriceDataPoint {
  date: string
  close: number
  open?: number
  high?: number
  low?: number
  volume?: number
}

export type Frequency = 'daily' | 'weekly' | 'monthly'
export type MovingAverageType = 'SMA' | 'EMA'

/**
 * Resample price data to a different frequency
 */
export function resampleData(
  data: PriceDataPoint[],
  frequency: Frequency
): PriceDataPoint[] {
  if (frequency === 'daily') {
    return data
  }

  const resampled: PriceDataPoint[] = []
  const dateMap = new Map<string, PriceDataPoint[]>()

  // Group data by frequency period
  data.forEach((point) => {
    const date = new Date(point.date)
    let key: string

    if (frequency === 'weekly') {
      // Get the Sunday that ends this week (pandas 'W-SUN' logic)
      const weekEndSunday = getWeekEndSunday(date)
      key = weekEndSunday.toISOString().split('T')[0]
    } else if (frequency === 'monthly') {
      // Use first day of month as key
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
    } else {
      key = point.date
    }

    if (!dateMap.has(key)) {
      dateMap.set(key, [])
    }
    dateMap.get(key)!.push(point)
  })

  // For each period, use the last (most recent) data point
  const sortedKeys = Array.from(dateMap.keys()).sort()
  sortedKeys.forEach((key) => {
    const points = dateMap.get(key)!
    // Sort by date and take the last one
    points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const lastPoint = points[points.length - 1]
    resampled.push({
      date: lastPoint.date, // Use the actual date, not the key
      close: lastPoint.close,
      open: points[0].open ?? lastPoint.open,
      high: Math.max(...points.map(p => p.high ?? p.close)),
      low: Math.min(...points.map(p => p.low ?? p.close)),
      volume: points.reduce((sum, p) => sum + (p.volume ?? 0), 0),
    })
  })

  return resampled
}

/**
 * Get the Sunday that ends the week for a given date (pandas 'W-SUN' logic)
 */
function getWeekEndSunday(date: Date): Date {
  const day = date.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysToAdd = day === 0 ? 0 : 7 - day // Days to add to get to next Sunday
  const sunday = new Date(date)
  sunday.setDate(date.getDate() + daysToAdd)
  return sunday
}

/**
 * Calculate Simple Moving Average (SMA) using optimized library
 */
export function calculateSMA(
  data: PriceDataPoint[],
  period: number
): number[] {
  if (period <= 0 || period > data.length || data.length === 0) {
    return new Array(data.length).fill(NaN)
  }

  // Extract close prices as array
  const closes = data.map(d => d.close)
  
  // Use technicalindicators library for optimized calculation
  const smaValues = SMA.calculate({ values: closes, period })
  
  // Pad with NaN for initial values
  const padding = data.length - smaValues.length
  return [...new Array(padding).fill(NaN), ...smaValues]
}

/**
 * Calculate Exponential Moving Average (EMA) using optimized library
 */
export function calculateEMA(
  data: PriceDataPoint[],
  period: number
): number[] {
  if (period <= 0 || period > data.length || data.length === 0) {
    return new Array(data.length).fill(NaN)
  }

  // Extract close prices as array
  const closes = data.map(d => d.close)
  
  // Use technicalindicators library for optimized calculation
  const emaValues = EMA.calculate({ values: closes, period })
  
  // Pad with NaN for initial values
  const padding = data.length - emaValues.length
  return [...new Array(padding).fill(NaN), ...emaValues]
}

/**
 * Parse moving average period string (e.g., "20d", "50w", "200d")
 * More forgiving - trims whitespace and handles case insensitivity
 */
export function parseMAPeriod(
  periodStr: string
): { length: number; periodType: Frequency } {
  // Trim whitespace and convert to lowercase for easier matching
  const trimmed = periodStr.trim().toLowerCase()
  
  // Match pattern: digits followed by d, w, or m
  const match = trimmed.match(/^(\d+)([dwm])$/)
  if (!match) {
    throw new Error(`Invalid period format: "${periodStr}". Expected format: e.g., "20d", "50w", "200d" (number followed by d/w/m)`)
  }

  const length = parseInt(match[1], 10)
  
  // Validate length
  if (isNaN(length) || length <= 0 || length > 10000) {
    throw new Error(`Invalid period length: ${length}. Must be between 1 and 10000`)
  }

  const typeChar = match[2]

  let periodType: Frequency
  if (typeChar === 'd') {
    periodType = 'daily'
  } else if (typeChar === 'w') {
    periodType = 'weekly'
  } else if (typeChar === 'm') {
    periodType = 'monthly'
  } else {
    throw new Error(`Invalid period type: "${typeChar}". Expected 'd' (daily), 'w' (weekly), or 'm' (monthly)`)
  }

  return { length, periodType }
}

/**
 * Calculate moving average based on type and period
 */
export function calculateMovingAverage(
  data: PriceDataPoint[],
  type: MovingAverageType,
  period: number
): number[] {
  if (type === 'SMA') {
    return calculateSMA(data, period)
  } else {
    return calculateEMA(data, period)
  }
}

/**
 * Convert period type to display string
 */
export function periodTypeToDisplay(periodType: Frequency): string {
  switch (periodType) {
    case 'daily':
      return 'Daily'
    case 'weekly':
      return 'Weekly'
    case 'monthly':
      return 'Monthly'
  }
}

/**
 * Generate period string from length and type
 */
export function generatePeriodString(length: number, periodType: Frequency): string {
  const suffix = periodType === 'daily' ? 'd' : periodType === 'weekly' ? 'w' : 'm'
  return `${length}${suffix}`
}

