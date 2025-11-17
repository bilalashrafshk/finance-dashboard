# Dividend API Test Results

## Endpoint Details

**URL**: `https://scstrade.com/MarketStatistics/MS_xDates.aspx/chartact`  
**Method**: POST  
**Content-Type**: `application/json`

## Request Format

```json
{
  "par": "HBL - Habib Bank Ltd.",
  "_search": false,
  "nd": 1763402743607,
  "rows": 30,
  "page": 1,
  "sidx": "",
  "sord": "asc"
}
```

### Request Parameters

- `par` (required): Company ticker OR full name format
  - ✅ **Just ticker works**: `"HBL"` 
  - ✅ **Full format also works**: `"HBL - Habib Bank Ltd."`
  - Recommendation: Use just ticker for simplicity
- `nd`: Timestamp (can use `Date.now()`)
- `rows`: Number of records to return (default: 30)
- `page`: Page number (default: 1)
- `_search`: Boolean (default: false)
- `sidx`: Sort index (default: "")
- `sord`: Sort order (default: "asc")

## Response Format

```json
{
  "d": [
    {
      "company_code": "HBL",
      "company_name": "Habib Bank Ltd.",
      "sector_name": "COMMERCIAL BANKS",
      "bm_dividend": "50%",
      "bm_bonus": "",
      "bm_right_per": "",
      "bm_bc_exp": "31 Oct 2025"
    },
    ...
  ]
}
```

## Response Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `company_code` | string | Stock ticker | `"HBL"` |
| `company_name` | string | Full company name | `"Habib Bank Ltd."` |
| `sector_name` | string | Sector classification | `"COMMERCIAL BANKS"` |
| `bm_dividend` | string | Dividend percentage | `"50%"`, `"40.50%"`, `"35%(CY15)"` |
| `bm_bonus` | string | Bonus shares percentage | `""`, `"10%"` |
| `bm_right_per` | string | Right shares percentage | `""` (usually empty) |
| `bm_bc_exp` | string | Expiry date | `"31 Oct 2025"` |

## Date Format

Dates are in format: **"DD MMM YYYY"** (e.g., "31 Oct 2025", "15 May 2020")

## Data Quality Observations

### 1. Dividend Value Parsing

The `bm_dividend` field can contain:
- Simple percentage: `"50%"`, `"40.50%"`
- With annotations: `"35%(CY15)"`, `"30%(FY14)"`, `"17.50% (iii)"`
- **Very high values**: `"160%"`, `"200%"` (seen in UBL, LUCK)
- **Data quality issues**: `"80%%(FY13)"` (double % sign - seen in LUCK)
- Empty string: `""`

**Parsing Strategy**:
- Extract numeric value before the `%` sign
- Handle decimal values (e.g., `"40.50%"` → `40.5`)
- Strip annotations like `(CY15)`, `(FY14)`, `(iii)`, etc.
- Handle double % signs: `"80%%"` → extract `80`
- Support high percentages (100%+ are valid for some companies)

### 2. Empty Records

The API returns exactly `rows` number of records, padding with empty records if there aren't enough dividend events.

**Filtering Strategy**:
- Filter out records where `bm_bc_exp` is empty or `bm_dividend` is empty
- Or check if `bm_dividend` has a value before processing

### 3. Bonus Shares

The `bm_bonus` field:
- Usually empty (`""`)
- Sometimes contains percentage: `"10%"`, `"15%"`
- **Can contain descriptive text**: `"10% 1 Share for every 10 Shares"`
- May have typos: `"10.%"` (seen in MCB)
- **Some records have only bonus, no dividend** (seen in MEBL)
- Should be parsed similarly to dividend
- Extract numeric value from descriptive text if present

### 4. Date Parsing

Dates need to be parsed from "DD MMM YYYY" format:
- Example: `"31 Oct 2025"` → `2025-10-31`
- Month abbreviations: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
- Empty dates indicate padding records that should be filtered

### 5. Right Shares

The `bm_right_per` field:
- Usually empty (`""`)
- Can contain descriptive text: `"6%Right Share for every 100 Share"`
- Should be parsed to extract percentage value

## Test Results Summary

### Tested Companies

1. **HBL - Habib Bank Ltd.**
   - ✅ 55 dividend records (with some empty padding)
   - ✅ Dates from 2010 to 2025
   - ✅ Mix of dividend percentages (10% to 55%)
   - ✅ Some bonus shares in older records

2. **PTC - Pakistan Telecommunication Company Ltd.**
   - ✅ 26 dividend records (with empty padding)
   - ✅ Dates from 2010 to 2020
   - ✅ Lower dividend percentages (5% to 17.5%)
   - ✅ No bonus shares in recent records

