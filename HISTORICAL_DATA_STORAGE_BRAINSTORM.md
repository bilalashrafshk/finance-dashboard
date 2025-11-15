# Historical Data Storage - Brainstorming & Implementation Plan

## Current State Analysis

### ✅ What We Already Have (Server-Side)

1. **PSX Stocks** (`scripts/psx_data_manager.py`):
   - ✅ Stores data in `data/psx/{TICKER}.parquet` (Parquet format)
   - ✅ Incremental updates (only appends new dates)
   - ❌ **NOT used by charts** - charts fetch from API every time

2. **Crypto** (`scripts/crypto_data_manager.py`):
   - ✅ Stores data in `data/crypto/{SYMBOL}.parquet` (Parquet format)
   - ✅ Incremental updates (only appends new dates)
   - ❌ **NOT used by charts** - charts fetch from API every time

3. **SPX500** (`scripts/spx500_data_manager.py`):
   - ✅ Stores data in `data/spx500/SPX500.parquet` (Parquet format)
   - ✅ Incremental updates (only appends new dates)
   - ❌ **NOT used by charts** - charts fetch from API every time

### ❌ What's Missing (Client-Side)

- Charts run in the **browser** (client-side)
- Server-side Parquet files are only accessible via Python scripts
- Charts need **browser storage** (localStorage/IndexedDB)
- Currently: Charts fetch full history from API every time

---

## User's Requirement

> "Store local files for all historic prices for any asset for the first time the user loads it. Subsequently, use that local file data directly, and only fetch new data from API to append to it"

### Key Points:
1. **First load**: Fetch full history, store locally
2. **Subsequent loads**: Use stored data directly
3. **Updates**: Only fetch dates after last stored date
4. **Append**: Merge new data with existing stored data

---

## Implementation Approach

### Option 1: Browser localStorage (Recommended for MVP)

**Pros:**
- ✅ Simple to implement
- ✅ Works everywhere (all browsers)
- ✅ No setup required
- ✅ Synchronous API (easy to use)

**Cons:**
- ⚠️ ~5-10MB storage limit per domain
- ⚠️ Slower for very large datasets
- ⚠️ Synchronous (can block UI)

**Storage Format:**
```json
{
  "historical-data-pk-equity-PTC": {
    "data": [...],
    "lastUpdated": "2025-11-14T10:30:00Z",
    "lastStoredDate": "2025-11-14",
    "source": "stockanalysis"
  }
}
```

**Storage Size Estimate:**
- PK Equity (10 years): ~3,650 records × ~100 bytes = ~365 KB
- US Equity (10 years): ~3,650 records × ~100 bytes = ~365 KB
- SPX500 (30 years): ~10,000 records × ~100 bytes = ~1 MB
- Crypto (varies): ~1,000 records × ~100 bytes = ~100 KB per symbol

**Total for 10 holdings**: ~5-10 MB (fits in localStorage)

### Option 2: IndexedDB (Better for Scale)

