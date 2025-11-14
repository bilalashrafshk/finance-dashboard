/**
 * Utility to convert database records to chart component formats
 */

import type { HistoricalPriceRecord } from './db-client'
import type { StockAnalysisDataPoint } from './stockanalysis-api'
import type { BinanceHistoricalDataPoint } from './binance-historical-api'
import type { InvestingHistoricalDataPoint } from './investing-client-api'

/**
 * Convert database record to StockAnalysis format (for PK/US equities charts)
 */
export function dbRecordToStockAnalysis(record: HistoricalPriceRecord): StockAnalysisDataPoint {
  return {
    t: record.date, // Date
    o: record.open || 0, // Open
    h: record.high || 0, // High
    l: record.low || 0, // Low
    c: record.close, // Close
    v: record.volume || 0, // Volume
    a: record.adjusted_close || null, // Adjusted close
    ch: record.change_pct || null, // Change %
  }
}

/**
 * Convert database record to Binance format (for crypto charts)
 */
export function dbRecordToBinance(record: HistoricalPriceRecord): BinanceHistoricalDataPoint {
  return {
    date: record.date,
    open: record.open || 0,
    high: record.high || 0,
    low: record.low || 0,
    close: record.close,
    volume: record.volume || 0,
  }
}

/**
 * Convert database record to Investing format (for indices charts)
 */
export function dbRecordToInvesting(record: HistoricalPriceRecord): InvestingHistoricalDataPoint {
  return {
    date: record.date,
    open: record.open || 0,
    high: record.high || 0,
    low: record.low || 0,
    close: record.close,
    volume: record.volume,
  }
}

