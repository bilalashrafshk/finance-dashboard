# Asset Price Fetching Guide

This document explains how each asset type's price is fetched, when it's fetched, which assets use database storage, which API routes are used, and whether fetching is server-side or client-side.

## Overview

The application supports multiple asset types:
1. **Crypto** (Bitcoin, Ethereum, etc.)
2. **PK Equity** (Pakistan Stock Exchange stocks)
3. **US Equity** (US stocks)
4. **Metals** (Gold, Silver, etc.)
5. **ETH Risk Dashboard** (Ethereum-specific risk metrics)

---

## 1. Crypto Assets

### How Price is Fetched
- **Direct API call** to Binance public API: `https://api.binance.com/api/v3/ticker/price?symbol={SYMBOL}`
- Symbol is normalized to Binance format (e.g., `BTC` → `BTCUSDT`)

### When Price is Fetched
1. **On-demand** when user clicks "Fetch Current Price" in Add Holding dialog
2. **Manual refresh** when user clicks "Refresh Prices" button in Portfolio Dashboard
3. **NOT automatically** on page load

### Database Storage
- ✅ **YES - Uses database storage**
- Historical data can be stored via `/api/historical-data/store` route
- When updating holdings, crypto prices are stored in database with source `'binance'`
- Database schema supports `asset_type = 'crypto'`
- Historical data fetched via `fetchBinanceHistoricalData()` and stored via `insertHistoricalData()`

### API Routes Used
- **Client-side**: `/api/binance/price?symbol={SYMBOL}` (server-side route)
- **Server-side route**: `app/api/binance/price/route.ts`
  - Calls `fetchBinancePrice()` from `lib/portfolio/binance-api.ts`
  - Directly calls Binance public API
- **Historical data storage**: `/api/historical-data/store` (POST) - stores crypto historical data

### Server vs Client Side
- **Server-side**: The API route runs on the server (Next.js API route)
- **Client-side**: The React component calls the API route via `fetch()`
- **Flow**: Client → Next.js API Route → Binance API → Response
- **Storage**: Client → `/api/historical-data/store` → Database (when updating holdings)

### Code Locations
- API Route: `app/api/binance/price/route.ts`
- Client Library: `lib/portfolio/binance-api.ts`
- Historical Storage: `components/portfolio/portfolio-update-section.tsx` (line 245 - stores with source 'binance')
- Usage: `components/portfolio/add-holding-dialog.tsx` (line 352), `components/portfolio/portfolio-dashboard.tsx` (line 89)

---

## 2. PK Equity (Pakistan Stock Exchange)

