/**
 * PK Equity Gain Calculations
 * Calculates gains for PK equities using historical data from StockAnalysis.com
 */

import type { Holding } from './types'
import type { StockAnalysisDataPoint } from './stockanalysis-api'

export type GainPeriod = 'daily' | 'ytd' | '365d' | 'purchase'

export interface GainCalculation {
  gain: number
  gainPercent: number
  periodStartPrice: number
  periodStartDate: string
  currentPrice: number
  currentDate: string
}

/**
 * Calculate gain for a specific period
 */
export async function calculatePKEquityGain(
  holding: Holding,
  period: GainPeriod
): Promise<GainCalculation | null> {
  if (holding.assetType !== 'pk-equity') {
    return null
  }

  try {
    // Fetch historical data from database (with incremental updates)
    // Use deduplicated fetch to avoid duplicate calls from multiple components
    const { deduplicatedFetch } = await import('./request-deduplication')
    const response = await deduplicatedFetch(`/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(holding.symbol)}&market=PSX`)
    
    if (!response.ok) {
      return null
    }
    
    const apiData = await response.json()
    const dbRecords = apiData.data || []
    
    // Convert database records to StockAnalysis format
    const { dbRecordToStockAnalysis } = await import('./db-to-chart-format')
    const historicalData: StockAnalysisDataPoint[] = dbRecords.map(dbRecordToStockAnalysis)
    
    if (!historicalData || historicalData.length === 0) {
      return null
    }

    const today = new Date()
    const currentPrice = holding.currentPrice
    const currentDate = today.toISOString().split('T')[0]

    let periodStartDate: Date
    let periodStartPrice: number | null = null

    switch (period) {
      case 'daily': {
        // Yesterday's close price
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        periodStartDate = yesterday
        
        // Find yesterday's data (data is sorted most recent first)
        const yesterdayStr = yesterday.toISOString().split('T')[0]
        const yesterdayData = historicalData.find(d => d.t === yesterdayStr)
        if (yesterdayData) {
          periodStartPrice = yesterdayData.c
        } else {
          // If yesterday not found, try day before or use first available
          const dayBefore = new Date(yesterday)
          dayBefore.setDate(dayBefore.getDate() - 1)
          const dayBeforeStr = dayBefore.toISOString().split('T')[0]
          const dayBeforeData = historicalData.find(d => d.t === dayBeforeStr)
          if (dayBeforeData) {
            periodStartPrice = dayBeforeData.c
          } else if (historicalData.length > 1) {
            // Use second most recent (skip today if it exists)
            periodStartPrice = historicalData[1]?.c || historicalData[0]?.c || null
          }
        }
        break
      }

      case 'ytd': {
        // January 1st of current year
        periodStartDate = new Date(today.getFullYear(), 0, 1)
        const ytdStr = periodStartDate.toISOString().split('T')[0]
        
        // Find closest data point to YTD (data is sorted most recent first, so find first <= ytdStr)
        // Since data is most recent first, we need to find the oldest data point >= ytdStr
        const sortedByDate = [...historicalData].sort((a, b) => a.t.localeCompare(b.t))
        const ytdData = sortedByDate.find(d => d.t >= ytdStr) || sortedByDate[sortedByDate.length - 1]
        if (ytdData) {
          periodStartPrice = ytdData.c
        }
        break
      }

      case '365d': {
        // 365 days ago
        periodStartDate = new Date(today)
        periodStartDate.setDate(periodStartDate.getDate() - 365)
        const yearAgoStr = periodStartDate.toISOString().split('T')[0]
        
        // Find closest data point to 365 days ago
        const sortedByDate = [...historicalData].sort((a, b) => a.t.localeCompare(b.t))
        const yearAgoData = sortedByDate.find(d => d.t >= yearAgoStr) || sortedByDate[sortedByDate.length - 1]
        if (yearAgoData) {
          periodStartPrice = yearAgoData.c
        }
        break
      }

      case 'purchase': {
        // Use purchase date and price
        periodStartDate = new Date(holding.purchaseDate)
        periodStartPrice = holding.purchasePrice
        break
      }

      default:
        return null
    }

    if (periodStartPrice === null || periodStartPrice === 0) {
      return null
    }

    const gain = currentPrice - periodStartPrice
    const gainPercent = ((currentPrice - periodStartPrice) / periodStartPrice) * 100

    return {
      gain,
      gainPercent,
      periodStartPrice,
      periodStartDate: periodStartDate.toISOString().split('T')[0],
      currentPrice,
      currentDate,
    }
  } catch (error) {
    console.error(`Error calculating gain for ${holding.symbol}:`, error)
    return null
  }
}

/**
 * Get gain period label
 */
export function getGainPeriodLabel(period: GainPeriod): string {
  switch (period) {
    case 'daily':
      return 'Daily'
    case 'ytd':
      return 'YTD'
    case '365d':
      return '365 Days'
    case 'purchase':
      return 'Since Purchase'
    default:
      return 'Unknown'
  }
}

