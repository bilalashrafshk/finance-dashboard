/**
 * Helper functions for time frame filtering
 */

export type ChartPeriod = '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | 'ALL' | 'CUSTOM'

export interface DateRange {
  startDate: string | null
  endDate: string | null
}

/**
 * Get cutoff date for a given period
 */
export function getPeriodCutoffDate(period: ChartPeriod): Date | null {
  if (period === 'ALL' || period === 'CUSTOM') {
    return null
  }

  const now = new Date()
  const cutoff = new Date()

  switch (period) {
    case '1M':
      cutoff.setMonth(now.getMonth() - 1)
      break
    case '3M':
      cutoff.setMonth(now.getMonth() - 3)
      break
    case '6M':
      cutoff.setMonth(now.getMonth() - 6)
      break
    case '1Y':
      cutoff.setFullYear(now.getFullYear() - 1)
      break
    case '2Y':
      cutoff.setFullYear(now.getFullYear() - 2)
      break
    case '5Y':
      cutoff.setFullYear(now.getFullYear() - 5)
      break
  }

  return cutoff
}

/**
 * Filter data by time period or custom date range
 */
export function filterDataByTimeFrame<T extends { date: string }>(
  data: T[],
  period: ChartPeriod,
  customRange?: DateRange
): T[] {
  if (period === 'ALL') {
    return data
  }

  if (period === 'CUSTOM' && customRange) {
    const startDate = customRange.startDate ? new Date(customRange.startDate) : null
    const endDate = customRange.endDate ? new Date(customRange.endDate) : null

    return data.filter(item => {
      const itemDate = new Date(item.date)
      if (startDate && itemDate < startDate) return false
      if (endDate && itemDate > endDate) return false
      return true
    })
  }

  const cutoffDate = getPeriodCutoffDate(period)
  if (!cutoffDate) {
    return data
  }

  return data.filter(item => {
    const itemDate = new Date(item.date)
    return itemDate >= cutoffDate
  })
}

/**
 * Get default period based on data frequency and range
 * - Daily data: default to 1Y
 * - Weekly data: default to 1Y
 * - Monthly data: default to 5Y
 * - Annual data: default to ALL
 */
export function getDefaultPeriod(dataFrequency?: 'daily' | 'weekly' | 'monthly' | 'annual'): ChartPeriod {
  switch (dataFrequency) {
    case 'daily':
    case 'weekly':
      return '1Y'
    case 'monthly':
      return '5Y'
    case 'annual':
      return 'ALL'
    default:
      return '5Y'
  }
}

