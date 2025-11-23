# API Routes Reference - Unified Price & Historical Data API

This document describes the unified API routes for fetching prices and historical data for all asset classes.

## Overview

All asset price routes follow a unified pattern:
1. **Check database first** - If today's data exists and market is closed, return immediately
2. **Fetch from external API** - If data not in DB or market is open
3. **Store fetched data** - Automatically store new data in database
4. **Support date ranges** - Optional parameters for historical data queries

---

## Unified API Route Pattern

### Base Route Structure
```
GET /api/{asset-type}/price?{params}
```

### Common Parameters (All Routes)
- `symbol` or `ticker` (required) - Asset symbol/ticker
- `date` (optional) - Specific date to fetch (YYYY-MM-DD). If not provided, fetches latest/current price
- `startDate` (optional) - Start date for historical range (YYYY-MM-DD)
- `endDate` (optional) - End date for historical range (YYYY-MM-DD)
- `refresh` (optional) - Force refresh, bypass database cache (default: false)

### Response Format
```json
{
  "symbol": "SYMBOL",
  "price": 1234.56,
  "date": "2024-01-15",
  "source": "database" | "api" | "client_fetch_required",
  "data": [...], // Present if date range requested
  "needsClientFetch": false, // true for metals/indices when client-side fetch needed
  "instrumentId": "68" // Present if needsClientFetch is true
}
```

---

## Asset-Specific Routes

### 1. Crypto Assets
**Route:** `GET /api/crypto/price`

**Parameters:**
- `symbol` (required) - Crypto symbol (e.g., "BTC", "ETH")
- `date` (optional) - Specific date
- `startDate` (optional) - Historical range start
- `endDate` (optional) - Historical range end
- `refresh` (optional) - Force refresh

**Behavior:**
- ✅ Server-side fetching (Binance API)
- ✅ Database storage supported
- ✅ No market hours (24/7)
- Always fetches fresh price (crypto prices change constantly)

**Data Source:** Binance API (`https://api.binance.com/api/v3/ticker/price`)

**Example:**
```bash
GET /api/crypto/price?symbol=BTC
GET /api/crypto/price?symbol=ETH&date=2024-01-15
GET /api/crypto/price?symbol=BTC&startDate=2024-01-01&endDate=2024-01-31
```

---

### 2. PK Equity (Pakistan Stock Exchange)
**Route:** `GET /api/pk-equity/price`

**Parameters:**
- `ticker` (required) - PSX ticker (e.g., "PTC", "OGDC")
- `date` (optional) - Specific date
- `startDate` (optional) - Historical range start
- `endDate` (optional) - Historical range end
- `refresh` (optional) - Force refresh

**Behavior:**
- ✅ Server-side fetching (StockAnalysis.com API)
- ✅ Database storage supported
- ✅ Market hours check (PSX: 9:15 AM - 3:30 PM PKT, weekdays)
- Checks DB if market closed and today's data exists

**Data Sources (fallback order):**
1. Database (if market closed)
2. StockAnalysis.com API
3. PSX website scraping (fallback)

**Example:**
```bash
GET /api/pk-equity/price?ticker=PTC
GET /api/pk-equity/price?ticker=OGDC&date=2024-01-15
GET /api/pk-equity/price?ticker=PTC&startDate=2024-01-01&endDate=2024-01-31
```

---

### 3. US Equity
**Route:** `GET /api/us-equity/price`

**Parameters:**
- `ticker` (required) - US stock ticker (e.g., "AAPL", "MSFT")
- `date` (optional) - Specific date
- `startDate` (optional) - Historical range start
- `endDate` (optional) - Historical range end
- `refresh` (optional) - Force refresh

**Behavior:**
- ✅ Server-side fetching (StockAnalysis.com API)
- ✅ Database storage supported
- ✅ Market hours check (US: 9:30 AM - 4:00 PM ET, weekdays)
- Checks DB if market closed and today's data exists

**Data Source:** StockAnalysis.com API

**Example:**
```bash
GET /api/us-equity/price?ticker=AAPL
GET /api/us-equity/price?ticker=MSFT&date=2024-01-15
GET /api/us-equity/price?ticker=AAPL&startDate=2024-01-01&endDate=2024-01-31
```

---

### 4. Metals (Gold, Silver, etc.)
**Route:** `GET /api/metals/price`

**Parameters:**
- `symbol` (required) - Metal symbol (e.g., "GOLD", "SILVER")
- `date` (optional) - Specific date
- `startDate` (optional) - Historical range start
- `endDate` (optional) - Historical range end
- `refresh` (optional) - Force refresh

**Behavior:**
- ⚠️ **Client-side fetching required** (Cloudflare protection)
- ✅ Database storage supported
- ✅ Market hours check (US: 9:30 AM - 4:00 PM ET, weekdays)
- Checks DB if market closed and today's data exists
- If data not in DB, returns `needsClientFetch: true` with `instrumentId`

**Client-Side Flow:**
1. API route checks database
2. If not found, returns `{ needsClientFetch: true, instrumentId: "68" }`
3. Client calls `getLatestPriceFromInvestingClient(instrumentId)`
4. Client stores result via `/api/historical-data/store`
5. Client re-requests API route to get stored data

**Data Source:** Investing.com API (client-side only)

**Example:**
```bash
GET /api/metals/price?symbol=GOLD
GET /api/metals/price?symbol=SILVER&date=2024-01-15
GET /api/metals/price?symbol=GOLD&startDate=2024-01-01&endDate=2024-01-31
```

**Response when client fetch needed:**
```json
{
  "symbol": "GOLD",
  "needsClientFetch": true,
  "instrumentId": "68",
  "message": "Client-side fetch required due to Cloudflare protection"
}
```

