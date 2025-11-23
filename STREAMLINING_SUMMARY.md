# API Routes Streamlining Summary

## Completed Changes

### 1. Created Unified API Routes
All price routes now follow a unified pattern with support for:
- Current price queries (default)
- Specific date queries (`?date=YYYY-MM-DD`)
- Date range queries (`?startDate=...&endDate=...`)
- Force refresh (`?refresh=true`)

**New/Updated Routes:**
- ✅ `/api/crypto/price` - Unified crypto prices (replaces `/api/binance/price`)
- ✅ `/api/pk-equity/price` - Unified PK equity prices (replaces `/api/psx/price`)
- ✅ `/api/us-equity/price` - Unified US equity prices (updated)
- ✅ `/api/metals/price` - Unified metals prices (updated, returns `needsClientFetch`)
- ✅ `/api/indices/price` - New unified indices route (SPX500, KSE100)

### 2. Removed Server-Side Investing.com API Usage
- ✅ Updated `lib/portfolio/metals-api.ts` - Removed server-side fetch call
- ✅ Updated all type imports to use `investing-client-api.ts` instead of `investing-api.ts`
- ✅ Server-side investing API functions are no longer used (Cloudflare blocks them)

### 3. Client-Side Fetch Pattern
For metals and indices (Cloudflare-protected):
- API route checks database first
- If data not found, returns `{ needsClientFetch: true, instrumentId: "..." }`
- Client must:
  1. Call `getLatestPriceFromInvestingClient(instrumentId)`
  2. Store result via `POST /api/historical-data/store`
  3. Re-request API route to get stored data

### 4. Database Integration
All routes now:
- Check database first (if market closed and today's data exists)
- Automatically store fetched data in database (background, non-blocking)
- Support historical data queries from database

## Files Modified

### New API Routes
- `app/api/crypto/price/route.ts`
- `app/api/pk-equity/price/route.ts`
- `app/api/us-equity/price/route.ts` (updated)
- `app/api/metals/price/route.ts` (updated)
- `app/api/indices/price/route.ts` (new)

### Updated Files
- `lib/portfolio/metals-api.ts` - Removed server-side fetch
- `app/api/historical-data/route.ts` - Updated type imports
- `app/api/historical-data/store/route.ts` - Updated type imports
- `lib/portfolio/db-to-chart-format.ts` - Updated type imports
- `components/portfolio/metals-portfolio-chart.tsx` - Updated type imports

### Documentation
- `API_ROUTES_REFERENCE.md` - Comprehensive API reference
- `scripts/test-api-routes.js` - Test script for routes

## Next Steps (TODO)

### 5. Update Client-Side Implementations
Need to update components to use unified routes:
- `components/portfolio/add-holding-dialog.tsx`
- `components/portfolio/portfolio-dashboard.tsx`
- `components/portfolio/portfolio-update-section.tsx`

### 6. Testing
- Run test script: `node scripts/test-api-routes.js`
- Test each route manually
- Verify client-side fetch flow for metals/indices

## Backward Compatibility

### Old Routes (Still Work, But Deprecated)
- `/api/binance/price` - Use `/api/crypto/price` instead
- `/api/psx/price` - Use `/api/pk-equity/price` instead

These can be maintained as aliases or removed in future.

## Notes

- Server-side `investing-api.ts` file still exists but functions are deprecated
- Types moved to `investing-client-api.ts` (shared between client and server)
- All routes now support date ranges for historical data queries
- Database storage is automatic for all fetched data






