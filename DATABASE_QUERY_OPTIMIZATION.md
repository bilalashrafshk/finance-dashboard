# Database Query Optimization: Combining Queries

## Overview

This document identifies all database queries that can be combined to reduce database round trips and improve performance at scale.

---

## 1. `getHistoricalDataWithMetadata` - 3 Queries → 1 Query

### Current Implementation (3 Queries)

**Location**: `lib/portfolio/db-client.ts:59-174`

```typescript
// Query 1: Get date range
const dateRangeResult = await client.query(
  `SELECT MIN(date) as earliest_date, MAX(date) as latest_date
   FROM historical_price_data
   WHERE asset_type = $1 AND symbol = $2`,
  [assetType, normalizedSymbol]
)

// Query 2: Get latest 5 dates (for verification)
const latestDatesResult = await client.query(
  `SELECT date FROM historical_price_data
   WHERE asset_type = $1 AND symbol = $2
   ORDER BY date DESC LIMIT 5`,
  [assetType, normalizedSymbol]
)

// Query 3: Get actual data
const result = await client.query(
  `SELECT date, open, high, low, close, volume, adjusted_close, change_pct
   FROM historical_price_data
   WHERE asset_type = $1 AND symbol = $2
   ORDER BY date ASC`,
  [assetType, normalizedSymbol]
)
```

### Optimized Implementation (1 Query)

**Option A: Using Window Functions (Recommended)**
```sql
WITH data AS (
  SELECT 
    date, open, high, low, close, volume, adjusted_close, change_pct,
    MIN(date) OVER () as earliest_date,
    MAX(date) OVER () as latest_date,
    ROW_NUMBER() OVER (ORDER BY date DESC) as date_rank
  FROM historical_price_data
  WHERE asset_type = $1 AND symbol = $2
    AND ($3::date IS NULL OR date >= $3::date)
    AND ($4::date IS NULL OR date <= $4::date)
)
SELECT 
  date, open, high, low, close, volume, adjusted_close, change_pct,
  earliest_date,
  latest_date,
  CASE WHEN date_rank <= 5 THEN date END as latest_date_verify
FROM data
WHERE ($5::integer IS NULL OR date_rank <= $5::integer)
ORDER BY date ASC
```

**Option B: Using CTE with Aggregates (Simpler)**
```sql
WITH date_range AS (
  SELECT 
    MIN(date) as earliest_date,
    MAX(date) as latest_date
  FROM historical_price_data
  WHERE asset_type = $1 AND symbol = $2
),
latest_dates AS (
  SELECT date
  FROM historical_price_data
  WHERE asset_type = $1 AND symbol = $2
  ORDER BY date DESC
  LIMIT 5
),
main_data AS (
  SELECT 
    date, open, high, low, close, volume, adjusted_close, change_pct
  FROM historical_price_data
  WHERE asset_type = $1 AND symbol = $2
    AND ($3::date IS NULL OR date >= $3::date)
    AND ($4::date IS NULL OR date <= $4::date)
  ORDER BY date ASC
  LIMIT CASE WHEN $5::integer IS NULL THEN NULL ELSE $5::integer END
)
SELECT 
  m.*,
  d.earliest_date,
  d.latest_date,
  (SELECT date FROM latest_dates ORDER BY date DESC LIMIT 1) as actual_latest_date
FROM main_data m
CROSS JOIN date_range d
```

**Option C: Single Query with Subqueries (Most Compatible)**
```sql
SELECT 
  date, open, high, low, close, volume, adjusted_close, change_pct,
  (SELECT MIN(date) FROM historical_price_data 
   WHERE asset_type = $1 AND symbol = $2) as earliest_date,
  (SELECT MAX(date) FROM historical_price_data 
   WHERE asset_type = $1 AND symbol = $2) as latest_date,
  (SELECT date FROM historical_price_data 
   WHERE asset_type = $1 AND symbol = $2 
   ORDER BY date DESC LIMIT 1) as actual_latest_date
FROM historical_price_data
WHERE asset_type = $1 AND symbol = $2
  AND ($3::date IS NULL OR date >= $3::date)
  AND ($4::date IS NULL OR date <= $4::date)
ORDER BY date ASC
LIMIT CASE WHEN $5::integer IS NULL THEN NULL ELSE $5::integer END
```

