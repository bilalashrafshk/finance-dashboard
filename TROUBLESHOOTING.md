# Troubleshooting: Slow Loading Times

## Issue: Dashboard Takes Forever to Load

### Root Cause

The first load is slow because:
1. **Cache is empty** on first request
2. **Needs to fetch from Binance API** (~3,500 historical records)
3. **Multiple API calls** (4-8 requests to Binance)
4. **Processing time** (calculating metrics from ~3,500 records)

**Expected Time**: 30-90 seconds on first load

### How to Check What's Happening

1. **Open Browser Console** (F12 or Cmd+Option+I)
2. **Look for logs**:
   - `[Client] Fetching data from API...`
   - `[API] Cache miss - fetching fresh data from Binance...`
   - `[Data Fetch] Starting to fetch ETH/BTC and BTC/USDT data...`
   - `[Data Fetch] ETHBTC: Batch 1 fetched X records in Yms`
   - `[Data Fetch] BTCUSDT: Batch 1 fetched X records in Yms`

3. **Check Network Tab**:
   - Look for `/api/risk-metrics` request
   - Check if it's pending or completed
   - Check response time

### Common Issues

#### 1. **Binance API Rate Limiting**
**Symptoms:**
- Request hangs for a long time
- Error: `429 Too Many Requests`
- Error: `Request timeout`

**Solution:**
- Wait a few minutes and try again
- The cache will help on subsequent loads

#### 2. **Network Issues**
**Symptoms:**
- Request times out
- Error: `Failed to fetch`

**Solution:**
- Check internet connection
- Try again later
- Check if Binance API is accessible

#### 3. **First Load (Expected)**
**Symptoms:**
- Takes 30-90 seconds
- Shows "Loading risk metrics..."

**Solution:**
- This is **normal** on first load
- Subsequent loads will be **much faster** (cached)
- Wait for it to complete

### Solutions

#### Immediate Fixes

1. **Wait for First Load to Complete**
   - First load takes 30-90 seconds
   - Once cached, subsequent loads are < 1 second
   - **Don't refresh** during first load

2. **Check Console for Errors**
   - Open browser console (F12)
   - Look for error messages
   - Share error messages if issue persists

3. **Check Server Logs**
   - If running locally, check terminal/console
   - Look for `[API]` and `[Data Fetch]` logs
   - Check for error messages

#### Long-term Solutions

1. **Pre-warm Cache** (Recommended)
   - Create a script to fetch data on server startup
   - Ensures cache is ready for first user
   - See `PREWARM_CACHE.md` for implementation

2. **Database Storage** (Best for Production)
   - Store historical data in database
   - Only fetch latest day/hour
   - See `DATA_STORAGE_ANALYSIS.md` for details

3. **Optimize Binance API Calls**
   - Reduce number of requests
   - Use parallel requests where possible
   - Add retry logic

### Performance Expectations

| Scenario | Expected Time |
|---------|---------------|
| **First Load (Cache Miss)** | 30-90 seconds |
| **Cached Load (Cache Hit)** | < 1 second |
| **After 5 Minutes (Cache Expired)** | 30-90 seconds |

### Debugging Steps

1. **Check if it's a cache issue**:
   ```javascript
   // In browser console
   fetch('/api/risk-metrics?bandParams={...}&riskWeights={...}')
     .then(r => console.log('Cache:', r.headers.get('X-Cache')))
   ```

2. **Check server logs**:
   - Look for `[API]` logs
   - Check fetch times
   - Look for errors

3. **Test Binance API directly**:
   ```bash
   curl "https://api.binance.com/api/v3/klines?symbol=ETHBTC&interval=1d&limit=1000"
   ```

### If Still Not Working

1. **Check Network Tab**:
   - Is the request pending?
   - What's the status code?
   - Any error messages?

2. **Check Console**:
   - Any JavaScript errors?
   - Any network errors?
   - What do the logs say?

3. **Check Server**:
   - Is the server running?
   - Are there any errors in server logs?
   - Is the API route accessible?

### Quick Test

To test if the API is working:

```bash
# Test API endpoint
curl http://localhost:3002/api/risk-metrics?bandParams=%7B%7D&riskWeights=%7B%7D
```

Or open in browser:
```
http://localhost:3002/api/risk-metrics?bandParams={}&riskWeights={}
```

### Next Steps

If the issue persists:
1. Share the console logs
2. Share the network tab details
3. Share any error messages
4. Check if Binance API is accessible

---

## Expected Behavior

### First Load (Normal)
- ⏱️ **Time**: 30-90 seconds
- 📊 **What happens**: Fetches ~3,500 records from Binance
- 💾 **Cache**: Empty, will be populated
- ✅ **Result**: Data loads successfully

### Subsequent Loads (Fast)
- ⏱️ **Time**: < 1 second
- 📊 **What happens**: Reads from cache
- 💾 **Cache**: Hit (data < 5 minutes old)
- ✅ **Result**: Instant load

### After 5 Minutes (Cache Expired)
- ⏱️ **Time**: 30-90 seconds
- 📊 **What happens**: Fetches fresh data from Binance
- 💾 **Cache**: Expired, will be refreshed
- ✅ **Result**: Fresh data loads



