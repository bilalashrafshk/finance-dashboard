# SBP EasyData API Test - Summary

## ✅ Created Test Script

I've created a test script (`test_sbp_api.ts`) to test the State Bank of Pakistan EasyData API endpoint for retrieving historical interest rate data.

## 📋 What the Script Does

The script tests the API endpoint:
```
GET https://easydata.sbp.org.pk/api/v1/series/[series_key]/data?api_key=[key]&start_date=[date]&end_date=[date]&format=[json|csv]
```

Features:
- ✅ Tests API connectivity
- ✅ Retrieves historical data with date ranges
- ✅ Supports both JSON and CSV formats
- ✅ Displays formatted results with summary statistics
- ✅ Handles errors gracefully with helpful messages

## 🚀 How to Use

### 1. Get Your API Key

You need to:
1. Go to https://easydata.sbp.org.pk
2. Login to your account
3. Navigate to "My Data Basket" under "My Account"
4. Generate an API key

### 2. Run the Test

**Basic test (most recent data only):**
```bash
SBP_API_KEY=your_api_key_here npx tsx test_sbp_api.ts
```

**With date range:**
```bash
npx tsx test_sbp_api.ts \
  --api-key=your_api_key_here \
  --series-key=TS_GP_IR_SIRPR_AH.SIRPR001 \
  --start-date=2020-01-01 \
  --end-date=2024-12-31
```

**Get CSV format:**
```bash
npx tsx test_sbp_api.ts \
  --api-key=your_api_key_here \
  --series-key=TS_GP_IR_SIRPR_AH.SIRPR001 \
  --format=csv
```

## 🔑 Finding Series Keys

Based on the dataset page you showed (Interest Rate: State Bank of Pakistan Policy Rates), the series keys are likely in the format:
- `TS_GP_IR_SIRPR_AH.SIRPR001` - Policy (Target) Rate
- `TS_GP_IR_SIRPR_AH.SIRPR002` - Repo Rate  
- `TS_GP_IR_SIRPR_AH.SIRPR003` - Reverse Repo Rate

**To find exact series keys:**
1. Open the dataset page in your browser
2. Open browser DevTools (F12) → Network tab
3. Check the table rows or API calls to see the exact series key format
4. Or inspect the page source/HTML for the series identifiers

## 📊 Expected Response Format

The API returns data in this format:
```json
{
  "columns": [
    "Dataset Name",
    "Series Key", 
    "Series Name",
    "Observation Date",
    "Observation Value",
    "Unit",
    "Observation Status",
    "Status Comments"
  ],
  "rows": [
    ["Country-wise Workers' Remittances", "TS_GP_BOP_WR_M.WR0010", "Total Cash inflow...", "2022-07-31", "2523.753816", "Million USD", "Normal", ""]
  ]
}
```

## 🧪 Test Results

The script will:
- ✅ Show the API request details
- ✅ Display the response data in a formatted table
- ✅ Provide summary statistics (date range, value range, latest value, average)
- ✅ Handle errors with helpful messages

## 📝 Next Steps

Once you have your API key and confirm the series keys work:

1. **Integrate into your app**: Create an API route in `app/api/sbp/` to fetch this data
2. **Store in database**: Save historical interest rate data for analysis
3. **Use in charts**: Display SBP policy rates in your risk dashboard

Would you like me to:
- Create an API route to integrate this into your Next.js app?
- Set up database storage for SBP interest rate data?
- Create a chart component to visualize the interest rate trends?