**Recommended**: Option C (most compatible, works on all PostgreSQL versions)

### Impact
- **Before**: 3 database round trips
- **After**: 1 database round trip
- **Reduction**: 66% fewer queries
- **Performance**: ~3× faster (eliminates 2 network round trips)

### Usage Frequency
- Called by: Portfolio charts, price routes, historical data API
- **Estimated calls per user**: 5-20 per page load
- **At 10,000 users**: 50,000-200,000 calls → **33,000-133,000 queries saved**

---

## 2. Price Routes - 2 Queries → 1 Query

### Current Implementation

**Location**: `app/api/*/price/route.ts` (crypto, pk-equity, us-equity, metals, indices)

```typescript
// Query 1: Check if today's price exists
const todayPrice = await getTodayPriceFromDatabase(assetType, symbolUpper, today)

// Query 2: Get latest record (if today not found)
const { data: existingData } = await getHistoricalDataWithMetadata(
  assetType, symbolUpper, undefined, undefined, 1
)
```

### Optimized Implementation

**Combine into single query:**
```sql
SELECT 
  close as today_price,
  date,
  (SELECT close FROM historical_price_data 
   WHERE asset_type = $1 AND symbol = $2 
   ORDER BY date DESC LIMIT 1) as latest_price,
  (SELECT date FROM historical_price_data 
   WHERE asset_type = $1 AND symbol = $2 
   ORDER BY date DESC LIMIT 1) as latest_date
FROM historical_price_data
WHERE asset_type = $1 AND symbol = $2 AND date = $3
LIMIT 1
```

**Or use COALESCE for simpler logic:**
```sql
SELECT 
  COALESCE(
    (SELECT close FROM historical_price_data 
     WHERE asset_type = $1 AND symbol = $2 AND date = $3),
    (SELECT close FROM historical_price_data 
     WHERE asset_type = $1 AND symbol = $2 
     ORDER BY date DESC LIMIT 1)
  ) as price,
  COALESCE(
    $3::date,
    (SELECT date FROM historical_price_data 
     WHERE asset_type = $1 AND symbol = $2 
     ORDER BY date DESC LIMIT 1)
  ) as price_date
```

### Impact
- **Before**: 2 queries (or 4 if using `getHistoricalDataWithMetadata`)
- **After**: 1 query
- **Reduction**: 50-75% fewer queries
- **Performance**: ~2× faster

### Usage Frequency
- Called by: Price fetch operations, "Update All" button
- **Estimated calls per user**: 1-10 per session
- **At 10,000 users**: 10,000-100,000 calls → **5,000-50,000 queries saved**

---

## 3. Portfolio Update Section - N Queries → 1 Query

### Current Implementation

**Location**: `components/portfolio/portfolio-update-section.tsx:33-155`

```typescript
// Makes 1 query per holding (N queries total)
const loadPromises = holdingsToLoad.map(async (holding) => {
  const response = await fetch(
    `/api/historical-data?assetType=${assetType}&symbol=${symbol}&limit=5`
  )
  // ... process result
})
```

### Optimized Implementation

**Batch query for multiple holdings:**
```sql
SELECT 
  asset_type,
  symbol,
  date, open, high, low, close, volume,
  ROW_NUMBER() OVER (PARTITION BY asset_type, symbol ORDER BY date DESC) as rn
FROM historical_price_data
WHERE (asset_type, symbol) IN (
  ('crypto', 'BTC'),
  ('crypto', 'ETH'),
  ('us-equity', 'AAPL'),
  -- ... all holdings
)
AND rn <= 5
ORDER BY asset_type, symbol, date DESC
```

**Or use UNION ALL for simpler compatibility:**
```sql
-- For each holding, get latest 5 records
(SELECT asset_type, symbol, date, close, ... 
 FROM historical_price_data 
 WHERE asset_type = 'crypto' AND symbol = 'BTC' 
 ORDER BY date DESC LIMIT 5)
UNION ALL
(SELECT asset_type, symbol, date, close, ... 
 FROM historical_price_data 
 WHERE asset_type = 'crypto' AND symbol = 'ETH' 
 ORDER BY date DESC LIMIT 5)
-- ... repeat for each holding
ORDER BY asset_type, symbol, date DESC
```

