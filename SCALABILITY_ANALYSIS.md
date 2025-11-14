# Scalability Analysis: API & Database Call Patterns

## Executive Summary

**Current Status**: ⚠️ **NOT READY for tens of thousands of concurrent users**

The application has several scalability bottlenecks that would prevent it from handling 10,000+ concurrent users effectively. The primary concerns are:

1. **ETH Risk Dashboard** makes expensive external API calls on every page load
2. **In-memory caching** doesn't scale across multiple server instances
3. **Database connection pool** may be insufficient under high load
4. **No rate limiting** on external API calls (Binance, StockAnalysis, etc.)

---

## Detailed Analysis

### 1. ETH Risk Dashboard (`/` - Home Page)

#### Current Behavior
- **Fetches on every page load** via `useEffect` hook
- Makes **4-8+ API calls to Binance** on cache miss:
  - ETHBTC: ~4 paginated requests (1000 records each)
  - BTCUSDT: ~4 paginated requests (1000 records each)
  - Total: ~3,500 historical records fetched
- **Processing time**: 30-90 seconds on first load
- **Cached**: 5 minutes in-memory (per server instance)

#### Scalability Issues

**Problem 1: External API Calls on Every Cache Miss**
```
Scenario: 10,000 users visit homepage simultaneously
- Cache is empty (first load or cache expired)
- Each user triggers 4-8 Binance API calls
- Total: 40,000-80,000 Binance API requests
- Binance rate limit: ~1,200 requests/minute per IP
- Result: Rate limiting, timeouts, failures
```

**Problem 2: In-Memory Cache Doesn't Scale**
- Cache is per-server-instance (not shared)
- With multiple server instances (e.g., Vercel, load balancer):
  - Each instance has its own cache
  - Cache misses happen independently
  - No cache sharing = redundant API calls

**Problem 3: No Database Storage for Risk Metrics**
- Risk metrics are recalculated on every cache miss
- No persistent storage means:
  - Every server restart = cache cleared
  - Every new server instance = cold cache
  - No historical risk metrics stored

#### Estimated Load at Scale
```
10,000 concurrent users:
- Cache hit rate: ~80% (assuming 5-min TTL, users spread over time)
- Cache misses: 2,000 users
- Binance API calls: 8,000-16,000 requests
- Binance rate limit: 1,200 req/min
- Time to process: 6-13 minutes (if rate limited)
- Many users will timeout (3-minute timeout configured)
```

---

### 2. Portfolio Dashboard (`/portfolio`)

#### Current Behavior
- **No automatic fetching** on page load ✅
- Only fetches when user explicitly:
  - Clicks "Fetch Current Price" in Add Holding dialog
  - Clicks "Refresh Prices" button
  - Clicks "Update All" button
- Charts fetch historical data from **database** (not external APIs) ✅

#### Scalability Assessment: **GOOD**

**Strengths:**
1. No automatic API calls on page load
2. Database-first approach for historical data
3. User-initiated actions only
4. Request deduplication (5-second window) prevents duplicate calls

**Potential Issues:**
1. **Portfolio Update Section** makes 1 DB query per holding on load:
   ```
   User with 50 holdings = 50 DB queries on page load
   10,000 users with avg 10 holdings = 100,000 DB queries
   ```
   - However, these are simple indexed queries (fast)
   - Connection pool: 20 connections (may be insufficient)

2. **Chart Loading** makes multiple DB queries per chart:
   - Date range query
   - Latest dates query (for verification)
   - Per holding: 2 queries × N holdings = 2N queries
   - User with 10 holdings = 20 DB queries
   - 10,000 users = 200,000 DB queries (if all load charts)

---

### 3. Database Query Patterns

#### Connection Pool Configuration
```typescript
max: 20 // Maximum connections
idleTimeoutMillis: 30000
connectionTimeoutMillis: 10000
```

#### Query Patterns

**Historical Data Queries** (`getHistoricalDataWithMetadata`):
- Makes **2 queries** per call:
  1. `SELECT MIN(date), MAX(date)` - date range
  2. `SELECT date FROM ... ORDER BY date DESC LIMIT 5` - latest dates
  3. `SELECT * FROM ... WHERE ...` - actual data
- **Total: 3 queries per historical data fetch**

**Portfolio Update Section**:
- 1 query per holding (limit=5, latest records)
- User with 10 holdings = 10 queries

**Chart Components**:
- Each chart type (Crypto, US Equity, PK Equity, Metals) fetches per holding
- Parallel fetching (good), but still N queries per chart type

#### Scalability Concerns

**Problem 1: Connection Pool Size**
```
20 connections × 10ms avg query time = 200 requests/second max
10,000 concurrent users loading portfolio = 100,000+ queries
Result: Connection pool exhaustion, queued requests, timeouts
```

**Problem 2: Multiple Queries Per Operation**
- `getHistoricalDataWithMetadata` makes 3 queries when 1 optimized query could work
- No query batching for multiple holdings

**Problem 3: No Query Result Caching**
- Same historical data queried multiple times
- No Redis/memcached for frequently accessed data

---

### 4. External API Call Patterns

#### Binance API (ETH Risk Dashboard)
- **Rate Limit**: ~1,200 requests/minute per IP
- **Current Usage**: 4-8 requests per user on cache miss
- **Scalability**: ❌ **Will hit rate limits at scale**

#### StockAnalysis API (PK Equity, US Equity)
- **Rate Limit**: Unknown (not documented)
- **Current Usage**: 1 request per price fetch
- **Scalability**: ⚠️ **Unknown, but likely limited**

