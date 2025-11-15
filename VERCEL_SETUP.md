# Vercel Deployment Setup Guide

## Required Environment Variables

### 1. Database Connection (REQUIRED)

The portfolio requires a PostgreSQL database connection. Add this to your Vercel project:

**In Vercel Dashboard:**
1. Go to your project settings
2. Navigate to **Environment Variables**
3. Add one of the following:

```
DATABASE_URL=postgresql://neondb_owner:npg_IJRM7Z3bivKr@ep-ancient-lake-a11r3s06-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

**OR**

```
POSTGRES_URL=postgresql://neondb_owner:npg_IJRM7Z3bivKr@ep-ancient-lake-a11r3s06-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

**Important:** 
- Add this to **all environments** (Production, Preview, Development)
- Make sure to use the **pooler** connection string (not the direct connection) for better performance

## Database Schema Setup

Before the portfolio can work, you need to initialize the database tables:

1. **Go to your Neon Console:** https://console.neon.tech
2. **Open SQL Editor**
3. **Copy the contents** of `lib/portfolio/db-schema.sql`
4. **Paste and execute** the SQL in the Neon SQL Editor

This creates the required tables:
- `historical_price_data` - Stores OHLCV price data
- `historical_data_metadata` - Tracks latest stored dates

## API Routes

All API routes are automatically deployed with your Next.js app. No additional configuration needed:

✅ `/api/crypto/price` - Crypto prices (Binance)
✅ `/api/pk-equity/price` - Pakistan equity prices (StockAnalysis.com)
✅ `/api/us-equity/price` - US equity prices (StockAnalysis.com)
✅ `/api/metals/price` - Metals prices (Investing.com)
✅ `/api/indices/price` - Indices prices (Investing.com)
✅ `/api/historical-data` - Historical data retrieval
✅ `/api/historical-data/store` - Store historical data

## No API Keys Required

The portfolio uses public APIs that don't require authentication:
- **Binance API** - Public, no key needed
- **StockAnalysis.com API** - Public, no key needed
- **Investing.com API** - Public, no key needed

## Verification Steps

After deploying to Vercel:

1. **Check Environment Variables:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Verify `DATABASE_URL` or `POSTGRES_URL` is set

2. **Check Database Schema:**
   - Connect to your Neon database
   - Run: `SELECT * FROM historical_price_data LIMIT 1;`
   - Should not error (tables should exist)

3. **Test Portfolio Page:**
   - Visit: `https://your-app.vercel.app/portfolio`
   - Try adding a holding
   - Check browser console for errors

4. **Check Vercel Logs:**
   - Go to Vercel Dashboard → Your Project → Deployments → Latest → Functions
   - Check for any API route errors
   - Look for database connection errors

## Common Issues

### Issue: "DATABASE_URL or POSTGRES_URL environment variable is required"

**Solution:** 
- Add `DATABASE_URL` or `POSTGRES_URL` to Vercel environment variables
- Redeploy the application

### Issue: Database connection errors

**Solution:**
- Verify the connection string is correct
- Make sure you're using the **pooler** connection string (contains `-pooler` in the URL)
- Check that SSL mode is set: `?sslmode=require`
- Verify your Neon database is active

### Issue: "relation 'historical_price_data' does not exist"

**Solution:**
- Run the SQL schema from `lib/portfolio/db-schema.sql` in your Neon database
- This creates the required tables

### Issue: API routes return 500 errors

**Solution:**
- Check Vercel function logs for specific error messages
- Verify database connection is working
- Check that database schema is initialized

## Deployment Checklist

- [ ] Add `DATABASE_URL` or `POSTGRES_URL` to Vercel environment variables
- [ ] Initialize database schema in Neon (run `lib/portfolio/db-schema.sql`)
- [ ] Verify database connection works
- [ ] Deploy to Vercel
- [ ] Test portfolio page loads
- [ ] Test adding a holding
- [ ] Test price updates
- [ ] Check Vercel logs for any errors

## Next Steps

Once deployed:
1. The portfolio will automatically use the database for caching
2. First request for each asset will fetch full history and store it
3. Subsequent requests will only fetch new dates (incremental updates)
4. This dramatically reduces API calls and improves performance