**Better: Use array parameters (PostgreSQL 9.4+):**
```sql
SELECT 
  asset_type,
  symbol,
  date, open, high, low, close, volume,
  ROW_NUMBER() OVER (PARTITION BY asset_type, symbol ORDER BY date DESC) as rn
FROM historical_price_data
WHERE (asset_type, symbol) = ANY($1::text[][])  -- Array of (asset_type, symbol) pairs
QUALIFY rn <= 5  -- PostgreSQL 12+ (or use subquery for older versions)
ORDER BY asset_type, symbol, date DESC
```

### Impact
- **Before**: N queries (1 per holding)
- **After**: 1 query (all holdings)
- **Reduction**: (N-1)/N × 100% fewer queries
- **Performance**: ~N× faster for N holdings

### Usage Frequency
- Called by: Portfolio dashboard on load
- **Average holdings per user**: 10
- **At 10,000 users**: 100,000 queries → **90,000 queries saved** (1 query instead of 10)

---

## 4. Chart Components - Multiple Holdings → Batched Query

### Current Implementation

**Location**: 
- `components/portfolio/crypto-portfolio-chart.tsx`
- `components/portfolio/us-equity-portfolio-chart.tsx`
- `components/portfolio/pk-equity-portfolio-chart.tsx`
- `components/portfolio/metals-portfolio-chart.tsx`

```typescript
// Makes 1 call to getHistoricalDataWithMetadata per holding
const fetchPromises = holdings.map(async (holding) => {
  const response = await deduplicatedFetch(
    `/api/historical-data?assetType=${assetType}&symbol=${symbol}`
  )
  // ... process result
})
```

### Optimized Implementation

**Create new function: `getMultipleHistoricalData`**
```typescript
export async function getMultipleHistoricalData(
  holdings: Array<{ assetType: string; symbol: string }>,
  startDate?: string,
  endDate?: string
): Promise<Map<string, HistoricalPriceRecord[]>> {
  // Single query for all holdings
  const query = `
    SELECT 
      asset_type,
      symbol,
      date, open, high, low, close, volume, adjusted_close, change_pct
    FROM historical_price_data
    WHERE (asset_type, symbol) = ANY($1::text[][])
      AND ($2::date IS NULL OR date >= $2::date)
      AND ($3::date IS NULL OR date <= $3::date)
    ORDER BY asset_type, symbol, date ASC
  `
  
  const pairs = holdings.map(h => [h.assetType, h.symbol.toUpperCase()])
  const result = await client.query(query, [pairs, startDate, endDate])
  
  // Group by (assetType, symbol)
  const dataMap = new Map<string, HistoricalPriceRecord[]>()
  for (const row of result.rows) {
    const key = `${row.asset_type}:${row.symbol}`
    if (!dataMap.has(key)) {
      dataMap.set(key, [])
    }
    dataMap.get(key)!.push({
      date: formatDate(row.date),
      open: row.open ? parseFloat(row.open) : null,
      high: row.high ? parseFloat(row.high) : null,
      low: row.low ? parseFloat(row.low) : null,
      close: parseFloat(row.close),
      volume: row.volume ? parseFloat(row.volume) : null,
      adjusted_close: row.adjusted_close ? parseFloat(row.adjusted_close) : null,
      change_pct: row.change_pct ? parseFloat(row.change_pct) : null,
    })
  }
  
  return dataMap
}
```

### Impact
- **Before**: N queries (1 per holding, each making 3 queries = 3N total)
- **After**: 1 query (all holdings)
- **Reduction**: (3N-1)/3N × 100% fewer queries
- **Performance**: ~3N× faster for N holdings

### Usage Frequency
- Called by: All portfolio chart components
- **Average holdings per chart**: 5-10
- **At 10,000 users**: 50,000-100,000 queries → **49,000-99,000 queries saved**

---

## 5. Metadata Queries - Can Be Combined with Main Query

### Current Implementation

**Location**: `lib/portfolio/db-client.ts:insertHistoricalData`

