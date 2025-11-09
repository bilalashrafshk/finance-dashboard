# Scalability Analysis: 10,000 Concurrent Users

## Executive Summary

**Current Status: ❌ NOT SCALABLE**

The application in its current state **will fail** with 10,000 concurrent users due to:
1. Client-side data fetching directly to Binance API
2. No caching mechanism
3. Binance API rate limiting
4. Heavy client-side computation
5. No server-side API layer

---

## Critical Issues

### 1. Client-Side Data Fetching ⚠️ **CRITICAL**

**Problem:**
- Every user makes direct API calls to Binance from their browser
- Each user fetches ~3,500+ historical records via multiple paginated requests
- Each user makes **4-8 API calls** to Binance (2 symbols × 2-4 paginated requests each)

**Impact with 10,000 users:**
- **40,000 - 80,000 API calls** to Binance per page load
- Binance rate limits: **1,200 requests per minute per IP** (weighted)
- **Result**: Most users will get rate-limited and see errors

**Code Location:**
- `lib/eth-analysis.ts` - `fetchEthHistoricalData()` function
- Called from `components/eth-risk-dashboard.tsx` on every page load

### 2. No Caching Mechanism ⚠️ **CRITICAL**

**Problem:**
- No server-side caching
- No client-side caching (localStorage/IndexedDB)
- Every page load triggers a full data fetch
- Historical data doesn't change frequently (only latest day updates)

**Impact:**
- Redundant API calls for the same data
- Wasted bandwidth and API quota
- Slower load times

### 3. Binance API Rate Limits ⚠️ **CRITICAL**

**Binance Public API Limits:**
- **1,200 requests per minute** (weighted)
- **10 orders per second** (not applicable here)
- IP-based rate limiting

**With 10,000 concurrent users:**
- If all users load within 1 minute: **40,000-80,000 requests**
- Rate limit exceeded by **33-66x**
- Most users will receive `429 Too Many Requests` errors

### 4. Heavy Client-Side Computation ⚠️ **MODERATE**

**Problem:**
- All risk calculations happen in the browser
- Each user processes ~500 weekly data points
- Complex calculations: fair value bands, percentile ranks, peak/trough detection

**Impact:**
- Slower initial load times
- Higher client CPU usage
- Battery drain on mobile devices
- But: This is less critical than API rate limiting

**Code Location:**
- `lib/algorithms/*` - All calculation functions
- `lib/eth-analysis.ts` - `calculateRiskMetrics()`

### 5. No Server-Side API Layer ⚠️ **CRITICAL**

**Problem:**
- No Next.js API routes (`/app/api/` or `/pages/api/`)
- All data fetching happens client-side
- No ability to cache, rate limit, or batch requests

**Impact:**
- Cannot implement server-side caching
- Cannot implement request batching
- Cannot implement rate limiting
- Cannot use server-side rendering for initial data

---

## Performance Metrics (Current Architecture)

### Per User Request:
- **API Calls**: 4-8 requests to Binance
- **Data Fetched**: ~3,500 daily records × 2 symbols = ~7,000 records
- **Processing Time**: ~2-5 seconds (depending on network)
- **Data Processed**: ~500 weekly records after resampling
- **Memory Usage**: ~2-5 MB per user session

### With 10,000 Concurrent Users:
- **Total API Calls**: 40,000 - 80,000 requests
- **Bandwidth**: ~70 GB of data transfer
- **Binance Rate Limit**: **EXCEEDED BY 33-66x**
- **Success Rate**: **< 1%** (most will fail)

---

## Recommended Solutions

### Solution 1: Server-Side API Route with Caching (Recommended) ⭐

**Implementation:**
1. Create Next.js API route: `/app/api/risk-metrics/route.ts`
2. Implement server-side caching (Redis or in-memory)
3. Cache processed results for 1-5 minutes
4. Fetch from Binance only when cache expires

**Benefits:**
- **99% reduction** in Binance API calls (1 request per cache period vs 10,000)
- **Faster response times** (cached data served instantly)
- **Rate limit compliance** (only 1-2 requests per minute to Binance)
- **Cost reduction** (less bandwidth, fewer API calls)

**Estimated Impact:**
- API calls: **40,000-80,000 → 1-2 per minute**
- Success rate: **< 1% → 99.9%**
- Average load time: **2-5s → 50-200ms** (cached)

### Solution 2: Incremental Data Updates

**Implementation:**
1. Cache full historical dataset (rarely changes)
2. Only fetch latest day/hour for updates
3. Merge incremental updates with cached historical data

**Benefits:**
- Further reduces API calls
- Faster updates (only fetch latest data)
- Maintains data freshness

### Solution 3: Client-Side Caching

**Implementation:**
1. Use `localStorage` or `IndexedDB` to cache results
2. Cache for 1-5 minutes
3. Show cached data immediately, update in background

**Benefits:**
- Improves perceived performance
- Reduces redundant requests for same user
- Works offline (with stale data)

**Limitations:**
- Doesn't solve rate limiting (still makes API calls)
- Each user still fetches data independently
- **Not sufficient alone** - needs Solution 1

