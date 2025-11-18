# API Call Logging Guide

## How to View API Call Logs

### Client-Side Logs (Browser Console)

1. **Open Browser Console**:
   - Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows/Linux)
   - Go to the "Console" tab

2. **View All Logs**:
   ```javascript
   // View all API calls as a table
   getApiCallLog()
   
   // Or access the raw log array
   window.__apiCallLog
   ```

3. **Clear Logs**:
   ```javascript
   clearApiCallLog()
   ```

### Server-Side Logs (Terminal/Console)

Server logs appear in the terminal where you ran `npm run dev`.

Look for logs like:
```
[API Route #1] 2025-01-XX... - Cache: HIT (5ms) | Key: {...}
[API Route #2] 2025-01-XX... - Cache: MISS (fetch: 2500ms, total: 2510ms) | Key: {...}
```

### View Server Logs Programmatically

If you have access to the server console, you can also use:
```javascript
// In Node.js/server context
getApiRequestLog()
global.__apiRequestLog
```

## What the Logs Show

### Client Logs (`window.__apiCallLog`)
- `id`: Unique request ID
- `timestamp`: When the call was made
- `action`: What happened (STARTING, COMPLETED, BLOCKED, ERROR, etc.)
- `params`: Request URL/parameters (if applicable)

### Server Logs (`global.__apiRequestLog`)
- `id`: Unique request ID
- `timestamp`: When the request was received
- `cacheKey`: The cache key used
- `cacheStatus`: HIT or MISS with timing information

## Example Log Output

### Client Console:
```
[API Call #1] 2025-01-XX... - COMPONENT MOUNTED - useEffect triggered
[API Call #2] 2025-01-XX... - STARTING Params: /api/risk-metrics?bandParams={...}...
[API Call #3] 2025-01-XX... - BLOCKED - Request already in progress
[API Call #4] 2025-01-XX... - COMPLETED in 2500ms Cache: MISS
[API Call #5] 2025-01-XX... - SUCCESS - Data loaded
```

### Server Console:
```
[API Route #1] 2025-01-XX... - Cache: MISS (fetch: 2500ms, total: 2510ms) | Key: {"bandParams":"{...}","cutoffDate":"null","riskWeights":"{...}"}...
[API Route #1] Data fetched in 2500ms, total response time: 2510ms
[API Route #2] 2025-01-XX... - Cache: HIT (5ms) | Key: {"bandParams":"{...}","cutoffDate":"null","riskWeights":"{...}"}...
```

## Debugging Duplicate Calls

If you see duplicate calls, check:

1. **Client Logs**: Look for multiple "STARTING" entries with same/similar timestamps
2. **Server Logs**: Look for multiple requests with same cache key
3. **Blocked Calls**: Look for "BLOCKED - Request already in progress" - these are prevented duplicates

## Sending Logs

To send logs for debugging:

1. **Copy Client Logs**:
   ```javascript
   JSON.stringify(window.__apiCallLog, null, 2)
   ```

2. **Copy Server Logs**:
   - Copy the terminal output
   - Or if accessible: `JSON.stringify(global.__apiRequestLog, null, 2)`

3. **Include**:
   - Browser console logs
   - Server terminal logs
   - Network tab screenshot (showing duplicate requests)

## Features

- ✅ **Duplicate Prevention**: Blocks concurrent requests
- ✅ **Request Tracking**: Every API call is logged with unique ID
- ✅ **Timing Information**: Shows how long each request takes
- ✅ **Cache Status**: Shows if cache was HIT or MISS
- ✅ **Easy Access**: Logs available via `window.__apiCallLog` and `global.__apiRequestLog`