```typescript
// Query 1: Get current total_records
const metadataResult = await client.query(
  `SELECT total_records 
   FROM historical_data_metadata 
   WHERE asset_type = $1 AND symbol = $2`,
  [assetType, symbol.toUpperCase()]
)

// Query 2: Update metadata
await client.query(
  `INSERT INTO historical_data_metadata 
   (asset_type, symbol, last_stored_date, total_records, source, last_updated)
   VALUES ($1, $2, $3, $4, $5, NOW())
   ON CONFLICT (asset_type, symbol)
   DO UPDATE SET ...`,
  [...]
)
```

### Optimized Implementation

**Use RETURNING clause:**
```sql
WITH updated_metadata AS (
  INSERT INTO historical_data_metadata 
  (asset_type, symbol, last_stored_date, total_records, source, last_updated)
  VALUES ($1, $2, $3, $4, $5, NOW())
  ON CONFLICT (asset_type, symbol)
  DO UPDATE SET 
    last_stored_date = EXCLUDED.last_stored_date,
    total_records = COALESCE(historical_data_metadata.total_records, 0) + $6,
    source = EXCLUDED.source,
    last_updated = NOW()
  RETURNING total_records
)
SELECT total_records FROM updated_metadata
```

**Or use subquery to get current total:**
```sql
INSERT INTO historical_data_metadata 
(asset_type, symbol, last_stored_date, total_records, source, last_updated)
VALUES (
  $1, $2, $3,
  COALESCE(
    (SELECT total_records FROM historical_data_metadata 
     WHERE asset_type = $1 AND symbol = $2),
    0
  ) + $4,  -- Increment by number of new records
  $5, NOW()
)
ON CONFLICT (asset_type, symbol)
DO UPDATE SET 
  last_stored_date = EXCLUDED.last_stored_date,
  total_records = COALESCE(historical_data_metadata.total_records, 0) + $4,
  source = EXCLUDED.source,
  last_updated = NOW()
```

### Impact
- **Before**: 2 queries
- **After**: 1 query
- **Reduction**: 50% fewer queries
- **Performance**: ~2× faster

### Usage Frequency
- Called by: Data insertion operations
- **Estimated calls**: 100-1,000 per day (background updates)
- **Impact**: Lower, but still beneficial

---

## Summary of Optimizations

| Optimization | Current Queries | Optimized Queries | Reduction | Impact |
|-------------|----------------|-------------------|-----------|--------|
| `getHistoricalDataWithMetadata` | 3 | 1 | 66% | **HIGH** |
| Price routes | 2-4 | 1 | 50-75% | **MEDIUM** |
| Portfolio update section | N | 1 | (N-1)/N | **HIGH** |
| Chart components | 3N | 1 | (3N-1)/3N | **HIGH** |
| Metadata updates | 2 | 1 | 50% | **LOW** |

### Total Estimated Impact

**At 10,000 concurrent users:**
- **Current queries**: ~500,000-1,000,000 per hour
- **After optimization**: ~100,000-200,000 per hour
- **Reduction**: **80% fewer queries**
- **Performance improvement**: **5× faster**
- **Database connection pool**: Can handle 5× more users with same pool size

---

## Implementation Priority

1. **Priority 1**: `getHistoricalDataWithMetadata` (3→1 query)
   - Highest impact
   - Used everywhere
   - Easy to implement

2. **Priority 2**: Portfolio update section batching (N→1 query)
   - High impact
   - Used on every portfolio page load
   - Medium complexity

3. **Priority 3**: Chart components batching (3N→1 query)
   - High impact
   - Used on every chart render
   - Medium complexity

4. **Priority 4**: Price routes (2→1 query)
   - Medium impact
   - Used less frequently
   - Easy to implement

5. **Priority 5**: Metadata updates (2→1 query)
   - Low impact
   - Used in background operations
   - Easy to implement

---

## Next Steps

1. Implement Priority 1 optimization (`getHistoricalDataWithMetadata`)
2. Test with production-like data volumes
3. Monitor query performance improvements
4. Implement Priority 2-3 optimizations
5. Add query result caching (Redis) for frequently accessed data

