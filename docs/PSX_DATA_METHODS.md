# PSX Data Fetching Methods Documentation

This document describes the different methods used to fetch PSX (Pakistan Stock Exchange) stock price data.

## Overview

The application uses two methods to fetch PSX stock prices:

1. **StockAnalysis.com API** (Primary - New Method)
   - Fetches historical data via REST API
   - Stores data locally using pandas and Parquet format
   - Automatically updates when new data is available

2. **PSX Website Scraping** (Fallback - Legacy Method)
   - Scrapes HTML from `dps.psx.com.pk` website
   - Used as fallback when API method fails
   - Documented below for reference

---

## Method 1: StockAnalysis.com API (Primary)

### Endpoint
```
https://stockanalysis.com/api/symbol/a/PSX-{TICKER}/history?range=10Y&period=Daily
```

### Example
```
https://stockanalysis.com/api/symbol/a/PSX-PTC/history?range=10Y&period=Daily
```

### Response Format
```json
{
  "status": "success",
  "data": [
    {
      "t": "2025-11-12",
      "o": 34.99,
      "h": 35.4,
      "l": 33.8,
      "c": 34.02,
      "a": 34.02,
      "v": 9907966,
      "ch": -1.73
    },
    ...
  ]
}
```

### Field Descriptions
- `t`: Date (YYYY-MM-DD format)
- `o`: Open price
- `h`: High price
- `l`: Low price
- `c`: Close price
- `a`: Adjusted close price
- `v`: Volume
- `ch`: Change percentage

### Data Storage

**Location**: `data/psx/{TICKER}.parquet`

**Format**: Parquet (compressed with Snappy)

**Columns**:
- `date`: Date (datetime)
- `open`: Opening price
- `high`: High price
- `low`: Low price
- `close`: Closing price
- `adjusted_close`: Adjusted closing price
- `volume`: Trading volume
- `change_pct`: Percentage change

### Update Mechanism

1. When a price refresh is requested, the system:
   - Loads existing stored data (if any)
   - Fetches latest data from StockAnalysis.com API
   - Compares the latest date in stored data with API data
   - Appends only new records (dates after the stored latest date)
   - Saves updated data back to Parquet file

2. This ensures:
   - Efficient storage (only new data is added)
   - Fast retrieval (data is stored locally)
   - Automatic updates (no manual intervention needed)

### API Routes

#### Get Latest Price
```
GET /api/psx/data?ticker=PTC&action=price
```

Response:
```json
{
  "ticker": "PTC",
  "date": "2025-11-12T00:00:00",
  "close": 34.02,
  "open": 34.99,
  "high": 35.4,
  "low": 33.8,
  "volume": 9907966,
  "change_pct": -1.73
}
```

#### Update Data
```
GET /api/psx/data?ticker=PTC&action=update
GET /api/psx/data?ticker=PTC&action=update&force=true
```

Response:
```json
{
  "status": "success",
  "message": "Added 5 new records for PTC",
  "records_count": 2474,
  "new_records_count": 5,
  "latest_date": "2025-11-12T00:00:00"
}
```

### Python Script

The data management is handled by `scripts/psx_data_manager.py`:

```bash
# Update data for a ticker
python3 scripts/psx_data_manager.py update PTC

# Force refresh (re-fetch all data)
python3 scripts/psx_data_manager.py update PTC --force

# Get latest price
python3 scripts/psx_data_manager.py price PTC
```

---

## Method 2: PSX Website Scraping (Legacy/Fallback)

### URL Format
```
https://dps.psx.com.pk/company/{TICKER}
```

### Example
```
https://dps.psx.com.pk/company/PTC
```

### Implementation

**File**: `lib/portfolio/psx-api.ts`

**Function**: `fetchPSXBidPrice(ticker: string)`

### Scraping Logic

The function extracts price data from the HTML page using multiple fallback patterns:

1. **Primary Method**: Extract Bid Price from REG tab
   - Looks for `<div class="tabs__panel" data-name="REG">`
   - Finds `<div class="stats_label">Bid Price</div>`
   - Extracts value from following `<div class="stats_value">`

2. **Fallback Method 1**: Extract Current Price from Quote Section
   - Pattern: `<div class="quote__close">Rs.{price}</div>`
   - Used when Bid Price is 0.00 (market closed or no active bids)

3. **Fallback Method 2**: Extract from `data-current` attribute
   - Pattern: `data-current="{price}"` in REG tab's numRange divs
   - Used as secondary fallback

### HTML Structure

The PSX website structure (relevant sections):

```html
<!-- Quote Section -->
<div class="quote__price">
  <div class="quote__close">Rs.34.45</div>
  ...
</div>

<!-- Stats Tabs -->
<div class="tabs">
  <div class="tabs__list">
    <div class="tabs__list__item" data-name="REG">REG</div>
    <div class="tabs__list__item" data-name="FUT">FUT</div>
    <div class="tabs__list__item" data-name="ODL">ODL</div>
  </div>
  
  <!-- REG Tab Panel -->
  <div class="tabs__panel" data-name="REG">
    <div class="stats">
      <div class="stats_item">
        <div class="stats_label">Bid Price</div>
        <div class="stats_value">0.00</div>
      </div>
      ...
    </div>
    <div class="stats company__quote__rangeStats">
      <div class="stats_item">
        <div class="stats_label">DAY RANGE</div>
        <div class="stats_value">
          33.55 — 35.00
          <div class="numRange" data-low="33.55" data-high="35" data-current="34.45"></div>
        </div>
      </div>
    </div>
  </div>
</div>
```

### Important Notes

1. **Bid Price Can Be Zero**: When the market is closed or there are no active bids, the Bid Price shows as `0.00`. In this case, the function falls back to the current/last traded price from the quote section.

2. **Ticker Casing**: The URL requires uppercase tickers. The function automatically converts to uppercase.

3. **User-Agent Required**: The website may require a proper User-Agent header to avoid blocking.

### Example Usage

```typescript
import { fetchPSXBidPrice } from '@/lib/portfolio/psx-api'

const price = await fetchPSXBidPrice('PTC')
// Returns: 34.45 (or null if not found)
```

### When This Method Is Used

The scraping method is used as a fallback when:
- StockAnalysis.com API is unavailable
- No stored data exists for the ticker
- API update fails for any reason

---

## Integration in Price API

The `/api/psx/price` route uses a smart fallback chain:

1. **First**: Try to get from stored data (if `refresh=false`)
2. **Second**: Update from StockAnalysis.com API and get latest price
3. **Third**: Fallback to PSX website scraping

This ensures maximum reliability and performance.

---

## Dependencies

### Python
- `pandas>=2.0.0` - Data manipulation
- `pyarrow>=12.0.0` - Parquet file support
- `requests>=2.31.0` - HTTP requests

Install with:
```bash
pip install -r requirements.txt
```

---

## File Structure

```
data/
  psx/
    PTC.parquet
    HBL.parquet
    ...

scripts/
  psx_data_manager.py

lib/
  portfolio/
    psx-api.ts          # Scraping method (fallback)

app/
  api/
    psx/
      price/
        route.ts        # Main price API (uses both methods)
      data/
        route.ts        # Data management API
```

---

## Future Improvements

1. **Batch Updates**: Update multiple tickers in parallel
2. **Scheduled Updates**: Automatic daily updates via cron job
3. **Data Validation**: Validate data integrity and detect anomalies
4. **Historical Analysis**: Use stored historical data for charts and analysis