3. **OGDC - Oil & Gas Development Company Ltd.**
   - ✅ 81 dividend records (with empty padding)
   - ✅ Dates from 2010 to 2025
   - ✅ Wide range of dividend percentages (5% to 50%)
   - ✅ Regular dividend payments

4. **UBL - United Bank Ltd.**
   - ✅ 60 dividend records (with empty padding)
   - ✅ Dates from 2010 to 2025
   - ✅ **Very high dividends** (10% to **160%**)
   - ✅ Recent dividends consistently 110-160%
   - ✅ No bonus shares in recent records

5. **MEBL - Meezan Bank Ltd.**
   - ✅ 47 dividend records (with empty padding)
   - ✅ Dates from 2011 to 2025
   - ✅ Dividend percentages (10% to 80%, recent: 70%)
   - ✅ **Bonus shares present**: "10%", "15%", "10% 1 Share for every 10 Shares"
   - ✅ **Right shares present**: "6%Right Share for every 100 Share"
   - ✅ Some records have only bonus, no dividend

6. **MCB - MCB Bank Ltd.**
   - ✅ 62 dividend records (with empty padding)
   - ✅ Dates from 2010 to 2025
   - ✅ Consistent dividends (30% to 90%, recent: 90%)
   - ✅ One spike: 150% in Mar 2021
   - ✅ Bonus shares in older records (10%)

7. **LUCK - Lucky Cement Ltd.**
   - ✅ 29 dividend records (with empty padding)
   - ✅ Dates from 2010 to 2025
   - ✅ **Very high dividends** (40% to **200%**)
   - ✅ Recent dividends: 150-200%
   - ⚠️ Data quality issue: "80%%(FY13)" (double % sign)

8. **ENGRO - Engro Corporation Ltd.**
   - ❌ **Empty array returned** - No dividend data found
   - Possible reasons: No dividends, ticker mismatch, or data not available

## Parsing Helper Functions Needed

### 1. Parse Dividend Percentage
```javascript
function parseDividendPercentage(dividendStr) {
  if (!dividendStr || dividendStr.trim() === '') return null;
  
  // Extract number before % sign
  const match = dividendStr.match(/^([\d.]+)/);
  if (!match) return null;
  
  return parseFloat(match[1]);
}
```

### 2. Parse Date
```javascript
function parseDividendDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  
  const months = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };
  
  const parts = dateStr.trim().split(' ');
  if (parts.length !== 3) return null;
  
  const [day, month, year] = parts;
  return `${year}-${months[month]}-${day.padStart(2, '0')}`;
}
```

### 3. Filter Valid Records
```javascript
function isValidDividendRecord(record) {
  // Valid if has either dividend, bonus, or right shares, AND has a date
  const hasDividend = record.bm_dividend && record.bm_dividend.trim() !== '';
  const hasBonus = record.bm_bonus && record.bm_bonus.trim() !== '';
  const hasRight = record.bm_right_per && record.bm_right_per.trim() !== '';
  const hasDate = record.bm_bc_exp && record.bm_bc_exp.trim() !== '';
  
  return (hasDividend || hasBonus || hasRight) && hasDate;
}
```

### 4. Parse Bonus Shares (with descriptive text)
```javascript
function parseBonusPercentage(bonusStr) {
  if (!bonusStr || bonusStr.trim() === '') return null;
  
  // Extract number before % sign (handles "10%" or "10% 1 Share for every 10 Shares")
  const match = bonusStr.match(/^([\d.]+)/);
  if (!match) return null;
  
  return parseFloat(match[1]);
}
```

## Integration Notes

1. **Company Name Format**: ✅ **Just ticker works!**
   - Can use just ticker: `"HBL"` instead of `"HBL - Habib Bank Ltd."`
   - No need for company name mapping
   - Simplifies integration significantly

2. **Rate Limiting**: Add delays between requests (1 second tested, seems safe)

3. **Error Handling**: 
   - Handle network errors
   - Handle invalid company names (returns empty array)
   - Handle malformed dates

4. **Caching**: Consider caching dividend data since it doesn't change frequently

5. **Data Storage**: 
   - Store parsed dividend records in database
   - Include: ticker, date, dividend_percentage, bonus_percentage, expiry_date

## Next Steps

1. ✅ Test API endpoint - **COMPLETE**
2. ⏳ Create parsing utility functions
3. ⏳ Create API route wrapper
4. ⏳ Design database schema for dividend data
5. ⏳ Integrate with asset screener/portfolio features

