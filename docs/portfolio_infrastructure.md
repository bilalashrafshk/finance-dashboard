# Portfolio Infrastructure & Facilities

This document provides a comprehensive deep-dive into the technical architecture of the Portfolio System. It details every component, the backend infrastructure powering it, data flow, and the mathematical logic used for calculations.

## 1. High-Level Architecture
The portfolio system operates on a **"Lite" Event Sourcing** model.
- **Source of Truth**: `user_trades` (Immutable ledger of all transactions).
- **Read Model**: `user_holdings` (Calculated current state queryable for speed).
- **Real-Time Layer**: API routes fetching live market prices to value the Read Model on input.

---

## 2. Frontend Infrastructure (`/portfolio`)

### A. Core Component: `PortfolioDashboardV2`
**Path**: `components/portfolio/portfolio-dashboard-v2.tsx`

This container orchestrates the entire portfolio experience.
- **State Management**:
    - `usePortfolio` Hook: Manages the global SWR state for `holdings`, `netDeposits`, and `exchangeRate`.
    - **Local State**: Manages `activeTab` (Overview/USD/PKR), `todayChange`, and `realizedPnL` (async fetched).
- **Initialization Flow**:
    1. Checks Auth State via `auth-context`.
    2. Calls `usePortfolio` to fetch holdings and exchange rates.
    3. Triggers async fetch for `realizedPnL` and `dividendDetails` in a side-effect.
    4. Computes `summary` objects (Total Value, Gain/Loss) using `useMemo` to avoid expensive recalculations on every render.

### B. Summary Computation Logic (`summary` Memo)
The dashboard computes three localized summaries:
1. **USD Summary**: Aggregates only USD-denominated assets.
2. **PKR Summary**: Aggregates only PKR-denominated assets.
3. **Unified Summary**:
    - Converts all PKR assets to USD using the live `exchangeRate` (fetched from SBP API).
    - `Total Value = Sum(USD Assets) + (Sum(PKR Assets) / ExchangeRate)`
    - This allows a user to see their total net worth in a single hard currency.

### C. key Sub-Components & Facilities

#### 1. Lazy Chart Wrappers
**File**: `components/portfolio/lazy-chart-wrapper.tsx`
- **Purpose**: Performance. Large graphing libraries (Recharts/Chart.js) are heavy.
- **Mechanism**: Uses `next/dynamic` with `ssr: false` to load charts only when they enter the viewport or tab is active.
- **Charts**: `CryptoPortfolioChart`, `MetalsPortfolioChart`, `PortfolioHistoryChart`.

#### 2. Allocation Bar Chart
**File**: `components/portfolio/allocation-bar-chart.tsx`
- **Logic**: Uses `calculateAssetAllocation` / `calculateUnifiedAssetAllocation`.
- **Flow**: Groups holdings by `assetType`, sums their current market value, and calculates percentage weight.

#### 3. Dividend Payout Chart
**File**: `components/portfolio/dividend-payout-chart.tsx`
- **Data Source**: Custom API `/api/user/dividends/batch`.
- **Logic**: Plots realized dividend income over time. It intelligently filters dividend events to only include those that occurred *after* the user's purchase date of the asset.

#### 4. Transactions View
**File**: `components/portfolio/transactions-view.tsx`
- **Feature**: A searchable, filterable data table of the raw `user_trades` ledger.
- **Facility**: Allows users to "Edit" or "Delete" trades. *Note: Editing a trade triggers a recalculation of the entire `user_holdings` snapshot on the backend.*

---

## 3. Backend Infrastructure

### A. Data Models (Event Sourcing)

#### Ledger: `user_trades`
Columns: `trade_type` (buy/sell/add/remove), `asset_type`, `symbol`, `price`, `quantity`, `trade_date`.
- **Immutable Entry**: Every action is a new row.
- **"Add/Remove"**: These specific types represent Cash Deposits and Withdrawals, crucial for calculating "Net Deposits" (Invested Capital).

