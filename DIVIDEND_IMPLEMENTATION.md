# Dividend Data Implementation

## Overview

This document describes the dividend data storage and fetching system for PK equity assets. The system fetches dividend data from scstrade.com API, parses it, and stores it in the database alongside price data.

## Features

- ✅ Dividend data storage in database
- ✅ Automatic dividend fetching when price data is fetched
- ✅ Error handling - dividend fetch failures don't affect price fetching
- ✅ Dividend amount calculation: `dividend_amount = percent / 10` (e.g., 110% = 11.0)
- ✅ Only stores dividend data (ignores bonus and right shares)
- ✅ Supports assets with no dividends
- ✅ Backfill script for existing companies
- ✅ Consistent date format (YYYY-MM-DD)

## Database Schema

### Dividend Data Table

```sql
CREATE TABLE dividend_data (
  id SERIAL PRIMARY KEY,
  asset_type VARCHAR(50) NOT NULL,  -- 'pk-equity', 'us-equity', etc.
  symbol VARCHAR(50) NOT NULL,       -- 'PTC', 'HBL', etc.
  date DATE NOT NULL,                -- Dividend date (YYYY-MM-DD)
  dividend_amount DECIMAL(10, 4) NOT NULL,  -- Dividend amount (percent/10)
  source VARCHAR(50) NOT NULL DEFAULT 'scstrade',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(asset_type, symbol, date)
);
```

## Components

### 1. Dividend Parser (`lib/portfolio/dividend-parser.ts`)

Parses dividend percentage strings and converts to amount:
- `parseDividendAmount()`: Converts "110%" → 11.0, "50%" → 5.0
- `parseDividendDate()`: Converts "31 Oct 2025" → "2025-10-31"
- `isValidDividendRecord()`: Validates dividend records

**Handles edge cases:**
- Missing % sign: "12.50" → 1.25
- Double % sign: "80%%" → 8.0
- Annotations: "35%(CY15)" → 3.5
- Decimal values: "40.50%" → 4.05

### 2. Dividend API (`lib/portfolio/dividend-api.ts`)

Fetches dividend data from scstrade.com API:
- `fetchDividendData(ticker, rows)`: Fetches up to 100 dividend records
- Returns array of `{ date, dividend_amount }` records
- Filters out invalid records
- Returns `null` if no data available (valid - some companies have no dividends)

### 3. Dividend Fetcher (`lib/portfolio/dividend-fetcher.ts`)

Helper function for fetching and storing dividends:
- `fetchAndStoreDividends()`: Fetches and stores dividend data
- Non-blocking - errors don't throw
- Only fetches if data doesn't exist (unless `forceRefresh=true`)
- Only works for `pk-equity` assets

### 4. Database Client (`lib/portfolio/db-client.ts`)

Database functions for dividend data:
- `insertDividendData()`: Stores dividend records (chunked batch inserts)
- `getDividendData()`: Retrieves dividend data with optional date range
- `hasDividendData()`: Checks if dividend data exists

### 5. Dividend API Route (`app/api/pk-equity/dividend/route.ts`)

REST API endpoint for dividend data:
- `GET /api/pk-equity/dividend?ticker=HBL`
- `GET /api/pk-equity/dividend?ticker=HBL&startDate=2020-01-01&endDate=2025-12-31`
- `GET /api/pk-equity/dividend?ticker=HBL&refresh=true`

Returns:
```json
{
  "ticker": "HBL",
  "dividends": [
    { "date": "2025-10-31", "dividend_amount": 5.0 },
    { "date": "2024-10-24", "dividend_amount": 4.0 }
  ],
  "count": 2,
  "source": "database" | "api"
}
```

### 6. Price API Integration (`app/api/pk-equity/price/route.ts`)

Dividend fetching is integrated into price fetching:
- Automatically fetches dividends when price data is stored
- Non-blocking - dividend fetch errors don't affect price response
- Only fetches if dividend data doesn't exist

## Usage

### Automatic (Future Assets)

When adding a new PK equity asset to portfolio or asset screener:
1. Price data is fetched and stored
2. Dividend data is automatically fetched and stored (non-blocking)
3. If dividend fetch fails, price fetch still succeeds

### Manual Backfill (Existing Assets)

Run the backfill script to fetch dividends for existing companies:

```bash
# Backfill all PK equity tickers in database
node scripts/backfill-dividends.js

# Backfill specific tickers
node scripts/backfill-dividends.js HBL PTC OGDC UBL
```

### API Usage

Fetch dividend data via API:

```bash
# Get all dividends for a ticker
curl "http://localhost:3000/api/pk-equity/dividend?ticker=HBL"

# Get dividends in date range
curl "http://localhost:3000/api/pk-equity/dividend?ticker=HBL&startDate=2020-01-01&endDate=2025-12-31"

# Force refresh from API
curl "http://localhost:3000/api/pk-equity/dividend?ticker=HBL&refresh=true"
```

## Dividend Amount Calculation

The system converts dividend percentages to amounts using the formula:
```
dividend_amount = percent / 10
```

Examples:
- 110% → 11.0
- 50% → 5.0
- 40.50% → 4.05
- 12.5% → 1.25

## Error Handling

1. **Dividend fetch failures don't affect price fetching**
   - Dividend fetching is non-blocking
   - Errors are logged but don't throw
   - Price API always returns successfully

2. **No dividend data is valid**
   - Some companies have no dividends
   - API returns empty array: `{ dividends: [], count: 0 }`
   - Not considered an error

3. **Invalid data is filtered**
   - Invalid records are skipped
   - Only valid dividend records are stored
   - Parser handles edge cases gracefully

## Data Sources

- **Primary**: scstrade.com API (`/MarketStatistics/MS_xDates.aspx/chartact`)
- **Storage**: PostgreSQL database (`dividend_data` table)
- **Source field**: Always `'scstrade'` for PK equity dividends

## Date Format

All dates are stored in ISO format: `YYYY-MM-DD`
- Consistent with price data format
- Easy to query and filter
- Timezone-independent

## Future Enhancements

- Support for US equity dividends
- Dividend yield calculations
- Dividend history charts
- Dividend payment date tracking
- Dividend reinvestment calculations



