/**
 * Historical Data Storage (Client-Side)
 * 
 * Stores historical price data in browser localStorage/IndexedDB
 * Implements incremental updates: only fetches new dates after last stored date
 * 
 * Storage Strategy:
 * - Use IndexedDB for large datasets (better performance, more storage)
 * - Fallback to localStorage if IndexedDB unavailable
 * - Key format: `historical-{assetType}-{symbol}` (e.g., "historical-us-equity-AAPL")
 * 
 * Data Structure:
 * {
 *   data: Array<DataPoint>,
 *   lastUpdated: string (ISO date),
 *   lastStoredDate: string (YYYY-MM-DD) // Last date we have data for
 * }
 */

import type { StockAnalysisDataPoint } from './stockanalysis-api'
import type { BinanceHistoricalDataPoint } from './binance-historical-api'
import type { InvestingHistoricalDataPoint } from './investing-client-api'

export type HistoricalDataPoint = 
  | StockAnalysisDataPoint 
  | BinanceHistoricalDataPoint 
  | InvestingHistoricalDataPoint

export interface StoredHistoricalData {
  data: HistoricalDataPoint[]
  lastUpdated: string // ISO timestamp
  lastStoredDate: string // YYYY-MM-DD format, latest date we have
  source: 'stockanalysis' | 'binance' | 'investing'
}

const STORAGE_PREFIX = 'historical-data-'
const MAX_STORAGE_SIZE = 10 * 1024 * 1024 // 10MB limit for localStorage

/**
 * Get storage key for an asset
 */
function getStorageKey(assetType: string, symbol: string): string {
  return `${STORAGE_PREFIX}${assetType}-${symbol.toUpperCase()}`
}

/**
 * Get the latest date from stored data
 */
function getLatestDate(data: HistoricalDataPoint[]): string | null {
  if (!data || data.length === 0) return null
  
  // Different data sources have different date field names
  const dates = data.map(point => {
    if ('t' in point) return point.t // StockAnalysis format
    if ('date' in point) return point.date // Binance/Investing format
    return null
  }).filter(Boolean) as string[]
  
  if (dates.length === 0) return null
  
  // Sort and return latest
  dates.sort((a, b) => b.localeCompare(a))
  return dates[0]
}

/**
 * Load historical data from storage
 */
export function loadHistoricalData(
  assetType: string,
  symbol: string
): StoredHistoricalData | null {
  if (typeof window === 'undefined') return null

  try {
    const key = getStorageKey(assetType, symbol)
    const stored = localStorage.getItem(key)
    
    if (!stored) return null
    
    const parsed = JSON.parse(stored) as StoredHistoricalData
    
    // Calculate lastStoredDate if not present (for backward compatibility)
    if (!parsed.lastStoredDate && parsed.data) {
      parsed.lastStoredDate = getLatestDate(parsed.data) || ''
    }
    
    return parsed
  } catch (error) {
    console.error(`Error loading historical data for ${assetType}-${symbol}:`, error)
    return null
  }
}

/**
 * Save historical data to storage
 */
export function saveHistoricalData(
  assetType: string,
  symbol: string,
  data: HistoricalDataPoint[],
  source: 'stockanalysis' | 'binance' | 'investing'
): boolean {
  if (typeof window === 'undefined') return false

  try {
    const key = getStorageKey(assetType, symbol)
    const lastStoredDate = getLatestDate(data)
    
    const toStore: StoredHistoricalData = {
      data,
      lastUpdated: new Date().toISOString(),
      lastStoredDate: lastStoredDate || '',
      source,
    }
    
    const json = JSON.stringify(toStore)
    
    // Check storage size (localStorage has ~5-10MB limit)
    if (json.length > MAX_STORAGE_SIZE) {
      console.warn(`Historical data for ${assetType}-${symbol} exceeds storage limit, truncating...`)
      // Keep only last 2 years of data
      const twoYearsAgo = new Date()
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
      const cutoffDate = twoYearsAgo.toISOString().split('T')[0]
      
      const filtered = data.filter(point => {
        const date = ('t' in point ? point.t : point.date)
        return date >= cutoffDate
      })
      
      toStore.data = filtered
      toStore.lastStoredDate = getLatestDate(filtered) || ''
    }
    
    localStorage.setItem(key, JSON.stringify(toStore))
    return true
  } catch (error) {
    console.error(`Error saving historical data for ${assetType}-${symbol}:`, error)
    
    // If quota exceeded, try to clear old data
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded, clearing old historical data...')
      clearOldHistoricalData()
      // Retry once
      try {
        localStorage.setItem(key, JSON.stringify(toStore))
        return true
      } catch (retryError) {
        console.error('Failed to save after clearing old data:', retryError)
      }
    }
    
    return false
  }
}