#### Investing.com API (Metals, Indices)
- **Client-side only** (Cloudflare protection)
- **Current Usage**: 1 request per price fetch (client-side)
- **Scalability**: ✅ **Distributed across user browsers** (good)

---

### 5. Caching Strategy

#### Current Implementation
- **Type**: In-memory cache (per server instance)
- **TTL**: 5 minutes (risk metrics), 1-3 minutes (prices)
- **Scope**: Per server instance (not shared)

#### Scalability Issues

**Problem 1: No Shared Cache**
```
Server Instance 1: Cache miss → Fetch from Binance
Server Instance 2: Cache miss → Fetch from Binance (duplicate!)
Server Instance 3: Cache miss → Fetch from Binance (duplicate!)
```
- With 10 server instances, cache miss = 10× redundant API calls

**Problem 2: Cache Invalidation**
- No cache invalidation strategy
- Cache expires independently per instance
- No coordination between instances

**Problem 3: Memory Limits**
- In-memory cache grows unbounded (with cleanup, but still)
- No memory limits or eviction policies
- Risk of memory leaks at scale

---

## Recommendations for Scaling to 10,000+ Users

### Priority 1: Critical (Must Fix)

#### 1.1 Implement Shared Cache (Redis)
```typescript
// Replace in-memory cache with Redis
- Shared across all server instances
- Persistent (survives server restarts)
- Better TTL management
- Distributed locking for cache stampede prevention
```

**Impact**: Reduces external API calls by 90%+ at scale

#### 1.2 Store Risk Metrics in Database
```sql
CREATE TABLE risk_metrics_cache (
  cache_key VARCHAR(255) PRIMARY KEY,
  metrics JSONB,
  created_at TIMESTAMP,
  expires_at TIMESTAMP
);
```

**Impact**: Eliminates redundant Binance API calls

#### 1.3 Increase Database Connection Pool
```typescript
max: 100 // Increase from 20
// Or use connection pooling service (PgBouncer)
```

**Impact**: Handles 5× more concurrent queries

#### 1.4 Optimize Database Queries
- Combine 3 queries in `getHistoricalDataWithMetadata` into 1
- Add query result caching (Redis)
- Batch queries for multiple holdings

**Impact**: Reduces DB load by 60%+

### Priority 2: High (Should Fix)

#### 2.1 Implement Rate Limiting
```typescript
// Rate limit external API calls
- Binance: 1,200 req/min max
- Queue requests if limit exceeded
- Exponential backoff on rate limit errors
```

**Impact**: Prevents API bans and improves reliability

#### 2.2 Add Background Job for Risk Metrics
```typescript
// Cron job: Update risk metrics every 5 minutes
// Store in database
// API route reads from database (not Binance)
```

**Impact**: Eliminates user-facing Binance API calls

#### 2.3 Implement CDN/Edge Caching
```typescript
// Cache static risk metrics at edge (Vercel Edge, Cloudflare)
// TTL: 5 minutes
// Reduces server load
```

**Impact**: 80%+ of requests served from edge

### Priority 3: Medium (Nice to Have)

#### 3.1 Add Query Batching
```typescript
// Batch multiple holdings into single query
SELECT * FROM historical_price_data
WHERE (asset_type, symbol) IN (('crypto', 'BTC'), ('crypto', 'ETH'), ...)
```

**Impact**: Reduces DB queries by 50%+

#### 3.2 Implement Request Queuing
```typescript
// Queue expensive operations (Binance fetches)
// Process in background
// Return cached/partial results immediately
```

**Impact**: Better user experience, prevents timeouts

#### 3.3 Add Monitoring & Alerting
```typescript
// Track:
- API call rates
- Cache hit rates
- DB connection pool usage
- Response times
```

**Impact**: Early detection of scaling issues

---

## Estimated Capacity (Current vs. Recommended)

### Current Capacity
- **Concurrent Users**: ~100-200 (before rate limits hit)
- **Requests/Second**: ~50-100
- **Database Connections**: 20 (bottleneck)
- **External API Calls**: Unbounded (will hit rate limits)

### Recommended Capacity (After Fixes)
- **Concurrent Users**: 10,000+ ✅
- **Requests/Second**: 1,000+
- **Database Connections**: 100+ (or connection pooling service)
- **External API Calls**: Rate limited, queued, cached

---

## Cost Implications

### Current (At Scale)
- **Binance API**: Free (but rate limited)
- **Database**: Pay per query (100,000+ queries/day = expensive)
- **Server**: High CPU/memory usage (many API calls)

### Recommended (At Scale)
- **Redis**: ~$10-50/month (shared cache)
- **Database**: Reduced queries (60%+ reduction)
- **Server**: Lower CPU/memory (cached responses)
- **CDN**: ~$5-20/month (edge caching)

**Total Additional Cost**: ~$15-70/month
**Savings**: Reduced database costs, better reliability

---

## Conclusion

The application is **not ready for 10,000+ concurrent users** in its current state. The primary bottlenecks are:

1. ❌ **ETH Risk Dashboard** makes expensive external API calls on every page load
2. ❌ **In-memory caching** doesn't scale across multiple server instances
3. ❌ **Database connection pool** too small (20 connections)
4. ❌ **No rate limiting** on external API calls

**Recommended Action Plan:**
1. Implement Redis for shared caching (Priority 1)
2. Store risk metrics in database (Priority 1)
3. Increase database connection pool (Priority 1)
4. Optimize database queries (Priority 1)
5. Add rate limiting (Priority 2)
6. Background job for risk metrics (Priority 2)

With these changes, the application should be able to handle **10,000+ concurrent users** effectively.