---

### 5. Indices (SPX500, KSE100)
**Route:** `GET /api/indices/price`

**Parameters:**
- `symbol` (required) - Index symbol ("SPX500" or "KSE100")
- `date` (optional) - Specific date
- `startDate` (optional) - Historical range start
- `endDate` (optional) - Historical range end
- `refresh` (optional) - Force refresh

**Behavior:**
- ⚠️ **Client-side fetching required** (Cloudflare protection)
- ✅ Database storage supported
- ✅ Market hours check (US for SPX500, PSX for KSE100)
- Checks DB if market closed and today's data exists
- If data not in DB, returns `needsClientFetch: true` with `instrumentId`

**Data Source:** Investing.com API (client-side only)

**Example:**
```bash
GET /api/indices/price?symbol=SPX500
GET /api/indices/price?symbol=KSE100&date=2024-01-15
GET /api/indices/price?symbol=SPX500&startDate=2024-01-01&endDate=2024-01-31
```

---

## Historical Data Storage Route

### Store Historical Data
**Route:** `POST /api/historical-data/store`

**Request Body:**
```json
{
  "assetType": "crypto" | "pk-equity" | "us-equity" | "metals" | "indices",
  "symbol": "SYMBOL",
  "data": [
    {
      "date": "2024-01-15",
      "open": 1234.56,
      "high": 1250.00,
      "low": 1230.00,
      "close": 1245.00,
      "volume": 1000000
    }
  ],
  "source": "binance" | "stockanalysis" | "investing"
}
```

**Response:**
```json
{
  "success": true,
  "assetType": "metals",
  "symbol": "GOLD",
  "inserted": 10,
  "skipped": 0,
  "total": 10
}
```

---

## When Price Data is Fetched

### Automatic Fetching
- ❌ **No automatic fetching** on page load
- ✅ **On-demand** when user explicitly requests:
  - Clicking "Fetch Current Price" in Add Holding dialog
  - Clicking "Refresh Prices" button
  - Clicking "Update All" button

### Database Check Logic
All routes follow this pattern:

1. **Check if `refresh=true`**
   - If yes → Skip database, fetch from API

2. **Check database for today's price**
   - If market is closed AND today's data exists → Return DB price immediately
   - If market is open OR no today's data → Continue to fetch

3. **Fetch from external API**
   - Server-side assets: Fetch directly from API
   - Client-side assets: Return `needsClientFetch: true`

4. **Store fetched data**
   - Server-side: Automatically store in database
   - Client-side: Client stores via `/api/historical-data/store`

---

## Date Range Queries

### Single Date Query
```
GET /api/{asset-type}/price?symbol=SYMBOL&date=2024-01-15
```
Returns price for specific date from database or fetches if not available.

### Date Range Query
```
GET /api/{asset-type}/price?symbol=SYMBOL&startDate=2024-01-01&endDate=2024-01-31
```
Returns array of historical data points within the range.

**Response Format (Date Range):**
```json
{
  "symbol": "SYMBOL",
  "data": [
    {
      "date": "2024-01-01",
      "open": 1234.56,
      "high": 1250.00,
      "low": 1230.00,
      "close": 1245.00,
      "volume": 1000000
    },
    ...
  ],
  "count": 31,
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

---

## Error Responses

### Standard Error Format
```json
{
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

### Common Error Codes
- `400` - Bad Request (missing required parameters)
- `404` - Not Found (symbol/ticker not found)
- `500` - Internal Server Error (API failure)

---

## Implementation Notes

### Server-Side Assets
- Crypto, PK Equity, US Equity
- Can fetch directly from external APIs
- Automatically store fetched data in database

### Client-Side Assets
- Metals, Indices (SPX500, KSE100)
- Require browser-based fetching (Cloudflare protection)
- API route returns `needsClientFetch: true` with `instrumentId`
- Client must:
  1. Call `getLatestPriceFromInvestingClient(instrumentId)`
  2. Store result via `POST /api/historical-data/store`
  3. Re-request API route to get stored data

### Database Storage
- All fetched data is stored in `historical_price_data` table
- Supports incremental updates (only missing dates)
- Automatic deduplication (ON CONFLICT handling)

---

## Migration from Old Routes

### Old Routes (Deprecated)
- `/api/binance/price` → Use `/api/crypto/price`
- `/api/psx/price` → Use `/api/pk-equity/price`
- `/api/us-equity/price` → Keep (already unified)
- `/api/metals/price` → Keep (will be updated)

### Backward Compatibility
Old routes will be maintained temporarily but will redirect to new unified routes.

---

## Testing

See `scripts/test-api-routes.js` for comprehensive API route testing.

### Test Scenarios
1. Current price fetch (no date)
2. Specific date fetch
3. Date range fetch
4. Database cache hit
5. Database cache miss
6. Client-side fetch requirement (metals/indices)
7. Market hours logic
8. Error handling

---

## Code Locations

### API Routes
- `app/api/crypto/price/route.ts` - Crypto prices
- `app/api/pk-equity/price/route.ts` - PK equity prices
- `app/api/us-equity/price/route.ts` - US equity prices
- `app/api/metals/price/route.ts` - Metals prices
- `app/api/indices/price/route.ts` - Indices prices (new)
- `app/api/historical-data/store/route.ts` - Historical data storage

### Client Libraries
- `lib/portfolio/binance-api.ts` - Binance API (server-side)
- `lib/portfolio/stockanalysis-api.ts` - StockAnalysis API (server-side)
- `lib/portfolio/investing-client-api.ts` - Investing.com API (client-side)
- `lib/portfolio/db-client.ts` - Database operations
- `lib/portfolio/market-hours.ts` - Market hours utilities