### How Price is Fetched
**Multi-tier fallback system:**
1. **Database check** (if market is closed and today's data exists)
2. **Legacy Parquet files** (if available via `/api/psx/data`)
3. **StockAnalysis.com API** (primary source)
4. **PSX website scraping** (fallback if API fails)

### When Price is Fetched
1. **On-demand** when user clicks "Fetch Current Price" in Add Holding dialog
2. **Manual refresh** when user clicks "Refresh Prices" button
3. **NOT automatically** on page load

### Database Storage
- ✅ **YES - Uses database storage**
- Checks database first if market is closed (`isMarketClosed('PSX')`)
- If market is closed AND today's data exists in DB, returns DB price
- If market is open OR no today's data, fetches from API
- Historical data stored via `/api/historical-data/store` route

### API Routes Used
- **Client-side**: `/api/psx/price?ticker={TICKER}&refresh={true|false}`
- **Server-side route**: `app/api/psx/price/route.ts`
  - Checks database via `getTodayPriceFromDatabase('pk-equity', ticker, today)`
  - Falls back to `/api/psx/data` (legacy Parquet files)
  - Then tries StockAnalysis.com API via `getLatestPriceFromStockAnalysis()`
  - Final fallback: PSX website scraping via `fetchPSXBidPrice()`

### Server vs Client Side
- **Server-side**: The API route runs on the server
- **Client-side**: React components call the API route
- **Flow**: Client → Next.js API Route → Database Check → StockAnalysis API/Scraping → Response

### Code Locations
- API Route: `app/api/psx/price/route.ts`
- Database Client: `lib/portfolio/db-client.ts` (getTodayPriceFromDatabase)
- Market Hours: `lib/portfolio/market-hours.ts`
- Usage: `components/portfolio/add-holding-dialog.tsx` (line 366), `components/portfolio/portfolio-dashboard.tsx` (line 103)

---

## 3. US Equity

### How Price is Fetched
**Two-tier system:**
1. **Database check** (if market is closed and today's data exists)
2. **StockAnalysis.com API** (primary source)

### When Price is Fetched
1. **On-demand** when user clicks "Fetch Current Price" in Add Holding dialog
2. **Manual refresh** when user clicks "Refresh Prices" button
3. **NOT automatically** on page load

### Database Storage
- ✅ **YES - Uses database storage**
- Checks database first if market is closed (`isMarketClosed('US')`)
- If market is closed AND today's data exists in DB, returns DB price
- If market is open OR no today's data, fetches from StockAnalysis.com API
- Historical data stored via `/api/historical-data/store` route

### API Routes Used
- **Client-side**: `/api/us-equity/price?ticker={TICKER}&refresh={true|false}`
- **Server-side route**: `app/api/us-equity/price/route.ts`
  - Checks database via `getTodayPriceFromDatabase('us-equity', ticker, today)`
  - Fetches from StockAnalysis.com API via `getLatestPriceFromStockAnalysis()`

### Server vs Client Side
- **Server-side**: The API route runs on the server
- **Client-side**: React components call the API route
- **Flow**: Client → Next.js API Route → Database Check → StockAnalysis API → Response

### Code Locations
- API Route: `app/api/us-equity/price/route.ts`
- Database Client: `lib/portfolio/db-client.ts`
- StockAnalysis API: `lib/portfolio/stockanalysis-api.ts`
- Usage: `components/portfolio/add-holding-dialog.tsx` (line 388+), `components/portfolio/portfolio-dashboard.tsx` (line 129)

---

## 4. Metals (Gold, Silver, etc.)

### How Price is Fetched
**Client-side fetching (due to Cloudflare protection):**
1. **Database check** (if market is closed and today's data exists)
2. **Investing.com API via client-side** (primary source - bypasses Cloudflare)
3. **Server-side API route** (fallback, may fail due to Cloudflare blocking)

### When Price is Fetched
1. **On-demand** when user clicks "Fetch Current Price" in Add Holding dialog
2. **Manual refresh** when user clicks "Refresh Prices" button
3. **NOT automatically** on page load

### Database Storage
- ✅ **YES - Uses database storage**
- Checks database first if market is closed (`isMarketClosed('US')` - metals trade on US market hours)
- If market is closed AND today's data exists in DB, returns DB price
- Historical data stored via `/api/historical-data/store` route (after client-side fetch)

### API Routes Used
- **Client-side API**: `getLatestPriceFromInvestingClient()` from `lib/portfolio/investing-client-api.ts`
  - Fetches directly from browser (bypasses Cloudflare protection)
  - Used in `portfolio-update-section.tsx` and `add-holding-dialog.tsx`
- **Server-side route (fallback)**: `/api/metals/price?symbol={SYMBOL}&refresh={true|false}`
  - `app/api/metals/price/route.ts` - May fail due to Cloudflare blocking
  - Checks database via `getTodayPriceFromDatabase('metals', symbol, today)`
  - Attempts server-side fetch via `getLatestPriceFromInvesting()` (often blocked)
- **Historical data**: `fetchInvestingHistoricalDataClient()` - client-side only
- **Storage**: `/api/historical-data/store` (POST) - stores fetched data

### Server vs Client Side
- **Client-side (primary)**: Direct browser fetch to Investing.com API
  - Uses `getLatestPriceFromInvestingClient()` and `fetchInvestingHistoricalDataClient()`
  - Bypasses Cloudflare protection (browser has cookies/session)
  - Flow: Browser → Investing.com API → Response → Store in DB
- **Server-side (fallback)**: The API route exists but often fails due to Cloudflare
  - Flow: Client → Next.js API Route → (may fail) → Investing.com API → Response
- **Note**: Historical data route explicitly states: "For metals, we can't fetch server-side due to Cloudflare blocking. The client will fetch using client-side API"

### Code Locations
- **Client-side API**: `lib/portfolio/investing-client-api.ts` (getLatestPriceFromInvestingClient, fetchInvestingHistoricalDataClient)
- Server-side API Route (fallback): `app/api/metals/price/route.ts`
- Database Client: `lib/portfolio/db-client.ts`
- Investing API (server-side, may fail): `lib/portfolio/investing-api.ts`
- Usage: 
  - `components/portfolio/add-holding-dialog.tsx` (line 604+ - uses client-side API)
  - `components/portfolio/portfolio-update-section.tsx` (line 195+ - uses client-side API)
  - `components/portfolio/portfolio-dashboard.tsx` (line 153 - may use server-side route)

---

## 5. ETH Risk Dashboard

### How Price is Fetched
- **Direct API call** to Binance public API for historical klines (candlestick data)
- Fetches ETH/BTC and BTC/USDT data from Binance
- Calculates ETH/USD by multiplying ETH/BTC × BTC/USDT
- Processes data through risk calculation algorithms

### When Price is Fetched
1. **Automatically on page load** - `useEffect` hook triggers on component mount
2. **Manual refresh** when user clicks "Refresh" button
3. **On parameter change** when user updates band parameters or risk weights

### Database Storage
- ❌ **NO database storage** for ETH risk metrics
- Data is fetched fresh from Binance API each time
- Results are cached in-memory on the server (5-minute TTL)
- Historical data fetched from Binance: `https://binance.com/api/v3/klines`

### API Routes Used
- **Client-side**: `/api/risk-metrics?bandParams={...}&cutoffDate={...}&riskWeights={...}`
- **Server-side route**: `app/api/risk-metrics/route.ts`
  - Checks in-memory cache (5-minute TTL)
  - If cache miss, calls `calculateRiskMetrics()` from `lib/eth-analysis.ts`
  - Which calls `fetchEthHistoricalData()` that directly calls Binance API

### Server vs Client Side
- **Server-side**: The API route runs on the server
- **Client-side**: React component calls the API route on mount
- **Flow**: Client → Next.js API Route → Cache Check → Binance API (if cache miss) → Risk Calculations → Response

### Code Locations
- API Route: `app/api/risk-metrics/route.ts`
- ETH Analysis: `lib/eth-analysis.ts` (fetchEthHistoricalData, calculateRiskMetrics)
- Component: `components/eth-risk-dashboard.tsx` (line 163 - useEffect on mount)

---

## Summary Table

| Asset Type | Database Storage | When Fetched | API Route | Server/Client | Primary Source |
|------------|------------------|--------------|-----------|---------------|----------------|
| **Crypto** | ✅ Yes | On-demand, Manual refresh | `/api/binance/price` | Server-side route | Binance API |
| **PK Equity** | ✅ Yes | On-demand, Manual refresh | `/api/psx/price` | Server-side route | StockAnalysis.com API (with DB fallback) |
| **US Equity** | ✅ Yes | On-demand, Manual refresh | `/api/us-equity/price` | Server-side route | StockAnalysis.com API (with DB fallback) |
| **Metals** | ✅ Yes | On-demand, Manual refresh | `getLatestPriceFromInvestingClient()` | **Client-side** (Cloudflare bypass) | Investing.com API (client-side) |
| **ETH Risk** | ❌ No (in-memory cache) | Auto on page load, Manual refresh | `/api/risk-metrics` | Server-side route | Binance API (historical klines) |

---

## Database Storage Details

### Assets Using Database
- **Crypto** (`crypto`) - Historical data stored via `/api/historical-data/store`
- **PK Equity** (`pk-equity`)
- **US Equity** (`us-equity`)
- **Metals** (`metals`) - Stored after client-side fetch

### Database Schema
- Table: `historical_price_data`
- Columns: `asset_type`, `symbol`, `date`, `open`, `high`, `low`, `close`, `volume`, `adjusted_close`, `change_pct`
- Database client: `lib/portfolio/db-client.ts`

### Database Check Logic
All database-using assets follow this pattern:
1. Check if market is closed (`isMarketClosed()`)
2. If closed, check database for today's price (`getTodayPriceFromDatabase()`)
3. If today's price exists in DB, return it immediately
4. If market is open OR no today's data, fetch from external API
5. External API results can be stored via `/api/historical-data/store` route

### Market Hours
- **US Market**: 9:30 AM - 4:00 PM ET (weekdays)
- **PSX Market**: 9:30 AM - 3:30 PM PKT (weekdays)
- **Crypto**: 24/7 (no market hours check)

---

## Client-Side vs Server-Side

### All Price Fetching is Server-Side
All API routes (`/api/*/price`) run on the **server** (Next.js API routes).

### Client-Side Responsibilities
- React components make `fetch()` calls to API routes
- Handle loading states, errors, and UI updates
- Store portfolio data in localStorage (not prices)

### Server-Side Responsibilities
- Execute API calls to external services (Binance, StockAnalysis, Investing.com)
- Check database for cached prices
- Handle market hours logic
- Cache risk metrics calculations (in-memory)

---

## Key Files Reference

### API Routes
- `app/api/binance/price/route.ts` - Crypto prices
- `app/api/psx/price/route.ts` - PK equity prices
- `app/api/us-equity/price/route.ts` - US equity prices
- `app/api/metals/price/route.ts` - Metals prices
- `app/api/risk-metrics/route.ts` - ETH risk metrics
- `app/api/historical-data/route.ts` - Historical data retrieval

### Client Libraries
- `lib/portfolio/binance-api.ts` - Binance API client (server-side)
- `lib/portfolio/stockanalysis-api.ts` - StockAnalysis.com API client (server-side)
- `lib/portfolio/investing-api.ts` - Investing.com API client (server-side, may fail for metals)
- `lib/portfolio/investing-client-api.ts` - **Investing.com API client (client-side, for metals)**
- `lib/portfolio/db-client.ts` - Database client
- `lib/portfolio/market-hours.ts` - Market hours utilities
- `lib/eth-analysis.ts` - ETH risk calculations

### Components
- `components/portfolio/portfolio-dashboard.tsx` - Main portfolio dashboard
- `components/portfolio/add-holding-dialog.tsx` - Add/edit holdings dialog
- `components/eth-risk-dashboard.tsx` - ETH risk dashboard