### Solution 4: Server-Side Rendering (SSR) or Static Generation

**Implementation:**
1. Pre-fetch data at build time or on-demand
2. Use Next.js `getServerSideProps` or Server Components
3. Cache at CDN level (Vercel Edge, Cloudflare)

**Benefits:**
- Faster initial page load
- Better SEO
- Reduced client-side computation
- CDN caching for global distribution

### Solution 5: Database for Historical Data

**Implementation:**
1. Store historical data in database (PostgreSQL, MongoDB)
2. Update database via scheduled job (cron)
3. API route reads from database instead of Binance

**Benefits:**
- Complete independence from Binance rate limits
- Faster queries (database vs API)
- Historical data preservation
- Can implement complex queries

**Trade-offs:**
- Requires database infrastructure
- Requires data sync job
- More complex architecture

---

## Recommended Architecture (Hybrid Approach)

### Phase 1: Quick Wins (1-2 days)
1. ✅ Add server-side API route with in-memory caching
2. ✅ Implement 5-minute cache TTL
3. ✅ Move data fetching to server-side

### Phase 2: Optimization (3-5 days)
1. ✅ Add Redis for distributed caching
2. ✅ Implement incremental updates (only fetch latest day)
3. ✅ Add client-side caching (localStorage)

### Phase 3: Production Ready (1-2 weeks)
1. ✅ Add database for historical data
2. ✅ Implement scheduled data sync job
3. ✅ Add CDN caching (Vercel Edge/Cloudflare)
4. ✅ Add monitoring and alerting

---

## Implementation Example

### Step 1: Create API Route

```typescript
// app/api/risk-metrics/route.ts
import { NextResponse } from 'next/server'
import { calculateRiskMetrics } from '@/lib/eth-analysis'
import { DEFAULT_FAIR_VALUE_BAND_PARAMS, DEFAULT_RISK_WEIGHTS } from '@/lib/config/app.config'

// Simple in-memory cache (use Redis in production)
let cache: {
  data: any
  timestamp: number
} | null = null

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cutoffDate = searchParams.get('cutoffDate')
  const sValWeight = searchParams.get('sValWeight')
  const sRelWeight = searchParams.get('sRelWeight')

  // Check cache
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data)
  }

  // Fetch fresh data
  try {
    const riskWeights = sValWeight && sRelWeight
      ? { sValWeight: parseFloat(sValWeight), sRelWeight: parseFloat(sRelWeight) }
      : DEFAULT_RISK_WEIGHTS

    const metrics = await calculateRiskMetrics(
      DEFAULT_FAIR_VALUE_BAND_PARAMS,
      cutoffDate ? new Date(cutoffDate) : null,
      riskWeights
    )

    // Update cache
    cache = {
      data: metrics,
      timestamp: Date.now()
    }

    return NextResponse.json(metrics)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch risk metrics' },
      { status: 500 }
    )
  }
}
```

### Step 2: Update Client Component

```typescript
// components/eth-risk-dashboard.tsx
const fetchData = async () => {
  try {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (sValCutoffDate) params.set('cutoffDate', sValCutoffDate)
    if (riskWeights.sValWeight) params.set('sValWeight', riskWeights.sValWeight.toString())
    if (riskWeights.sRelWeight) params.set('sRelWeight', riskWeights.sRelWeight.toString())

    const response = await fetch(`/api/risk-metrics?${params}`)
    if (!response.ok) throw new Error('Failed to fetch data')
    
    const metrics = await response.json()
    setRiskMetrics(metrics)
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to fetch data')
  } finally {
    setLoading(false)
  }
}
```

---

## Cost Analysis

### Current Architecture (10,000 users):
- **Binance API**: Free (but rate limited)
- **Bandwidth**: ~70 GB per concurrent load
- **Success Rate**: < 1%
- **User Experience**: Poor (most users see errors)

### With Caching (10,000 users):
- **Binance API**: 1-2 requests per 5 minutes
- **Bandwidth**: ~140 MB per concurrent load (99.8% reduction)
- **Success Rate**: 99.9%
- **User Experience**: Excellent
- **Infrastructure Cost**: ~$10-50/month (Redis/Vercel)

---

## Monitoring Recommendations

1. **API Rate Limit Monitoring**
   - Track Binance API response codes
   - Alert on 429 (Too Many Requests) errors

2. **Cache Hit Rate**
   - Monitor cache hit/miss ratio
   - Target: > 95% hit rate

3. **Response Times**
   - Track API response times
   - Target: < 200ms for cached, < 5s for fresh

4. **Error Rates**
   - Monitor error rates
   - Target: < 0.1%

---

## Conclusion

**Current State**: The application will **fail catastrophically** with 10,000 concurrent users due to Binance API rate limiting.

**Recommended Action**: Implement server-side API route with caching (Solution 1) as a **minimum requirement**. This can be done in 1-2 days and will solve 99% of the scalability issues.

**Long-term**: Consider implementing a database-backed solution (Solution 5) for production scale and reliability.

---

**Priority**: 🔴 **CRITICAL** - Must fix before production deployment with high traffic.

