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
 * Convert dividend amount to rupees
 * 
 * @deprecated Dividend amounts are now stored as Rupees in the database. 
 * This function is kept for backward compatibility but just returns the input.
 * 
 * @param dividendAmount - Dividend amount (in Rupees)
 * @param faceValue - Face value per share (Ignored, as amount is already in Rupees)
 * @returns Dividend amount in rupees per share
 */
export function convertDividendToRupees(
  dividendAmount: number,
  faceValue: number = PK_EQUITY_FACE_VALUE
): number {
  // Dividend amounts are now stored as actual Rupee values in the database
  // So no conversion is needed.
  return dividendAmount
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
  const pDate = new Date(purchaseDate)
  // Reset time part to ensure fair comparison
  pDate.setHours(0, 0, 0, 0)
  
  return dividends.filter(d => {
    const dDate = new Date(d.date)
    dDate.setHours(0, 0, 0, 0)
    return dDate >= pDate
  })
}

/**
 * Calculate total dividends for a specific holding quantity
 * 
 * @param dividendAmountPerShare - Amount in rupees per share
 * @param quantity - Number of shares held
 * @returns Total dividend amount in rupees
 */
export function calculateTotalDividendsForHolding(
  dividendAmountPerShare: number,
  quantity: number
): number {
  return dividendAmountPerShare * quantity
}
