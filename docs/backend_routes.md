
# Backend API Routes Documentation

This document outlines the available API routes in the Risk Metric Dashboard, highlighting recent efficiency updates such as validaton, rate limiting, and centralized market data services.

## 1. Authentication (`/api/auth`)

Secure authentication endpoints with strict validation and rate limiting.

| Method | Endpoint | Description | Efficiency & Security Features |
|:---|:---|:---|:---|
| `POST` | `/api/auth/register` | Register a new user | • Zod Schema Validation<br>• Default role: `tier_3_customer`<br>• Default status: `active` |
| `POST` | `/api/auth/login` | Authenticate user | • **Rate Limit**: 5 req/min (IP-based)<br>• Returns lean user object `(id, email, name, role)`<br>• Zod Input Validation |
| `GET` | `/api/auth/me` | Get current user | • Optimized DB query (selects only necessary fields) |
| `POST` | `/api/auth/reset-password` | Reset password | • **Rate Limit**: 5 req/min<br>• Strict password rules enforcement |

## 2. Market Data (`/api/prices`, `/api/crypto`, etc.)

Powered by the **MarketDataService** Singleton.

**Key Features:**
*   **Request Deduplication**: Prevents simultaneous fetches for the same symbol.
*   **Smart Caching (TTL)**:
    *   **Crypto**: 20 minutes
    *   **Equities**: 1 hour (Market Open) / 12 hours (Market Closed)
    *   **Macro/Financials**: 5-10 days
*   **Fail-over**: Returns stale database data if external API fails (prevents UI crashes).

| Method | Endpoint | Description | Logic / Fetcher |
|:---|:---|:---|:---|
| `POST` | `/api/prices/batch` | Batch fetch prices | • **Optimized**: Parallel fetching with concurrency limit<br>• **Unified**: Supports `crypto`, `pk-equity`, `us-equity` mixed<br>• **Deadlock Safe**: Uses direct internal fetchers (no API self-calls) |
| `GET` | `/api/crypto/price` | Get Single Crypto | • Uses `ensureData` with deduplication<br>• Source: Binance API |
| `GET` | `/api/pk-equity/price` | Get Single PK Stock | • Uses `ensureData`<br>• Source: SCS Trade / StockAnalysis |
| `GET` | `/api/us-equity/price` | Get Single US Stock | • Uses `ensureData`<br>• Source: StockAnalysis |
| `POST` | `/api/historical-data/store` | Ingest External Data | • Uses `upsertExternalData`<br>• Validates and normalizes `updated_at` timestamps |

## 3. User Portfolio (`/api/user`)

Optimized for large datasets and fast reloads.

| Method | Endpoint | Description | Efficiency Features |
|:---|:---|:---|:---|
| `GET` | `/api/user/holdings` | Get User Holdings | • **ETag Support**: 304 Not Modified if no trades/updates<br>• **Fast Mode**: `?fast=true` skips price calculation<br>• **Batching**: Fetches all current prices in one DB/Network call |
| `GET` | `/api/user/portfolio/history`| Portfolio History Chart | • **Incremental Algorithm**: `O(N)` calculation (vs `O(N^2)` legacy)<br>• **Unified Mode**: Auto-converts PKR/USD via historical exchange rates<br>• **Caching**: `Cache-Control: private, max-age=60` |
| `GET` | `/api/user/trades` | Get Transaction History | • Sorted by date desc |

## 4. Admin Management (`/api/admin`)

Role-protected routes for user management.

| Method | Endpoint | Description | Efficiency Features |
|:---|:---|:---|:---|
| `GET` | `/api/admin/users` | List Users | • **Pagination**: Supports `?page=1&limit=20`<br>• **Safe Limit**: Max 100 per request |
| `POST` | `/api/admin/users` | Create User | • Full Zod Validation for roles/tiers |
| `PATCH` | `/api/admin/users/[id]` | Update User | • Updates Role, Tier, or Status safely |

## 5. Other Data Services

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/api/sbp/economic-data` | SBP Macro Data |
| `GET` | `/api/financials/[ticker]` | Company Financials |
| `GET` | `/api/market-heatmap` | Sector Performance |

---
*Last Updated: December 2025*
