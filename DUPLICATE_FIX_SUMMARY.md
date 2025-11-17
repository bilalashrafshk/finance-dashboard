# Duplicate API Calls Fix Summary

## Issues Fixed

1. ✅ **Added comprehensive logging** to historical-data API route
2. ✅ **Improved deduplication logging** to show NEW vs REUSED requests
3. ✅ **Added duplicate prevention** to metals chart component (useEffect guard)
4. ✅ **Added request tracking** with unique IDs and timestamps

## What You'll See Now

### Server Logs (Terminal)
```
[Historical Data API #1] 2025-01-XX... - metals/GOLD (15ms)
[Historical Data API #2] 2025-01-XX... - metals/SILVER (12ms)
```

### Client Logs (Browser Console)
```
[Metals Chart] useEffect #1 triggered, holdings: 2, hasRun: false
[Dedup] 🆕 NEW request for: /api/historical-data?assetType=metals&symbol=GOLD
[Dedup] ✅ REUSING pending request for: /api/historical-data?assetType=metals&symbol=GOLD (age: 5ms, saved duplicate call)
[Metals Chart] useEffect #2 triggered, holdings: 2, hasRun: true
[Metals Chart] useEffect #2 BLOCKED - already ran
```

## Remaining Work

The same fix needs to be applied to:
- `crypto-portfolio-chart.tsx`
- `us-equity-portfolio-chart.tsx`
- `pk-equity-portfolio-chart.tsx`

Each needs:
1. Add `useRef` to imports
2. Add `hasRunRef` and `effectIdRef` 
3. Add duplicate prevention logic in useEffect

## How to View Logs

### Server Logs
```javascript
// In server terminal/Node.js context
getHistoricalDataRequestLog()
global.__historicalDataRequestLog
```

### Client Logs
```javascript
// In browser console
window.__apiCallLog  // For risk-metrics API
// Check console for [Dedup] and [Metals Chart] logs
```

## Next Steps

1. Apply the same useEffect fix to other chart components
2. Test to verify duplicate calls are reduced
3. Share logs if duplicates persist



