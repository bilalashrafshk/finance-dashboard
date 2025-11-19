# Scraping & Data Update Logic

## Overview

The application retrieves financial data (Income Statement, Balance Sheet, Cash Flow, and Company Profile) from `stockanalysis.com`. This data is stored in a PostgreSQL database to allow for historical analysis and efficient querying.

## Data Fetching Strategy

**Crucial Policy:** Data is **never** fetched automatically in the background for all assets. It is only fetched **on-demand** when a user explicitly inspects a specific asset's financials.

### Trigger Mechanism

1.  **User Action**: User navigates to the **Asset Screener** and clicks on an asset to view details.
2.  **Tab Selection**: The user clicks the **"Financials"** tab.
    *   *Note:* The `AssetFinancialsView` component is lazily mounted only when this tab is active.
3.  **Data Check**: The component requests existing data from the database via `GET /api/financials`.
4.  **Conditional Scrape**:
    *   **If Data Exists**: The stored data is displayed immediately. No new scraping occurs, ensuring fast load times.
    *   **If No Data Exists** (Count = 0): The component automatically triggers `GET /api/financials/update`.
        *   This route scrapes the latest data from the source.
        *   Upserts it into the database.
        *   Returns success, prompting the frontend to re-fetch and display the new data.
5.  **Manual Refresh**: A "Refresh" button is available in the UI for the user to force a re-scrape if the data appears outdated.

## API Routes

### `GET /api/financials`
*   **Purpose**: Retrieve stored data.
*   **Params**: `symbol`, `period` (quarterly/annual).
*   **Behavior**: Queries `company_profiles` and `financial_statements` tables.

### `GET /api/financials/update`
*   **Purpose**: Scrape and update data.
*   **Params**: `symbol`.
*   **Behavior**:
    1.  Scrapes Company Profile (Sector, Industry, Market Cap, Float).
    2.  Scrapes Financial Statements (Income, Balance Sheet, Cash Flow) for both Quarterly and Annual periods.
    3.  Upserts all data into the database using `ON CONFLICT` clauses to prevent duplicates.
    4.  Updates the `last_updated` timestamp.

## Database Schema

*   **`company_profiles`**: Stores static/slow-moving data (Sector, Industry, Description).
*   **`financial_statements`**: Stores time-series financial data keyed by `symbol`, `period_end_date`, and `period_type`.

## Rate Limiting & Performance

*   Since scraping is tied to user UI navigation (1 user viewing 1 asset at a time), the natural rate of requests is low.
*   This prevents getting blocked by the upstream source.
*   No bulk fetching is performed.
