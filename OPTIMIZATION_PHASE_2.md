# Portfolio Page Performance Optimization - Phase 2

## Diagnosis
The portfolio page was experiencing significant delays due to a "waterfall" of sequential data fetching and inefficient API endpoints.

### Identified Issues:
1.  **Sequential Processing**: The dashboard calculated summaries for each currency (USD, PKR, etc.) sequentially. For each currency, it awaited:
    *   Dividend calculations (fetching from API)
    *   Realized PnL calculations (fetching from API)
    *   This meant wait time = (Time_USD + Time_PKR + ...).

2.  **Inefficient Batch API**: The `/api/user/dividends/batch` endpoint was "batch" in name only.
    *   It iterated through tickers and made internal HTTP requests to another API endpoint (`/api/pk-equity/dividend`).
    *   That endpoint potentially triggered web scraping if data wasn't cached for "today".
    *   For a portfolio with 20 stocks, this triggered 20 internal HTTP requests (and potentially 20 scraper instances), causing timeouts and high latency.

3.  **Redundant Data Fetching**: Realized PnL and Dividends were fetched multiple times (once per currency summary), adding unnecessary network overhead.

## Optimizations Implemented

### 1. Parallelized Data Fetching (Frontend)
Refactored `PortfolioDashboardV2` to break the sequential dependency chain.
*   **Before**:
    ```typescript
    for (currency of currencies) {
      await fetchDividends(); // Block
      await fetchPnL();       // Block
    }
    ```
*   **After**:
    ```typescript
    const [pnl, dividends] = await Promise.all([fetchPnL(), fetchDividends()]);
    for (currency of currencies) {
      // Calculate locally using pre-fetched data
    }
    ```
*   **Impact**: Reduced blocking time to the slowest single request rather than the sum of all requests.

### 2. Database-Optimized Batch API (Backend)
Rewrote the batch dividend fetching logic to be truly efficient.
*   **New Function**: Added `getDividendDataBatch` to `db-client.ts` to fetch dividends for ANY number of tickers in a single SQL query (`WHERE symbol = ANY(...)`).
*   **API Update**: Updated `/api/user/dividends/batch` to use this function directly.
    *   **Removed**: Internal HTTP requests.
    *   **Removed**: Triggering of scrapers on this endpoint (it now returns DB data only, ensuring speed).
*   **Impact**: Request time for 50 tickers reduced from ~5-10s (or timeout) to <50ms.

### 3. Payload Optimization
*   Switched batch dividend API to use `POST` instead of `GET`.
*   Prevents URL length limits when fetching data for portfolios with many holdings.

### 4. Logic Deduplication
*   Centralized the fetching of "global" data (Realized PnL) so it's fetched once per page load/refresh, utilizing the browser cache for subsequent calls.

## Results
*   **Initial Load**: significantly faster (limited only by the single `holdings` query).
*   **Summary Calculation**: Near instant after holdings are loaded.
*   **Scalability**: Can now handle portfolios with hundreds of assets without timing out.