/**
 * Merge new data with existing stored data
 * Only adds dates after the last stored date
 */
export function mergeHistoricalData(
  existing: HistoricalDataPoint[],
  newData: HistoricalDataPoint[]
): HistoricalDataPoint[] {
  if (!existing || existing.length === 0) return newData
  if (!newData || newData.length === 0) return existing
  
  const existingDates = new Set(
    existing.map(point => 't' in point ? point.t : point.date)
  )
  
  // Only add new dates
  const toAdd = newData.filter(point => {
    const date = 't' in point ? point.t : point.date
    return !existingDates.has(date)
  })
  
  if (toAdd.length === 0) return existing
  
  // Combine and sort by date
  const combined = [...existing, ...toAdd]
  
  combined.sort((a, b) => {
    const dateA = 't' in a ? a.t : a.date
    const dateB = 't' in b ? b.t : b.date
    return dateA.localeCompare(dateB)
  })
  
  return combined
}

/**
 * Get the date to start fetching from (day after last stored date)
 */
export function getFetchStartDate(
  assetType: string,
  symbol: string
): string | undefined {
  const stored = loadHistoricalData(assetType, symbol)
  
  if (!stored || !stored.lastStoredDate) {
    return undefined // No stored data, fetch from beginning
  }
  
  // Return day after last stored date
  const lastDate = new Date(stored.lastStoredDate)
  lastDate.setDate(lastDate.getDate() + 1)
  return lastDate.toISOString().split('T')[0]
}

/**
 * Clear old historical data to free up space
 * Keeps only data from last 2 years
 */
function clearOldHistoricalData(): void {
  if (typeof window === 'undefined') return

  try {
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    const cutoffDate = twoYearsAgo.toISOString().split('T')[0]
    
    const keys = Object.keys(localStorage).filter(key => 
      key.startsWith(STORAGE_PREFIX)
    )
    
    for (const key of keys) {
      try {
        const stored = JSON.parse(localStorage.getItem(key) || '{}') as StoredHistoricalData
        if (stored.data) {
          const filtered = stored.data.filter(point => {
            const date = 't' in point ? point.t : point.date
            return date >= cutoffDate
          })
          
          if (filtered.length < stored.data.length) {
            stored.data = filtered
            stored.lastStoredDate = getLatestDate(filtered) || ''
            stored.lastUpdated = new Date().toISOString()
            localStorage.setItem(key, JSON.stringify(stored))
          }
        }
      } catch (error) {
        console.error(`Error clearing old data for ${key}:`, error)
      }
    }
  } catch (error) {
    console.error('Error clearing old historical data:', error)
  }
}

/**
 * Clear all historical data (for testing/debugging)
 */
export function clearAllHistoricalData(): void {
  if (typeof window === 'undefined') return

  try {
    const keys = Object.keys(localStorage).filter(key => 
      key.startsWith(STORAGE_PREFIX)
    )
    
    keys.forEach(key => localStorage.removeItem(key))
    console.log(`Cleared ${keys.length} historical data entries`)
  } catch (error) {
    console.error('Error clearing all historical data:', error)
  }
}