**Pros:**
- ✅ Much larger storage (hundreds of MB)
- ✅ Asynchronous (doesn't block UI)
- ✅ Better performance for large datasets
- ✅ Can store binary data efficiently

**Cons:**
- ⚠️ More complex API
- ⚠️ Requires async/await everywhere
- ⚠️ Slightly more setup

**When to use:** If localStorage fills up or we need >10MB

---

## Implementation Strategy

### Phase 1: Create Storage Utility ✅ (DONE)
- Created `lib/portfolio/historical-data-storage.ts`
- Functions: `loadHistoricalData`, `saveHistoricalData`, `mergeHistoricalData`, `getFetchStartDate`

### Phase 2: Update Chart Components

For each chart component:
1. **On load**: Check if stored data exists
2. **If exists**: Use stored data immediately (fast!)
3. **Fetch new data**: Only fetch dates after `lastStoredDate`
4. **Merge**: Combine stored + new data
5. **Save**: Update storage with merged data

### Phase 3: Update API Calls

Modify API calls to:
- Accept `startDate` parameter
- Only fetch dates after last stored date
- Return only new data

---

## Data Flow

### First Load (No Stored Data)
```
1. Chart loads
2. Check storage → No data found
3. Fetch full history from API (e.g., 10 years)
4. Store in localStorage
5. Render chart
```

### Subsequent Loads (Has Stored Data)
```
1. Chart loads
2. Check storage → Data found!
3. Use stored data immediately (render chart fast)
4. In background: Fetch only new dates (e.g., last 7 days)
5. Merge new data with stored data
6. Update storage
7. Re-render chart with updated data
```

### Daily Updates
```
1. User opens app
2. Load stored data (instant)
3. Check: lastStoredDate = "2025-11-13"
4. Fetch only: 2025-11-14 to today (1-2 days)
5. Append to stored data
6. Save updated data
```

---

## Benefits

### Efficiency Gains
- **First load**: Same as before (fetch full history)
- **Subsequent loads**: 99%+ faster (read from storage)
- **Daily updates**: Only fetch 1-2 days instead of 10,000+ days
- **Bandwidth**: 99%+ reduction after first load
- **API calls**: 99%+ reduction after first load

### User Experience
- ✅ Instant chart rendering (from stored data)
- ✅ Background updates (non-blocking)
- ✅ Works offline (with stale data)
- ✅ Faster page loads

### Rate Limits
- ✅ Much better compliance with API rate limits
- ✅ Fewer API calls = less chance of being blocked
- ✅ Can implement retry logic more easily

---

## Implementation Details

### Storage Key Format
```
historical-{assetType}-{symbol}
```

Examples:
- `historical-pk-equity-PTC`
- `historical-us-equity-AAPL`
- `historical-crypto-BTC`
- `historical-spx500-SPX500`
- `historical-kse100-KSE100`

### Data Structure
```typescript
interface StoredHistoricalData {
  data: HistoricalDataPoint[]  // Array of price data points
  lastUpdated: string           // ISO timestamp when last updated
  lastStoredDate: string        // YYYY-MM-DD, latest date we have
  source: 'stockanalysis' | 'binance' | 'investing'
}
```

### Merge Logic
1. Load existing stored data
2. Fetch new data (only dates after `lastStoredDate`)
3. Filter out duplicates (by date)
4. Combine arrays
5. Sort by date
6. Save merged data

---

## Edge Cases to Handle

1. **Storage Full**: Clear old data (keep last 2 years)
2. **API Failure**: Use stored data (even if stale)
3. **Data Format Changes**: Version the storage format
4. **Corrupted Data**: Validate before using, fallback to API
5. **Date Gaps**: Handle missing dates gracefully
6. **Multiple Sources**: Handle if user switches data sources

---

## Next Steps

1. ✅ Create storage utility (`historical-data-storage.ts`)
2. ⏳ Update PK Equity chart to use storage
3. ⏳ Update US Equity chart to use storage
4. ⏳ Update Crypto chart to use storage
5. ⏳ Update SPX500/KSE100 comparison to use storage
6. ⏳ Test with real data
7. ⏳ Handle edge cases

---

## Questions to Consider

1. **Storage Limit**: Should we limit to last 2 years? Or keep all data?
2. **Update Frequency**: How often to check for new data? (On mount? Daily? Hourly?)
3. **Data Expiry**: Should old data expire? (Probably not - historical data is immutable)
4. **Multiple Devices**: Storage is per-browser. Is that okay? (Yes, for now)
5. **Data Validation**: How strict should we be about data format? (Validate dates, prices)

---

## Recommendation

✅ **YES - Implement this approach**

**Why:**
- Massive efficiency gains (99%+ reduction in API calls)
- Better user experience (instant chart loading)
- Better rate limit compliance
- Matches existing Python script pattern (proven approach)

**Implementation:**
- Start with localStorage (simpler)
- Upgrade to IndexedDB if needed (if storage fills up)
- Implement incrementally (one chart at a time)


