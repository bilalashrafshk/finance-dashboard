# API Calls Audit - Portfolio Section

## ✅ Current Price Fetching (All Using Unified Routes)

### 1. Add Holding Dialog (`add-holding-dialog.tsx`)
- **Crypto**: ✅ Uses `fetchCryptoPrice()` from unified-price-api
- **PK Equity**: ✅ Uses `fetchPKEquityPrice()` from unified-price-api
- **US Equity**: ✅ Uses `fetchUSEquityPrice()` from unified-price-api
- **Metals**: ✅ Uses `fetchMetalsPrice()` from unified-price-api
- **KSE100**: ✅ Uses `fetchIndicesPrice('KSE100')` from unified-price-api
- **SPX500**: ✅ Uses `fetchIndicesPrice('SPX500')` from unified-price-api

### 2. Portfolio Dashboard (`portfolio-dashboard.tsx`)
- **Crypto**: ✅ Uses `fetchCryptoPrice()` from unified-price-api
- **PK Equity**: ✅ Uses `fetchPKEquityPrice()` from unified-price-api
- **US Equity**: ✅ Uses `fetchUSEquityPrice()` from unified-price-api
- **Metals**: ✅ Uses `fetchMetalsPrice()` from unified-price-api

### 3. Portfolio Update Section (`portfolio-update-section.tsx`)
- **Crypto**: ✅ Uses `fetchCryptoPrice()` from unified-price-api (with refresh=true)
- **PK Equity**: ✅ Uses `fetchPKEquityPrice()` from unified-price-api (with refresh=true)
- **US Equity**: ✅ Uses `fetchUSEquityPrice()` from unified-price-api (with refresh=true)
- **Metals**: ✅ Uses `fetchMetalsPrice()` from unified-price-api (with refresh=true)

---

## ⚠️ Historical Data Fetching (Still Using `/api/historical-data`)

These are for **historical data retrieval**, not current prices. They could potentially use unified routes with date ranges, but `/api/historical-data` is fine for this purpose.

### 1. Add Holding Dialog (`add-holding-dialog.tsx`)
- **Line 110**: `/api/historical-data?assetType=pk-equity&symbol=...` - For purchase date validation
- **Line 120**: `/api/historical-data?assetType=us-equity&symbol=...` - For purchase date validation
- **Line 131**: `/api/historical-data?assetType=crypto&symbol=...` - For purchase date validation
- **Line 147**: `/api/historical-data?assetType=metals&symbol=...` - For purchase date validation

### 2. Portfolio Update Section (`portfolio-update-section.tsx`)
- **Line 55**: `/api/historical-data?assetType=...&symbol=...` - For checking last update date
- **Line 136**: `/api/historical-data?assetType=...&symbol=...` - For checking last update date

### 3. Portfolio Charts
- **us-equity-portfolio-chart.tsx**: `/api/historical-data?assetType=us-equity&symbol=...` - For chart data
- **pk-equity-portfolio-chart.tsx**: `/api/historical-data?assetType=pk-equity&symbol=...` - For chart data
- **crypto-portfolio-chart.tsx**: `/api/historical-data?assetType=crypto&symbol=...` - For chart data
- **metals-portfolio-chart.tsx**: `/api/historical-data?assetType=metals&symbol=...` - For chart data

**Note**: These could be updated to use unified routes with date ranges, but `/api/historical-data` is acceptable for historical data retrieval.

---

## ✅ List Endpoints (Not Price Endpoints - Fine as Is)

### 1. Metals Selector (`metals-selector.tsx`)
- **Line 36**: `/api/metals/list` - Returns list of available metals
- **Purpose**: Not a price endpoint, just returns available metal symbols

### 2. Crypto Selector (`crypto-selector.tsx`)
- **Line 30**: `/api/binance/symbols` - Returns list of available crypto symbols
- **Purpose**: Not a price endpoint, just returns available crypto symbols

---

## ✅ Storage Endpoints (Not Price Endpoints - Fine as Is)

### 1. Add Holding Dialog (`add-holding-dialog.tsx`)
- **Line 179**: `POST /api/historical-data/store` - Stores fetched historical data
- **Purpose**: Storage endpoint, not a price fetching endpoint

### 2. Portfolio Update Section (`portfolio-update-section.tsx`)
- **Line 220**: `POST /api/historical-data/store` - Stores fetched price data
- **Purpose**: Storage endpoint, not a price fetching endpoint

---

## Summary

### ✅ All Current Price Fetching Uses Unified Routes
- **100% of current price fetching** goes through unified API routes
- All components use `unified-price-api.ts` helper functions
- Metals/indices automatically handle client-side fetching

### ⚠️ Historical Data Still Uses `/api/historical-data`
- This is acceptable since it's for historical data retrieval, not current prices
- Could be migrated to unified routes with date ranges if desired
- Currently works well for its purpose

### ✅ Other Endpoints Are Fine
- List endpoints (`/api/metals/list`, `/api/binance/symbols`) - Not price endpoints
- Storage endpoint (`/api/historical-data/store`) - Not a price fetching endpoint

---

## Recommendation

**Current State**: ✅ **All current price fetching is using unified routes**

**Optional Improvement**: Consider migrating historical data fetching to use unified routes with date ranges:
- Instead of: `/api/historical-data?assetType=crypto&symbol=BTC`
- Use: `/api/crypto/price?symbol=BTC&startDate=2020-01-01&endDate=2024-01-31`

This would make the API even more unified, but it's not required since `/api/historical-data` works fine for historical data retrieval.

---

## Files Using Unified Price API

✅ `components/portfolio/add-holding-dialog.tsx` - fetchCurrentPrice()
✅ `components/portfolio/portfolio-dashboard.tsx` - handleRefreshPrices()
✅ `components/portfolio/portfolio-update-section.tsx` - updateAllHoldings()

All price fetching functions import from `@/lib/portfolio/unified-price-api`

