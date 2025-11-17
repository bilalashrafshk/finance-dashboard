/**
 * Dividend Parser Utility
 * 
 * Parses dividend percentage strings from scstrade.com API and converts to amount
 * Formula: dividend_amount = percent / 10
 * Example: 110% -> 11.0, 50% -> 5.0, 40.50% -> 4.05
 */

/**
 * Parse dividend percentage string to amount
 * Handles various formats and edge cases:
 * - "50%" -> 5.0
 * - "110%" -> 11.0
 * - "40.50%" -> 4.05
 * - "35%(CY15)" -> 3.5 (strips annotations)
 * - "12.50" -> 1.25 (missing % sign)
 * - "80%%" -> 8.0 (double % sign)
 * 
 * @param dividendStr - Dividend string from API (e.g., "50%", "110%", "35%(CY15)")
 * @returns Dividend amount (percent/10) or null if unparseable
 */
export function parseDividendAmount(dividendStr: string | null | undefined): number | null {
  if (!dividendStr || typeof dividendStr !== 'string') {
    return null
  }

  const trimmed = dividendStr.trim()
  if (trimmed === '') {
    return null
  }

  // Extract numeric value before first % sign or before any non-numeric characters
  // Handles: "50%", "110%", "40.50%", "35%(CY15)", "12.50", "80%%"
  const match = trimmed.match(/^([\d.]+)/)
  if (!match) {
    return null
  }

  const numericValue = parseFloat(match[1])
  if (isNaN(numericValue)) {
    return null
  }

  // Convert percent to amount: percent / 10
  // 110% -> 11.0, 50% -> 5.0, 40.50% -> 4.05
  return numericValue / 10
}

/**
 * Parse date from "DD MMM YYYY" format to "YYYY-MM-DD"
 * Example: "31 Oct 2025" -> "2025-10-31"
 * 
 * @param dateStr - Date string from API
 * @returns ISO date string (YYYY-MM-DD) or null if unparseable
 */
export function parseDividendDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null
  }

  const trimmed = dateStr.trim()
  if (trimmed === '') {
    return null
  }

  const months: Record<string, string> = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  }

  const parts = trimmed.split(' ')
  if (parts.length !== 3) {
    return null
  }

  const [day, month, year] = parts
  const monthNum = months[month]
  
  if (!monthNum) {
    return null
  }

  // Validate day and year
  const dayNum = parseInt(day, 10)
  const yearNum = parseInt(year, 10)
  
  if (isNaN(dayNum) || isNaN(yearNum) || dayNum < 1 || dayNum > 31 || yearNum < 1900 || yearNum > 2100) {
    return null
  }

  return `${year}-${monthNum}-${day.padStart(2, '0')}`
}

/**
 * Check if a dividend record is valid
 * Valid if it has a dividend amount and a date
 * 
 * @param record - Dividend record from API
 * @returns true if valid, false otherwise
 */
export function isValidDividendRecord(record: {
  bm_dividend?: string | null
  bm_bc_exp?: string | null
}): boolean {
  if (!record.bm_dividend || record.bm_dividend.trim() === '') {
    return false
  }

  if (!record.bm_bc_exp || record.bm_bc_exp.trim() === '') {
    return false
  }

  // Check if dividend amount can be parsed
  const amount = parseDividendAmount(record.bm_dividend)
  if (amount === null) {
    return false
  }

  // Check if date can be parsed
  const date = parseDividendDate(record.bm_bc_exp)
  if (date === null) {
    return false
  }

  return true
}

