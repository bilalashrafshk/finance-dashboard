# Backend Infrastructure & Route Documentation

## Overview
This document details the complete backend infrastructure, API routes, and data ingestion logic for the Risk Metric Dashboard.

## Data Ingestion & Missing Data Logic
A critical part of the infrastructure is how data is retrieved when missing from the database.

### 1. Crypto Assets
- **Route**: `/api/crypto/price`
- **Primary Source**: Database (`historical_price_data` where `asset_type='crypto'`).
- **Missing Data Logic**:
  1. If data for date is missing or `refresh=true`:
  2. Server calls **Binance API** (public endpoints).
     - Live: `fetchBinancePrice(symbol)`
     - Historical: `fetchBinanceHistoricalData(symbol)`
  3. Data is automatically upserted into `historical_price_data` with `source='binance'`.
  4. Returns new data to client.

### 2. PK Equity (Pakistan Stocks)
- **Route**: `/api/pk-equity/price`
- **Primary Source**: Database (`historical_price_data`).
- **Missing Data Logic**:
  1. Checks DB.
  2. If missing: Calls `fetchPKEquityPriceService`.
     - Scrapes **SCSTrade** (or similar local data source) using `lib/scraper`.
  3. Upserts to DB.

### 3. US Equity
- **Route**: `/api/us-equity/price`
- **Primary Source**: Database (`historical_price_data`).
- **Missing Data Logic**:
  1. Checks DB.
  2. If missing: Calls **StockAnalysis.com** internal API (`fetchStockAnalysisData`).
  3. Upserts results to DB (`source='stockanalysis'`).

### 4. Special Assets (Indices & Metals) - Client-Side Fallback
Some assets are protected by Cloudflare/Anti-bot on their source sites (e.g., Investing.com), making server-side scraping unreliable. We use a **Client-Side Fallback** pattern.

- **Routes**: `/api/indices/price`, `/api/metals/price`
- **Logic**:
  1. Server checks DB.
  2. If missing, Server returns **JSON Signal**:
     ```json
     { "needsClientFetch": true, "instrumentId": "123456", "date": "2024-01-01" }
     ```
  3. **Frontend** detects this signal.
  4. Frontend (User's Browser) fetches data from Investing.com (bypassing server IP blocks).
  5. Frontend POSTs data back to `/api/historical-data/store`.
  6. Server saves to DB.
  7. Frontend retries the original request (now serves from DB).

---

## API Route Reference

### 1. Authentication & User Management
| Path | Method | Description |
|---|---|---|
| `/api/auth/login` | `POST` | Validates creds, returns JWT & Session. |
| `/api/auth/register` | `POST` | Creates user in `users` table. |
| `/api/auth/me` | `GET` | Validates session via Header, returns User Profile. |
| `/api/auth/forgot-password` | `POST` | Generates token, emails via `email-service`. |
| `/api/auth/reset-password` | `POST` | Consumes token, updates `password_hash`. |

### 2. Admin Administration
| Path | Method | Description |
|---|---|---|
| `/api/admin/users` | `GET/POST` | List users / Create user (Admin role required). |
| `/api/admin/users/[id]` | `PATCH/DEL` | Update/Delete user accounts. |

### 3. Dashboard, Portfolio & Stats
| Path | Method | Description | Data Source |
|---|---|---|---|
| `/api/dashboard/movers` | `GET` | Top gainers/losers (last 2 trading days). | DB (`historical_price_data`) |
| `/api/user/holdings` | `GET/POST` | Get portfolio / Add Transaction. | DB (`user_holdings`) |
| `/api/user/holdings/[id]` | `PUT/DEL` | Edit/Remove holding. | DB (`user_holdings`) |
| `/api/user/dividends/batch` | `POST` | Get dividend history for list of tickers. | DB (`dividend_payouts`) |
| `/api/risk-metrics` | `GET` | Calc Alpha/Beta/Sharpe. Expensive calc. | Internal Lib + DB |
| `/api/stats` | `GET` | System counts (Companies, Data Points). | DB Aggregation |

### 4. Assets & Market Data
| Path | Method | Description | Logic Detail |
|---|---|---|---|
| `/api/asset/metadata` | `GET` | Asset Name/Symbol lookup. | DB (`company_profiles`) |
| `/api/assets/metrics` | `POST` | Batch technicals (RSI/MA). | Calculated on-the-fly from history. |
| `/api/commodity/price` | `GET/POST` | Manual commodity entry. | DB only (No auto-fetch). |
| `/api/crypto/price` | `GET` | Crypto Price (Current/Hist). | DB -> Binance API. |
| `/api/indices/price` | `GET` | Index Price (KSE100/SPX). | DB -> ClientFetch (SPX) or Scraper (KSE). |
| `/api/market-cycles` | `GET` | Bull/Bear cycle detection. | Algorithmic analysis of DB history. |
| `/api/market-heatmap` | `GET` | Daily performance map. | DB (Joins Profile + Price). |

### 5. Financials, Screener & Analysis
detailed financial data ingestion logic.

| Path | Method | Description | Logic Detail |
|---|---|---|---|
| `/api/financials` | `GET` | Profile + Quarterly/Annual Reports. | DB (`financial_statements`) |
| `/api/financials/update` | `GET` | **Scraper Trigger**. | Scrapes SCSTrade for Profile/EPS/Revenue. Upserts DB. |
| `/api/financials/batch` | `POST` | Bulk Fetch for Screener. | DB Optimized Batch Query. |
| `/api/prices/batch` | `POST` | Multi-asset price fetcher. | Routes to appropriate service per asset type. |
| `/api/screener/stocks` | `GET` | List of filterable stocks. | distinct(symbol) from DB. |
| `/api/screener/update` | `GET` | **CRON Job**. | Pre-calculates P/E, Yield, Beta for all stocks. Stores in `screener_metrics`. |
| `/api/sector-performance/quarterly` | `GET` | Sector vs KSE100 returns. | Cap-weighted average calculation. |
| `/api/scstrade/lipi` | `GET` | Liquidity Map Data. | Proxy to SCSTrade API. |

### 6. System & Helper Routes
| Path | Method | Description |
|---|---|---|
| `/api/advance-decline` | `GET` | Market Breadth (AD Line). Algo calc. |
| `/api/historical-data` | `GET` | Generic historical data fetcher wrapper. |
| `/api/historical-data/store` | `POST` | **Ingest Endpoint**. Receives data from Client-Side scraping. |
| `/api/binance/*` | `GET` | Binance Proxies. |
| `/api/metals/*` | `GET` | Metals Proxies (via ClientFetch). |

### 7. SBP (State Bank of Pakistan) Macro Data
All SBP routes follow the same pattern: **Cache-First**.
1. Check DB.
2. If stale (>3 days), fetch SBP Open API.
3. Cache to DB.

- `/api/sbp/balance-of-payments`: Current Account info.
- `/api/sbp/economic-data`: CPI, Inflation, GDP.
- `/api/sbp/interest-rates`: Policy Rate History.

## Database Schema Dependencies
The API relies on the following core Postgres tables:
- `users`, `user_holdings`, `user_trades`: User Data.
- `historical_price_data`: shared table for ALL asset classes (crypto, equity, etc).
- `company_profiles`: Metadata (Sector, Shares Outstanding).
- `financial_statements`: Raw financial report data.
- `screener_metrics`: Pre-computed stats (P/E, Beta) for fast filtering.
- `dividend_payouts`: Historical dividend records.
