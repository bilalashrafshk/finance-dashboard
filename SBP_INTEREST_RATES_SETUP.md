# SBP Interest Rates Setup Guide

## Overview

This feature integrates State Bank of Pakistan (SBP) interest rate data into the application. It fetches historical interest rate data from the SBP EasyData API and displays it in an interactive chart.

## Environment Variables

### Required

Add the following environment variable to your `.env.local` file:

```bash
SBP_API_KEY=EE4D300822A1DA67800823DAADBA299D2962FE07
```

**Note:** Replace the above API key with your own if needed. You can generate a new API key from:
- https://easydata.sbp.org.pk
- Login to your account
- Navigate to "My Data Basket" under "My Account"
- Generate an API key

## Database Setup

Run the database schema migration to create the necessary tables:

```bash
# The schema is in lib/portfolio/db-schema.sql
# Run it against your PostgreSQL database
psql $DATABASE_URL -f lib/portfolio/db-schema.sql
```

This will create:
- `sbp_interest_rates` table - stores historical interest rate data
- `sbp_rates_metadata` table - tracks last update time for 3-day caching

## API Endpoint

### GET /api/sbp/interest-rates

Fetches SBP interest rate data with automatic caching.

**Query Parameters:**
- `seriesKey` (required): One of:
  - `TS_GP_IR_SIRPR_AH.SBPOL0030` - Policy (Target) Rate
  - `TS_GP_IR_SIRPR_AH.SBPOL0010` - Reverse Repo Rate
  - `TS_GP_IR_SIRPR_AH.SBPOL0020` - Repo Rate
- `startDate` (optional): Start date in YYYY-MM-DD format
- `endDate` (optional): End date in YYYY-MM-DD format
- `refresh` (optional): Set to `true` to force refresh from API

**Example:**
```
GET /api/sbp/interest-rates?seriesKey=TS_GP_IR_SIRPR_AH.SBPOL0030&startDate=2020-01-01
```

**Response:**
```json
{
  "seriesKey": "TS_GP_IR_SIRPR_AH.SBPOL0030",
  "seriesName": "State Bank of Pakistan's Policy (Target) Rate",
  "data": [
    {
      "date": "2025-05-06",
      "value": 11,
      "series_key": "TS_GP_IR_SIRPR_AH.SBPOL0030",
      "series_name": "State Bank of Pakistan's Policy (Target) Rate",
      "unit": "Percent"
    }
  ],
  "count": 25,
  "latestStoredDate": "2025-05-06",
  "earliestStoredDate": "2020-03-18",
  "source": "database",
  "cached": true
}
```

## Caching Behavior

The API implements a **3-day cache**:
- Data is fetched from the SBP API if:
  - No data exists in the database
  - Last update was more than 3 days ago
  - `refresh=true` parameter is provided
- Otherwise, data is served from the database

## Features

1. **Interest Rate Chart**: Interactive line chart showing historical interest rates
2. **Multiple Series**: Support for Policy Rate, Repo Rate, and Reverse Repo Rate
3. **Automatic Updates**: Fetches new data from API when cache expires (3 days)
4. **Database Storage**: All data is stored locally for fast access
5. **Change Tracking**: Shows current rate and change from previous period

## Usage

1. Navigate to **Charts** page
2. Select **Macros** category from the sidebar
3. Click on **SBP Interest Rates**
4. Select a series from the dropdown (Policy Rate, Repo Rate, or Reverse Repo Rate)
5. View the interactive chart with historical data

## Troubleshooting

### API Key Issues

If you see "SBP_API_KEY environment variable is not set":
1. Check that `.env.local` exists in the project root
2. Verify `SBP_API_KEY` is set correctly
3. Restart your development server after adding the variable

### Database Errors

If you see database connection errors:
1. Verify `DATABASE_URL` is set correctly
2. Ensure the schema has been run (check if `sbp_interest_rates` table exists)
3. Check database connection permissions

### No Data Displayed

If the chart shows "No data available":
1. Check that the API key is valid
2. Verify the series key is correct
3. Check browser console for API errors
4. Try clicking the "Refresh" button to force a new fetch

## Related Files

- **API Route**: `app/api/sbp/interest-rates/route.ts`
- **Chart Component**: `components/charts/interest-rates-section.tsx`
- **Database Functions**: `lib/portfolio/db-client.ts` (SBP functions at the end)
- **Database Schema**: `lib/portfolio/db-schema.sql` (SBP tables at the end)
- **Charts Registry**: `lib/config/charts-registry.tsx` (Macros category)

