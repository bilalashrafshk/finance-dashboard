# Backend Infrastructure Documentation

This document outlines the backend API structure, request/response formats, and core services for the Risk Metric Dashboard.

## 1. Overview
The backend is built using **Next.js 14 API Routes** (App Router) and **PostgreSQL**.

- **Database**: PostgreSQL (Raw queries via `pg` library).
- **Authentication**: JWT-based via `lib/auth/middleware`.
- **Market Data**: Aggregated from multiple sources (PK Equity, Binance, Metals API, Indices API).

## 2. API Routes Structure

### A. Authentication
| Method | Route | Description | Input | Output |
|:---|:---|:---|:---|:---|
| `POST` | `/api/auth/register` | Register new user | `{ email, password, name }` | `{ user: { id, email, name }, token }` |
| `POST` | `/api/auth/login` | Login user | `{ email, password }` | `{ user, token }` |
| `GET` | `/api/auth/me` | Get current user | Headers: `Authorization: Bearer <token>` | `{ user }` |

### B. User Portfolio Management
| Method | Route | Description | Input | Output |
|:---|:---|:---|:---|:---|
| `GET` | `/api/user/trades` | Get trade history | Query: `limit`, `offset` | `{ success: true, trades: [...] }` |
| `POST` | `/api/user/trades` | Record a trade | `{ assetType, symbol, tradeType, quantity, price, ... }` | `{ success: true, trade: {...} }` |
| `GET` | `/api/user/holdings` | Get current holdings | Headers: Auth | `{ holdings: [...] }` |
| `GET` | `/api/user/portfolio/history` | Get historical portfolio value | Query: `range` (1M, 1Y, ALL) | `{ history: [{ date, totalValue, ... }] }` |
| `GET` | `/api/user/realized-pnl` | Get realized P&L reports | - | `{ realizedPnl: [...] }` |

### C. Market Data Services
| Method | Route | Description | Input | Output |
|:---|:---|:---|:---|:---|
| `POST` | `/api/prices/batch` | Batch fetch prices for multiple assets | `{ tokens: [{symbol, type}, ...] }` | `{ results: { "TYPE:SYMBOL": { price, date } } }` |
| `GET` | `/api/indices/price` | Get global index prices | Query: `symbol` | `{ price, change, ... }` |
| `GET` | `/api/commodities/price` | Get commodity/metal prices | Query: `symbol` | `{ price, unit, ... }` |
| `GET` | `/api/market-flows/lipi` | Get Aggregated Lipi/Fipi Data (Liquidity Map) | Query: `startDate`, `endDate` | `[{ sector, client_type, net_value, ... }]` |

### D. Asset Screener & Analysis
| Method | Route | Description | Input | Output |
|:---|:---|:---|:---|:---|
| `GET` | `/api/screener/metrics` | Get valuation metrics (PE, Yield) | - | `{ data: [...] }` |
| `POST` | `/api/historical-data` | Batch fetch historical candles | `{ symbols: [...], range }` | `{ "SYMBOL": [{time, close}, ...] }` |
| `GET` | `/api/risk-metrics` | Get ETH risk model data | - | `{ metrics: {...}, bands: [...] }` |
| `GET` | `/api/market-cycles` | Get historic market cycle data | - | `{ cycles: [...] }` |

### E. Admin
| Method | Route | Description | Input | Output |
|:---|:---|:---|:---|:---|
| `GET` | `/api/admin/users` | List all users | Headers: Auth (Admin) | `{ users: [...] }` |
| `PUT` | `/api/admin/users/[id]` | Update user details | `{ role, status, ... }` | `{ user }` |

## 3. Data Models (Core Tables)

### `users`
- `id`: Serial
- `email`: Varchar (Unique)
- `password_hash`: Varchar
- `role`: Varchar ('user', 'admin')

### `user_trades`
Records every transaction (Buy, Sell, Deposit, Withdraw).
- `id`, `user_id`, `holding_id`
- `trade_type`: 'buy' | 'sell' | 'add' (deposit) | 'remove' (withdraw)
- `asset_type`: 'crypto' | 'pk-equity' | 'us-equity' | 'cash' | 'metal'
- `symbol`: 'BTC', 'LUCK', 'GOLD'
- `quantity`, `price`, `total_amount`
- `trade_date`: Date

### `user_holdings`
Represents the *current state* derived from trades.
- `id`, `user_id`
- `quantity`: Current quantity held
- `avg_purchase_price`: Weighted average cost basis

### `lipi_data`
Stores daily Liquidity Map data from Market Source.
- `date`
- `sector_name`
- `client_type` (e.g., 'Foreign Corporates', 'Individuals')
- `net_value`: Net buy/sell value

## 4. Key Services
- **`MarketDataService`**: Singleton service to handle batch price fetching and prevent duplicate requests.
- **`BatchPriceService`**: Orchestrates fetching from different providers (Binance, PSX, Metals API).
- **`MarketLiquidityService`**: Handles fetching and aggregating liquidity map data, with smart batching for date ranges.
