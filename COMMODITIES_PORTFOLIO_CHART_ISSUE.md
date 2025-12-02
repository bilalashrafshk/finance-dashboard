# Commodities Portfolio Chart Issue - Brainstorm

## Problem Statement

The portfolio chart for commodities is showing unrealized gains and losses over time, even though commodities should only show:
- **Purchase price** (constant value) until sold
- **Realized P&L** only when sold (selling price - purchase price)

## Root Cause Analysis

### Current Behavior

1. **Commodities Don't Have Market Prices**:
   - Commodities like "cloth lawn" are physical items with no market price
   - They're bought at a specific price (purchase price) and that's it
   - There's no external API or market to fetch prices from

2. **Portfolio History API** (`/api/user/portfolio/history/route.ts`):
   - Fetches historical prices for ALL asset types, including commodities (line 162)
   - Uses `/api/historical-data` route which may return stored commodity prices
   - When users update "current rate" in the commodity dialog, it stores prices in `historical_price_data` table via `/api/commodity/price` POST
   - These stored prices are then used in portfolio calculations, creating fake price movements

3. **Price Calculation** (lines 406, 411, 445, 450):
   ```typescript
   const historicalPrice = getPriceForDate(assetKey, dateStr, h.purchasePrice || 0)
   valueToAdd = (h.quantity || 0) * historicalPrice
   ```
   - For commodities, this uses stored "historical" prices if available (from "current rate" updates)
   - Falls back to purchase price only if no stored data exists
   - This creates unrealized gains/losses based on manually entered "current rate" values

4. **The "Current Rate" Field is Misleading**:
   - Users can update "current rate" when editing commodities
   - This gets stored as historical price data
   - But for physical commodities, there's no market price - it's just what you paid
   - This stored value shouldn't affect portfolio calculations

### Expected Behavior

Commodities should work like this:
- **Value = Quantity × Purchase Price** (constant, no unrealized P&L)
- **Realized P&L = (Selling Price - Purchase Price) × Quantity** (only when sold)
- **No historical prices** - commodities don't have market prices
- The "current rate" field is just for user reference, not for portfolio calculations

## Why This Happens

1. **Commodities are treated like other assets**: The code doesn't distinguish commodities when fetching/using historical prices
2. **Stored "current rate" prices exist**: When users update "current rate", prices are stored in the database
3. **These stored prices are used**: The portfolio history API fetches and uses these stored prices, creating fake price movements
4. **No special handling**: Unlike `calculateCurrentValue()` which correctly uses purchase price for commodities, the portfolio history API doesn't have this check
5. **Commodities don't have market prices**: Unlike stocks/crypto, there's no external market price for "cloth lawn" - it's just what you paid

## Solution Options

### Option 1: Skip Historical Prices for Commodities (Recommended)

**In `/api/user/portfolio/history/route.ts`:**

1. **Skip fetching historical prices for commodities** (line 150):
   ```typescript
   const priceFetchPromises = Array.from(uniqueAssets.entries())
     .filter(([assetKey, asset]) => asset.assetType !== 'commodities')
     .map(async ([assetKey, asset]) => {
       // ... existing fetch logic
     })
   ```

2. **Always use purchase price for commodities** (lines 406, 411, 445, 450):
   ```typescript
   if (h.assetType === 'commodities') {
     // For commodities, always use purchase price (no unrealized P&L)
     valueToAdd = (h.quantity || 0) * (h.purchasePrice || 0)
   } else {
     const historicalPrice = getPriceForDate(assetKey, dateStr, h.purchasePrice || 0)
     valueToAdd = (h.quantity || 0) * historicalPrice
   }
   ```

**Pros:**
- Simple and clear
- Matches the logic in `calculateCurrentValue()`
- No unrealized P&L shown
- Consistent with commodity behavior

**Cons:**
- Historical commodity prices stored in DB won't be used (but that's correct behavior)

### Option 2: Use Purchase Price in `getPriceForDate()` for Commodities

**Modify `getPriceForDate()` helper function:**

```typescript
const getPriceForDate = (assetKey: string, dateStr: string, fallbackPrice: number, assetType?: string): number => {
  // For commodities, always return purchase price (no historical prices)
  if (assetType === 'commodities') {
    return fallbackPrice
  }
  
  // ... existing logic for other asset types
}
```

**Pros:**
- Centralized logic
- Easy to maintain

**Cons:**
- Need to pass assetType to the helper function
- Slightly more complex

### Option 3: Don't Store Historical Prices for Commodities

**In `/api/commodity/price/route.ts`:**

Don't store historical prices when users update "current rate". Only store:
- Purchase price (when buying)
- Selling price (when selling)

**Pros:**
- Prevents the issue at the source
- No historical price data to confuse calculations

**Cons:**
- Users might want to track price changes (but this shouldn't affect portfolio value)
- Breaking change if users are already tracking prices

## Recommended Solution

**Option 1** is the best approach because:
1. It's explicit and clear
2. Matches existing commodity handling in `calculateCurrentValue()`
3. Doesn't require changes to price storage logic
4. Ensures commodities always show constant value until sold

## Implementation Details

### Changes Needed

1. **Skip historical price fetch for commodities** (line 150):
   ```typescript
   const priceFetchPromises = Array.from(uniqueAssets.entries())
     .filter(([assetKey, asset]) => asset.assetType !== 'commodities')
     .map(async ([assetKey, asset]) => {
       // ... existing code
     })
   ```

2. **Use purchase price for commodities** (4 locations: lines 406, 411, 445, 450):
   ```typescript
   if (h.assetType === 'commodities') {
     // Commodities: always use purchase price (no unrealized P&L)
     valueToAdd = (h.quantity || 0) * (h.purchasePrice || 0)
   } else {
     const historicalPrice = getPriceForDate(assetKey, dateStr, h.purchasePrice || 0)
     valueToAdd = (h.quantity || 0) * historicalPrice
   }
   ```

### Testing

After implementation, verify:
1. Commodity chart shows flat line (constant value) until sold
2. No unrealized gains/losses appear
3. When sold, realized P&L is calculated correctly
4. Other asset types (equities, crypto, etc.) still work correctly

## Additional Considerations

### Should Commodities Track Price Changes?

**Current behavior**: Users can update "current rate" which stores historical prices

**Question**: Should we allow this, or should commodities only show purchase price?

**Recommendation**: 
- Keep the ability to update "current rate" for user reference
- But don't use it in portfolio value calculations
- This way users can track price changes without affecting portfolio metrics

### Realized P&L Calculation

When commodities are sold:
- Realized P&L = (Selling Price - Purchase Price) × Quantity
- This should already work correctly via the transaction system
- No changes needed here

## Summary

The issue is that commodities are being treated like other assets with historical price tracking. The fix is to:
1. Skip fetching historical prices for commodities
2. Always use purchase price in portfolio value calculations
3. This ensures commodities show constant value until sold, matching their intended behavior

