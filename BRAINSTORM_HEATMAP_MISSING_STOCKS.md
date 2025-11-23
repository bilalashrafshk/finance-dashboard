# Brainstorm: Why Some Days Have < 100 Stocks in Heatmap

## Current Issue
- Heatmap shows 89 stocks instead of 100 for Nov 21, 2025
- Filter: `WHERE sdp.price IS NOT NULL` removes stocks without price data

## Root Causes

### 1. **Trading Suspensions**
- Stocks can be suspended from trading on specific dates
- Regulatory actions, corporate actions, etc.
- **Impact**: Stock won't have price data for that date

### 2. **Market Holidays (Stock-Specific)**
- Some stocks may have different trading calendars
- Company-specific holidays
- **Impact**: No trading = no price data

### 3. **Data Gaps in Database**
- Historical data might not be complete
- Some stocks might not have been fetched for that date
- **Impact**: Missing records in `historical_price_data` table

### 4. **New Listings**
- Stocks listed after the date won't have historical data
- **Impact**: Can't show data for stocks that didn't exist yet

### 5. **Delistings**
- Stocks delisted before the date
- **Impact**: No data available for that date

### 6. **Data Collection Issues**
- API failures during data collection
- Incomplete data updates
- **Impact**: Missing price records

## Potential Solutions

### Option 1: **Use Most Recent Available Price** (Recommended)
- If no price for selected date, use most recent price before that date
- Show indicator that price is "stale" (not from exact date)
- **Pros**: Always shows 100 stocks, uses best available data
- **Cons**: Some prices might be from previous trading day

### Option 2: **Include Stocks Without Data**
- Show stocks even if no price data (mark as "No data available")
- **Pros**: Always 100 stocks visible
- **Cons**: Less useful, can't calculate change %

### Option 3: **Expand Limit Dynamically**
- If only 89 stocks have data, fetch top 111 stocks to get 100 with data
- **Pros**: Always shows 100 stocks with data
- **Cons**: Might include lower market cap stocks, inconsistent set

### Option 4: **Forward-Fill Missing Prices**
- Use previous trading day's price if current date has no data
- Mark with visual indicator (different color/border)
- **Pros**: Complete dataset, clear indication of data quality
- **Cons**: Slightly misleading if not clearly marked

### Option 5: **Show Data Quality Indicator**
- Display count of stocks with exact date data vs. forward-filled
- Add warning when < 100 stocks have exact date data
- **Pros**: Transparent about data quality
- **Cons**: Doesn't solve the problem, just informs

### Option 6: **Hybrid Approach** (Best)
- Try to get 100 stocks with exact date data
- If < 100, forward-fill from previous trading day for missing ones
- Show indicator: "X stocks using previous day's price"
- **Pros**: Best of both worlds - complete data + transparency
- **Cons**: Slightly more complex logic

## Recommended Implementation

Use **Option 6 (Hybrid Approach)**:

1. First pass: Get top 100 stocks with exact date price data
2. If count < 100, identify missing stocks
3. For missing stocks, get most recent price before selected date
4. Combine results
5. Show indicator: "89 stocks with Nov 21 data, 11 using previous trading day"

This ensures:
- Always shows 100 stocks (or close to it)
- Uses best available data
- Transparent about data quality
- Consistent with Advance-Decline calculation logic

