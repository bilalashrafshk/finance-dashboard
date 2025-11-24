# SBP EasyData API - Test Results ✅

## API Key
```
EE4D300822A1DA67800823DAADBA299D2962FE07
```

## Series Keys (Verified)

Based on the metadata endpoint: https://easydata.sbp.org.pk/api/v1/dataset/TS_GP_IR_SIRPR_AH/meta

| Series Code | Series Name | Available Since | Latest Value (2025-05-06) |
|------------|-------------|-----------------|---------------------------|
| `TS_GP_IR_SIRPR_AH.SBPOL0010` | Reverse Repo Rate (Ceiling) | 1956-01-01 | **12%** |
| `TS_GP_IR_SIRPR_AH.SBPOL0020` | Repo Rate (Floor) | 2009-08-17 | **10%** |
| `TS_GP_IR_SIRPR_AH.SBPOL0030` | Policy (Target) Rate | 2015-05-25 | **11%** |

## Test Results

### ✅ All Endpoints Working

**Policy Target Rate (2020-2025):**
- Total observations: 25
- Date range: 2020-03-18 to 2025-05-06
- Value range: 7% to 22%
- Latest: 11% (May 6, 2025)
- Average: 13.43%

**Interest Rate Corridor (Current):**
- Floor (Repo Rate): 10%
- Target: 11%
- Ceiling (Reverse Repo Rate): 12%

## API Endpoint Format

```
GET https://easydata.sbp.org.pk/api/v1/series/{series_key}/data?api_key={key}&start_date={date}&end_date={date}&format={json|csv}
```

### Parameters
- `api_key` (required): Your API key
- `start_date` (optional): ISO date format (YYYY-MM-DD)
- `end_date` (optional): ISO date format (YYYY-MM-DD), defaults to today
- `format` (optional): `json` (default) or `csv`

## Usage Examples

### Get Latest Policy Rate Only
```bash
npx tsx test_sbp_api.ts \
  --api-key=EE4D300822A1DA67800823DAADBA299D2962FE07 \
  --series-key=TS_GP_IR_SIRPR_AH.SBPOL0030
```

### Get Historical Data (2020-2025)
```bash
npx tsx test_sbp_api.ts \
  --api-key=EE4D300822A1DA67800823DAADBA299D2962FE07 \
  --series-key=TS_GP_IR_SIRPR_AH.SBPOL0030 \
  --start-date=2020-01-01 \
  --end-date=2025-12-31
```

### Get All Three Rates
```bash
# Reverse Repo Rate
npx tsx test_sbp_api.ts --api-key=EE4D300822A1DA67800823DAADBA299D2962FE07 --series-key=TS_GP_IR_SIRPR_AH.SBPOL0010 --start-date=2020-01-01

# Repo Rate
npx tsx test_sbp_api.ts --api-key=EE4D300822A1DA67800823DAADBA299D2962FE07 --series-key=TS_GP_IR_SIRPR_AH.SBPOL0020 --start-date=2020-01-01

# Policy Target Rate
npx tsx test_sbp_api.ts --api-key=EE4D300822A1DA67800823DAADBA299D2962FE07 --series-key=TS_GP_IR_SIRPR_AH.SBPOL0030 --start-date=2020-01-01
```

## Response Format

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
    [
      "Structure of Interest Rate: State Bank of Pakistan Policy Rates",
      "TS_GP_IR_SIRPR_AH.SBPOL0030",
      "State Bank of Pakistan's Policy (Target) Rate",
      "2025-05-06",
      "11",
      "Percent",
      "Normal",
      ""
    ]
  ]
}
```

## Next Steps

1. **Create API Route**: Integrate into Next.js app at `app/api/sbp/interest-rates/route.ts`
2. **Store in Database**: Save historical data for analysis and charting
3. **Create Chart Component**: Visualize interest rate trends over time
4. **Use in Risk Calculations**: Incorporate SBP rates into portfolio risk metrics

## Metadata Endpoint

You can also get dataset metadata:
```
GET https://easydata.sbp.org.pk/api/v1/dataset/TS_GP_IR_SIRPR_AH/meta?api_key={key}
```

This returns information about all series in the dataset, including:
- Series codes
- Series names and descriptions
- Data frequency
- Available date ranges
- Last refresh date

