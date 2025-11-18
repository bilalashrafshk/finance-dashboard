/**
 * Dividend Utility Functions
 * 
 * Centralized utilities for dividend calculations and conversions
 */

/**
 * Standard face value for PK equity shares (Rs. 10)
 */
export const PK_EQUITY_FACE_VALUE = 10

/**
 * Convert dividend amount from percent/10 to rupees
 * 
 * Dividend amounts are stored as percent/10 (e.g., 110% = 11.0, 50% = 5.0)
 * This function converts them to actual rupees per share
 * 
 * Formula: dividend_amount (percent/10) * (FACE_VALUE / 10) = rupees
 * Example: 11.0 * (10 / 10) = 11.0 rupees per share
 * 
 * @param dividendAmount - Dividend amount in percent/10 format
 * @param faceValue - Face value per share (default: 10 for PK equity)
 * @returns Dividend amount in rupees per share
 */
export function convertDividendToRupees(
  dividendAmount: number,
  faceValue: number = PK_EQUITY_FACE_VALUE
): number {
  return dividendAmount * (faceValue / 10)
}

/**
 * Filter dividends that occurred on or after a purchase date
 * 
 * @param dividends - Array of dividend records with date field
 * @param purchaseDate - Purchase date (Date object or ISO string)
 * @returns Filtered array of dividends
 */
export function filterDividendsByPurchaseDate<T extends { date: string }>(
  dividends: T[],
  purchaseDate: Date | string
): T[] {
  const purchase = typeof purchaseDate === 'string' ? new Date(purchaseDate) : purchaseDate
  return dividends.filter(d => new Date(d.date) >= purchase)
}

/**
 * Calculate total dividends collected for a holding
 * 
 * @param dividendAmount - Dividend amount in rupees per share
 * @param quantity - Number of shares held
 * @returns Total dividends collected
 */
export function calculateTotalDividendsForHolding(
  dividendAmount: number,
  quantity: number
): number {
  return dividendAmount * quantity
}

