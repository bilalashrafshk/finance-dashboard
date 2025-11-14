/**
 * Crypto Gain Calculations
 * Calculates gains for cryptocurrencies using historical data from Binance
 */

import type { Holding } from './types'
import type { BinanceHistoricalDataPoint } from './binance-historical-api'

export type GainPeriod = 'purchase' | 'daily' | 'ytd' | '365d'

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
export async function calculateCryptoGain(
  holding: Holding,
  period: GainPeriod
): Promise<GainCalculation | null> {
  if (holding.assetType !== 'crypto') {
    return null
  }

  try {
    // Normalize symbol for Binance (e.g., BTC -> BTCUSDT)
    const symbol = holding.symbol.toUpperCase().replace(/[-_/]/g, '')
    const binanceSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`
    
    // Fetch historical data from database (with incremental updates)
    // Use deduplicated fetch to avoid duplicate calls from multiple components
    const { deduplicatedFetch } = await import('./request-deduplication')
    const response = await deduplicatedFetch(`/api/historical-data?assetType=crypto&symbol=${encodeURIComponent(binanceSymbol)}`)
    
    if (!response.ok) {
      return null
    }
    
    const apiData = await response.json()
    const dbRecords = apiData.data || []
    
    // Convert database records to Binance format
    const { dbRecordToBinance } = await import('./db-to-chart-format')
    const historicalData: BinanceHistoricalDataPoint[] = dbRecords.map(dbRecordToBinance)
    
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
        
        // Find yesterday's data (data is sorted oldest first)
        const yesterdayStr = yesterday.toISOString().split('T')[0]
        const yesterdayData = historicalData.find(d => d.date === yesterdayStr)
        if (yesterdayData) {
          periodStartPrice = yesterdayData.close
        } else if (historicalData.length > 1) {
          // Use second to last (skip today if it exists)
          periodStartPrice = historicalData[historicalData.length - 2]?.close || historicalData[historicalData.length - 1]?.close || null
        }
        break
      }

      case 'ytd': {
        // January 1st of current year
        periodStartDate = new Date(today.getFullYear(), 0, 1)
        const ytdStr = periodStartDate.toISOString().split('T')[0]
        
        // Find closest data point to YTD (data is sorted oldest first)
        const sortedByDate = [...historicalData].sort((a, b) => a.date.localeCompare(b.date))
        const ytdData = sortedByDate.find(d => d.date >= ytdStr) || sortedByDate[0]
        if (ytdData) {
          periodStartPrice = ytdData.close
        }
        break
      }

      case '365d': {
        // 365 days ago
        periodStartDate = new Date(today)
        periodStartDate.setDate(periodStartDate.getDate() - 365)
        const yearAgoStr = periodStartDate.toISOString().split('T')[0]
        
        // Find closest data point to 365 days ago
        const sortedByDate = [...historicalData].sort((a, b) => a.date.localeCompare(b.date))
        const yearAgoData = sortedByDate.find(d => d.date >= yearAgoStr) || sortedByDate[0]
        if (yearAgoData) {
          periodStartPrice = yearAgoData.close
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

