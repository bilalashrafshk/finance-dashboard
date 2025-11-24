# SBP EasyData API Test Guide

## Series Keys for Interest Rate Dataset

Based on the dataset page URL: `TS_GP_IR_SIRPR_AH`

The series keys for the three interest rate series shown in the dataset are likely:
- **Policy (Target) Rate**: `TS_GP_IR_SIRPR_AH.SIRPR001` (or similar)
- **Repo Rate**: `TS_GP_IR_SIRPR_AH.SIRPR002` (or similar)  
- **Reverse Repo Rate**: `TS_GP_IR_SIRPR_AH.SIRPR003` (or similar)

## How to Get Your API Key

1. Go to https://easydata.sbp.org.pk
2. Login to your account
3. Navigate to "My Data Basket" under "My Account"
4. Generate an API key

## Running the Test

```bash
# With API key as environment variable
SBP_API_KEY=your_api_key_here npx tsx test_sbp_api.ts

# With API key as parameter
npx tsx test_sbp_api.ts --api-key=your_api_key_here

# With date range
npx tsx test_sbp_api.ts --api-key=your_api_key_here --series-key=TS_GP_IR_SIRPR_AH.SIRPR001 --start-date=2020-01-01 --end-date=2024-12-31

# Get CSV format
npx tsx test_sbp_api.ts --api-key=your_api_key_here --format=csv
```

## Finding the Correct Series Keys

If the example series keys don't work, you may need to:
1. Inspect the dataset page HTML/network requests to find the exact series keys
2. Use the API's series discovery endpoint (if available)
3. Contact SBP support for the exact series key format

