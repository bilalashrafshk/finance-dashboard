# Frontend Architecture Documentation

The frontend is built with **Next.js 14 (App Router)**, **Tailwind CSS**, and **Shadcn UI**.

## 1. Core Dashboards

### A. Ethereum Risk Dashboard
**File:** `components/eth-risk-dashboard.tsx`
**Route:** `/` (Home)

The central landing view for authenticated users.
-   **State Management**: Local state (`useState`) for `riskMetrics`, `bandParams`, and `riskWeights`.
-   **Data Source**: Fetches aggregated metrics from `/api/risk-metrics`.
-   **Key Logic**:
    -   **Tabs System**: Splits view into Risk Analysis, Price/Valuation, Heatmap, and Inverse Calculator.
    -   **Parametric Updates**: Allows users to adjust regression band parameters locally (`bandParams`), triggering re-fetches.
    -   **Caching**: Browser-side caching of heavy historical data via API response headers.

### B. Portfolio Dashboard V2
**File:** `components/portfolio/portfolio-dashboard-v2.tsx`
**Route:** `/portfolio`

A complex, multi-currency portfolio tracker.
-   **Data Strategy**:
    -   Uses `usePortfolio` hook (SWR pattern) for global state management of holdings and net deposits.
    -   **Client-Side Aggregation**: Fetches raw holdings, then calculates Aggegate P&L, Allocation, and Unified Totals (USD+PKR) *client-side* in `useEffect` hooks. using `portfolio-utils.ts`.
-   **Features**:
    -   **Unified View**: Converts PKR assets to USD real-time using `exchangeRate` from SBP API.
    -   **Lazy Loading**: Heavy charts (`CryptoPortfolioChart`, `MetalsPortfolioChart`) are dynamically imported with `ssr: false` to improve TTI (Time to Interactive).
    -   **Optimistic Updates**: `mutateHoldings` allows immediate UI updates after Add/Sell transactions.

### C. Asset Screener & MPT
**File:** `components/asset-screener/asset-screener-view.tsx` & `mpt-portfolio-view.tsx`
**Route:** `/screener`

Financial analysis and optimization tool.
-   **Modern Portfolio Theory (MPT) Implementation**:
    -   **Client-Side Math**: Calculates Covariance Matrix, Efficient Frontier, Sharpe Ratios, and Sortino Ratios entirely in the browser (`lib/algorithms/portfolio-optimization.ts`).
    -   **Data Fetching**: Requests massive blocks of historical price data (`/api/historical-data`) for selected assets (~250-1000 data points per asset).
    -   **Caching**: Implements a 5-minute local cache to prevent re-fetching history during optimization tweaks.

### D. Liquidity Map (LIPI/FIPI)
**File:** `components/charts/liquidity-map-section.tsx`

Visualizes market liquidity flows by Investor Type and Sector.
-   **Smart Fetching**: Frontend requests date ranges. Backend optimizes this into aggregated batch requests.
-   **Visualizations**:
    -   **Heatmap**: Sector vs Client matrix.
    -   **Summary Table/Chart**: Net flows by Client Type.

### E. Admin Dashboard
**Route:** `/admin`

User management interface.
-   **Capabilities**: List users, edit roles, deactivate accounts.
-   **Security**: Routes protected by `isAdmin` middleware check.

## 2. Shared Logic & Utilities

### Portfolio Utilities (`lib/portfolio/portfolio-utils.ts`)
A massive utility library shared across components to ensure consistent math.
-   `calculatePortfolioSummary()`: Sums up market value, gain/loss, and invested capital.
-   `calculateUnifiedPortfolioSummary()`: Handles multi-currency normalization.
-   `calculateFifoMetrics()`: Implements First-In-First-Out logic for tax/realized P&L calculations.

### Formatting (`lib/utils.ts`)
-   `formatCurrency()`: Handles currency symbol placement and decimal precision.
-   `formatCompactNumber()`: Converts large numbers to '1.2M', '500k'.

### Auth Context (`lib/auth/auth-context.tsx`)
Global provider wrapping the application.
-   Manages `user` state and `loading` flags.
-   Persists JWT token in `localStorage`.
-   Provides `login`, `logout`, `register` methods accessible via `useAuth()`.

## 3. Component Structure

| Directory | Purpose | Key Components |
|:---|:---|:---|
| `components/ui` | Atomic Design Elements | `button.tsx`, `card.tsx`, `input.tsx` (Shadcn based) |
| `components/charts` | Reusable Chart Wrappers | `price-chart.tsx`, `liquidity-map-section.tsx` (Chart.js / Recharts wrappers) |
| `components/portfolio` | Portfolio-specific Features | `transactions-view.tsx`, `add-transaction-dialog.tsx` |
| `components/dashboard` | Main Risk Dashboard Widgets | `summary-panel.tsx`, `risk-needle.tsx` |

*Last Updated: December 2025*
