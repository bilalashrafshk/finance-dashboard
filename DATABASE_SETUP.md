# Database Setup Guide

## Overview

The portfolio tracker now uses a Neon PostgreSQL database to store historical price data with incremental updates. This dramatically reduces API calls and improves performance.

## Database Schema

The database stores historical price data in two tables:

1. **`historical_price_data`**: Stores OHLCV (Open, High, Low, Close, Volume) data for each asset
2. **`historical_data_metadata`**: Tracks the latest stored date and record count for each asset

## Setup Steps

### 1. Environment Variables

Add your Neon database connection string to `.env.local`:

```bash
# Recommended for most uses (with connection pooling)
DATABASE_URL=postgresql://neondb_owner:npg_IJRM7Z3bivKr@ep-ancient-lake-a11r3s06-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# Or use POSTGRES_URL (also supported)
POSTGRES_URL=postgresql://neondb_owner:npg_IJRM7Z3bivKr@ep-ancient-lake-a11r3s06-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

### 2. Initialize Database Schema

Run the SQL schema file to create the tables:

**Option A: Using Neon Console**
1. Go to your Neon project dashboard
2. Open the SQL Editor
3. Copy and paste the contents of `lib/portfolio/db-schema.sql`
4. Execute the SQL

**Option B: Using psql command line**
```bash
psql $DATABASE_URL -f lib/portfolio/db-schema.sql
```

**Option C: Using a database client**
- Use any PostgreSQL client (pgAdmin, DBeaver, etc.)
- Connect to your Neon database
- Run the SQL from `lib/portfolio/db-schema.sql`

### 3. Verify Setup

The database will be automatically used when:
- Chart components load historical data
- Gain calculations fetch historical prices
- Purchase price validation checks historical prices

## How It Works

### Incremental Updates

1. **First Request**: 
   - No data in database
   - Fetches full history from external API
   - Stores all data in database
   - Returns data to client

2. **Subsequent Requests**:
   - Checks database for latest stored date
   - Only fetches dates after the latest stored date
   - Appends new data to database
   - Returns combined (stored + new) data

### Supported Asset Types

- **PK Equities** (`pk-equity`): Uses StockAnalysis.com API
- **US Equities** (`us-equity`): Uses StockAnalysis.com API
- **Cryptocurrencies** (`crypto`): Uses Binance API
- **S&P 500** (`spx500`): Uses Investing.com API
- **KSE 100** (`kse100`): Uses Investing.com API

## API Route

The main API route is `/api/historical-data`:

```
GET /api/historical-data?assetType=pk-equity&symbol=PTC&market=PSX
```

**Parameters:**
- `assetType`: Asset type (pk-equity, us-equity, crypto, spx500, kse100)
- `symbol`: Asset symbol/ticker
- `market`: Market type (PSX or US) - only for equities

**Response:**
```json
{
  "assetType": "pk-equity",
  "symbol": "PTC",
  "data": [...],
  "count": 3650,
  "storedCount": 3640,
  "newCount": 10,
  "latestDate": "2025-01-13",
  "source": "database"
}
```

## Benefits

1. **99%+ reduction in API calls** after first load
2. **Faster chart loading** (reads from database vs external API)
3. **Reduced bandwidth** (only fetches new dates)
4. **Better rate limit compliance** (fewer external API calls)
5. **Offline capability** (can show cached data if API is down)

## Troubleshooting

### Database Connection Errors

If you see connection errors:
1. Verify `DATABASE_URL` is set in `.env.local`
2. Check that your Neon database is active
3. Ensure SSL mode is correct (`sslmode=require`)

### Schema Errors

If tables don't exist:
1. Run the SQL schema file (`lib/portfolio/db-schema.sql`)
2. Verify tables were created: `SELECT * FROM historical_price_data LIMIT 1;`

### No Data Being Stored

If data isn't being stored:
1. Check API route logs for errors
2. Verify database connection is working
3. Check that the schema was initialized correctly

## Migration from Parquet Files

If you were previously using Python scripts with Parquet files:
- The database replaces the need for local Parquet files
- Data is now stored centrally in the database
- Python scripts are no longer required for data storage
- All data is accessible via the `/api/historical-data` route




