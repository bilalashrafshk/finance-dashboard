# PSX Endpoint Tracking Guide

This guide explains how to identify which endpoint/method is being used when fetching PSX stock prices.

## Overview

The PSX price API uses a **smart fallback chain** with three possible sources:

1. **📦 Stored Data (Parquet)** - Fastest, uses locally stored historical data
2. **🌐 StockAnalysis.com API** - Primary external source, updates stored data
3. **🔍 PSX Website Scraping** - Fallback method, used when API fails

## How to Check Which Endpoint Was Used

### Method 1: Browser Console Logs

When prices are fetched, the system automatically logs which endpoint was used:

**In Add Holding Dialog:**
```
[PSX Price] PTC: 34.45 | Source: 📦 Stored Data (Parquet) | Date: 2025-11-12T00:00:00
```

**In Portfolio Refresh:**
```
[PSX Price Refresh] PTC: 34.45 | Source: 🌐 StockAnalysis.com API | Date: 2025-11-12T00:00:00
```

### Method 2: API Response

The API response includes a `source` field:

```json
{
  "ticker": "PTC",
  "price": 34.45,
  "source": "stored_data",
  "date": "2025-11-12T00:00:00"
}
```

**Possible source values:**
- `stored_data` - Retrieved from local Parquet file
- `stockanalysis_api` - Fetched from StockAnalysis.com API
- `psx_scraping` - Scraped from PSX website (fallback)

### Method 3: Network Tab

In browser DevTools → Network tab:
1. Filter for `/api/psx/price`
2. Click on the request
3. Check the Response tab to see the `source` field

### Method 4: Server Logs

Check the Next.js server console for detailed logs:
- `No stored data for {ticker}, fetching from API...`
- `Failed to update from stockanalysis.com API: {error}`

## Source Priority Logic

The system tries endpoints in this order:

```
1. Stored Data (if refresh=false)
   ↓ (if not found or refresh=true)
2. StockAnalysis.com API
   ↓ (if fails)
3. PSX Website Scraping
```

## Understanding Each Source

### 📦 Stored Data (Parquet)
- **When used**: When data exists locally and `refresh=false`
- **Speed**: Fastest (local file read)
- **Data freshness**: May be from previous day
- **Location**: `data/psx/{TICKER}.parquet`

### 🌐 StockAnalysis.com API
- **When used**: When refreshing prices or no stored data exists
- **Speed**: Medium (external API call)
- **Data freshness**: Latest available
- **Updates**: Automatically updates stored data with new records

### 🔍 PSX Website Scraping
- **When used**: When StockAnalysis.com API fails
- **Speed**: Slowest (HTML parsing)
- **Data freshness**: Current (real-time from website)
- **Reliability**: Less reliable (depends on website structure)

## Testing Endpoint Selection

### Force API Update
Add `?refresh=true` to force update from API:
```
GET /api/psx/price?ticker=PTC&refresh=true
```

### Check Stored Data Only
Use the data API directly:
```
GET /api/psx/data?ticker=PTC&action=price
```

### Force Full Refresh
Use the data API with force flag:
```
GET /api/psx/data?ticker=PTC&action=update&force=true
```

## Visual Indicators (Future Enhancement)

You can add visual indicators in the UI:

```typescript
const sourceIcons = {
  'stored_data': '📦',
  'stockanalysis_api': '🌐',
  'psx_scraping': '🔍'
}

// Display in tooltip or badge
<Tooltip>
  <TooltipTrigger>
    Price: {price}
  </TooltipTrigger>
  <TooltipContent>
    Source: {sourceIcons[source]} {sourceLabel}
    {date && <br />Date: {date}}
  </TooltipContent>
</Tooltip>
```

## Troubleshooting

### Always Using Scraping?
- Check if Python dependencies are installed: `pip install -r requirements.txt`
- Check if data directory exists: `data/psx/`
- Check server logs for errors

### Not Updating?
- Check if `refresh=true` is being passed
- Check network tab for API errors
- Verify StockAnalysis.com API is accessible

### Stale Data?
- Force refresh: `?refresh=true`
- Check stored data date: `GET /api/psx/data?ticker=PTC&action=price`
- Manually update: `GET /api/psx/data?ticker=PTC&action=update`




