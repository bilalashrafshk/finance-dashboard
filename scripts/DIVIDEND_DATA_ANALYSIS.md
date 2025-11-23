# Dividend Data Analysis Summary

## Date Range

**Oldest Date Found**: `2010-08-29` (August 29, 2010)  
**Source**: UBL (United Bank Ltd.)

**Newest Date Found**: `2025-11-07` (November 7, 2025)  
**Source**: OGDC (Oil & Gas Development Company Ltd.)

**Total Date Span**: ~15 years (5,549 days)

### Company Date Ranges

| Ticker | Company Name | Records | Oldest Date | Newest Date |
|--------|-------------|---------|-------------|-------------|
| UBL | United Bank Ltd. | 56 | 2010-08-29 | 2025-10-23 |
| OGDC | Oil & Gas Development Company Ltd. | 60 | 2010-10-01 | 2025-11-07 |
| MCB | MCB Bank Ltd. | 59 | 2010-09-16 | 2025-10-30 |
| ABL | Allied Bank Ltd. | 54 | 2010-09-03 | 2025-10-31 |
| HBL | Habib Bank Ltd. | 51 | 2011-03-15 | 2025-10-31 |
| MEBL | Meezan Bank Ltd. | 42 | 2011-03-18 | 2025-11-03 |
| BAHL | Bank AL-Habib Ltd. | 23 | 2011-03-04 | 2025-10-30 |
| BAFL | Bank Alfalah Ltd. | 25 | 2012-03-21 | 2025-11-03 |
| LUCK | Lucky Cement Ltd. Consolidated | 11 | 2010-10-18 | 2025-09-17 |
| PTC | Pakistan Telecommunication Co. Ltd. | 12 | 2011-06-10 | 2020-05-15 |
| JSBL | JS Bank Ltd. | 1 | 2023-06-22 | 2023-06-22 |
| ENGRO | Engro Corporation Ltd. | 0 | N/A | N/A |

---

## Data Anomalies Found

### 1. Very High Dividends (>100%)
**Occurrences**: 16  
**Companies**: UBL, LUCK, MCB

- UBL: 160% (multiple dates in 2024-2025)
- UBL: 110% (multiple dates)
- LUCK: 200% (Sep 2025)
- LUCK: 180% (Sep 2023)
- LUCK: 150% (Sep 2024)
- MCB: 150% (Mar 2021)

**Note**: These are valid - some companies pay very high dividend percentages.

---

### 2. Missing % Sign in Dividend
**Occurrences**: 1  
**Example**: 
- ABL: `"12.50"` (should be `"12.50%"`) on 2013-09-03

**Parsing Strategy**: Extract numeric value even if % sign is missing.

---

### 3. Double % Sign
**Occurrences**: 1  
**Example**:
- LUCK: `"80%%(FY13)"` on 2013-10-14

**Parsing Strategy**: Handle double % signs by extracting number before first %.

---

### 4. Missing Space Before Annotation
**Occurrences**: 1  
**Example**:
- BAFL: `"20%CY12"` (should be `"20%(CY12)"`) on 2013-03-21

**Parsing Strategy**: Extract numeric value before any non-numeric characters.

---

### 5. Trailing Whitespace in Company Name
**Occurrences**: 23 (all from BAHL)  
**Example**:
- BAHL: `"Bank AL-Habib Ltd.                   "` (has trailing spaces)

**Parsing Strategy**: Always trim company names when storing.

---

### 6. Bonus Shares with Descriptive Text
**Occurrences**: 3  
**Examples**:
- MEBL: `"10% 1 Share for every 10 Shares"` (2019-05-09)
- MEBL: `"10% 1 Share for every 10 Shares"` (2018-09-18)
- BAFL: `"10% 1 Share for every 10 Shares"` (2018-09-14)

**Parsing Strategy**: Extract numeric value before % sign, ignore descriptive text.

---

### 7. Right Shares Present
**Occurrences**: 2  
**Examples**:
- MEBL: `"6%Right Share for every 100 Share"` (2017-08-17)
- JSBL: `"17%"` (2023-06-22)

**Note**: Right shares are less common but should be parsed similarly to dividends.

---

### 8. Records with Only Bonus/Right, No Dividend
**Occurrences**: 5

**Only Bonus, No Dividend** (4 occurrences):
- MEBL: Bonus 10% (2020-09-09)
- MEBL: Bonus 11% (2013-03-15)
- MEBL: Bonus 12.50% (2012-03-16)
- MEBL: Bonus 15% (2011-03-18)

**Only Right Shares, No Dividend** (1 occurrence):
- JSBL: Right 17% (2023-06-22)

**Parsing Strategy**: Valid records should include dividend OR bonus OR right shares (not necessarily all).

---

### 9. Bonus Shares with Typos
**Examples Found**:
- MCB: `"10.%"` (missing digit, should be `"10%"`)
- BAHL: `"15.%"` (missing digit)

**Parsing Strategy**: Handle gracefully, extract what's available.

---

### 10. Dividend Annotations Variations
**Found Patterns**:
- `"35%(CY15)"` - Calendar year annotation
- `"30%(FY14)"` - Fiscal year annotation
- `"17.50% (iii)"` - Roman numeral annotation
- `"25% (ii)"` - Roman numeral annotation
- `"20% (CY 10)"` - Calendar year with space
- `"30% (CY10)"` - Calendar year with space
- `"40% (FY)"` - Fiscal year only

**Parsing Strategy**: Strip all annotations, extract only numeric value.

---

## Summary of Parsing Requirements

1. **Extract numeric value** before first `%` sign
2. **Handle missing % sign** - extract number if present
3. **Handle double % signs** - extract before first %
4. **Strip annotations** - remove `(CY15)`, `(FY14)`, `(iii)`, etc.
5. **Handle descriptive text** - extract number from bonus/right shares text
6. **Trim whitespace** - especially company names
7. **Support high percentages** - 100%+ are valid
8. **Handle typos** - gracefully parse what's available
9. **Accept records with only bonus/right** - not just dividends
10. **Parse dates** from "DD MMM YYYY" format

---

## Data Quality Assessment

✅ **Good**:
- Consistent date format
- Most data is well-formatted
- Good coverage (15 years of data)
- Most companies have regular dividend history

⚠️ **Issues**:
- Some formatting inconsistencies (missing %, double %, typos)
- Trailing whitespace in some company names
- Descriptive text in bonus shares
- Some companies have very sparse data (JSBL: 1 record, PTC: 12 records)

---

## Recommendations

1. **Robust Parsing**: Implement flexible parsing that handles all edge cases
2. **Data Validation**: Validate parsed values (e.g., ensure dates are reasonable)
3. **Data Cleaning**: Trim whitespace, normalize formats
4. **Error Logging**: Log parsing issues for manual review
5. **Fallback Values**: Use null/undefined for unparseable values rather than failing




