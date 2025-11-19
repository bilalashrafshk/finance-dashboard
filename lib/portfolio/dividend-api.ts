/**
 * Dividend API Utility
 * 
 * Fetches dividend data from scstrade.com API
 * Only fetches dividend data, ignores bonus and right shares
 */

import { parseDividendAmount, parseDividendDate, isValidDividendRecord } from './dividend-parser'

export interface DividendRecord {
  date: string // YYYY-MM-DD
  dividend_amount: number // Dividend amount in Rupees
}

export interface ScstradeDividendResponse {
  d: Array<{
    company_code: string
    company_name: string
    sector_name: string
    bm_dividend: string
    bm_bonus: string
    bm_right_per: string
    bm_bc_exp: string
  }>
}

/**
 * Fetch dividend data from scstrade.com API
 * 
 * @param ticker - Stock ticker (e.g., "HBL", "PTC")
 * @param rows - Number of records to fetch (default: 100 for maximum history)
 * @param faceValue - Face value of the stock (default: 10)
 * @returns Array of dividend records or null if error
 */
export async function fetchDividendData(
  ticker: string,
  rows: number = 100,
  faceValue: number = 10
): Promise<DividendRecord[] | null> {
  try {
    const response = await fetch('https://scstrade.com/MarketStatistics/MS_xDates.aspx/chartact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Origin': 'https://scstrade.com',
        'Referer': 'https://scstrade.com/MarketStatistics/MS_xDates.aspx',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        par: ticker.toUpperCase(),
        _search: false,
        nd: Date.now(),
        rows: rows,
        page: 1,
        sidx: '',
        sord: 'asc'
      })
    })

    if (!response.ok) {
      console.error(`[Dividend API] HTTP error for ${ticker}: ${response.status} ${response.statusText}`)
      return null
    }

    const data: ScstradeDividendResponse = await response.json()

    if (!data.d || !Array.isArray(data.d)) {
      console.error(`[Dividend API] Invalid response format for ${ticker}`)
      return null
    }

    // Filter and parse valid dividend records
    const dividendRecords: DividendRecord[] = []

    for (const record of data.d) {
      // Only process records with dividend (ignore bonus and right shares only)
      if (!isValidDividendRecord(record)) {
        continue
      }

      const dividendAmount = parseDividendAmount(record.bm_dividend, faceValue)
      const date = parseDividendDate(record.bm_bc_exp)

      if (dividendAmount !== null && date !== null) {
        dividendRecords.push({
          date,
          dividend_amount: dividendAmount
        })
      }
    }

    // Sort by date ascending (oldest first)
    dividendRecords.sort((a, b) => a.date.localeCompare(b.date))

    return dividendRecords.length > 0 ? dividendRecords : null
  } catch (error: any) {
    console.error(`[Dividend API] Error fetching dividend data for ${ticker}:`, error.message)
    return null
  }
}