#### Snapshot: `user_holdings`
Columns: `quantity`, `avg_purchase_price`.
- **Generated**: This table is *wiped* and *rebuilt* whenever a trade is added/edited to ensure mathematical consistency.
- **Logic**: The `syncHoldingsFromTrades` function in `route.ts` iterates through time-sorted trades to build the current valid state of holdings.

### B. Pricing Engine (`/api/prices/batch`)
**Path**: `app/api/prices/batch/route.ts`

A dedicated micro-service style endpoint that centralizes price fetching to avoid rate limits and spaghetti code.
- **Input**: `{ tokens: [{ type: 'pk-equity', symbol: 'LUCK' }, { type: 'crypto', symbol: 'BTC' }] }`
- **Router Logic**:
    - `pk-equity` -> Calls `PKEquityService` (Scrapes PSX/SCS).
    - `crypto` -> Calls `BinanceAPI`.
    - `metals` -> Calls `MetalsAPI`.
    - `us-equity` -> Calls `StockAnalysisAPI`.
- **Output**: Returns a map of prices `{ "PK-EQUITY:LUCK": 850.5 }`.

### C. Portfolio History Engine (`/api/user/portfolio/history`)
**Path**: `app/api/user/portfolio/history/route.ts`

Calculates the portfolio's value over time for charts.
- **Complexity**: High. It cannot just query the DB because "Value" changes every day based on *that day's* market price.
- **Algorithm**:
    1. Fetch all `user_trades`.
    2. Determine date range (e.g., last 30 days).
    3. For each day $d$ in range:
        - Reconstruct "Holdings on day $d$" by replaying trades up to $d$.
        - Fetch historical price of each asset on day $d$ (using `historical-data` table).
        - `Value(d) = Sum(Holding(i).Quantity * Price(i, d))`
- **Optimization**: Uses heavy caching (1 hour) because historical values (yesterday and before) never change.

---

## 4. Calculation Facilities & Math

### A. Cost Basis (Weighted Average)
Used for determining "Unrealized Gain".
$$ AvgPrice = \frac{Total Invested}{Total Quantity} $$
- **Logic**: When buying more of an existing asset, the new price is averaged into the existing cost basis.
- **Implementation**: `portfolio-utils.ts` -> `combineHoldingsByAsset`.

### B. Realized P&L (FIFO)
Used for Tax/Performance reporting.
- **Logic**: "First-In, First-Out". When selling, the system assumes you are selling the *oldest* shares first.
- **Implementation**: `lib/portfolio/fifo-utils.ts`.
- **Process**:
    1. Creates a queue of "Buy Lots" (Quantity + Price + Date).
    2. When processing a "Sell", it drains the queue from the front.
    3. `Realized Gain = (SellPrice - LotPrice) * SoldQuantity`.

### C. Unified Currency Normalization
Used for the "Overview" tab.
- **Problem**: You cannot sum 100 USD and 100 PKR.
- **Solution**:
    - Fetches `exchangeRate` (USD/PKR).
    - `Unified Invested = Invested(USD) + (Invested(PKR) / Rate)`
    - `Unified Value = Value(USD) + (Value(PKR) / Rate)`
- This dynamic normalization happens client-side to ensure the UI feels instant even if the rate changes slightly.

### D. Liquidity/Cash Management
- **Auto-Deposit**: If a user tries to "Buy" Apple stock for $1000 but has $0 Cash, the backend automatically creates a "Deposit" transaction for $1000 and *then* processes the Buy. This ensures the ledger never has negative cash, maintaining accounting integrity.

---

## 5. Security & Auth
- **Middleware**: `lib/auth/middleware.ts` intercepts all `/api/user/*` requests.
- **Token**: Bearer JWT (HS256) extracted from Authorization header.
- **Context**: The `request` object in API routes is enriched with the `user` object (ID, Email) only if validation passes, ensuring no data leaks between users.

---
*Document Version 1.0 - Dec 2025*
