# Performance Metrics Calculation Guide

This document explains in detail how each performance metric is calculated in the portfolio dashboard.

## Overview

All metrics are calculated using historical portfolio value data from the `/api/user/portfolio/history` endpoint. The calculations exclude days with cash flows (deposits/withdrawals) to ensure accurate return calculations.

---

## 1. CAGR (Compound Annual Growth Rate)

**Displayed Value:** +306.78%  
**What it measures:** The annualized return rate that would have been required to grow your initial investment to its current value over the time period.

### Calculation Method

1. **Data Requirements:**
   - First non-zero portfolio value (start value)
   - Last portfolio value (end value)
   - Start date and end date

2. **Formula:**
   ```
   CAGR = ((Ending Value / Beginning Value) ^ (1 / Years)) - 1
   ```

3. **Step-by-Step Process:**
   ```typescript
   // 1. Find first non-zero portfolio entry
   firstValue = firstEntry.invested (or bookValue)
   lastValue = lastEntry.invested (or bookValue)
   
   // 2. Calculate time difference in years
   timeDiff = lastDate - firstDate (in milliseconds)
   years = timeDiff / (365.25 * 24 * 60 * 60 * 1000)
   
   // 3. Calculate growth ratio
   ratio = lastValue / firstValue
   
   // 4. Annualize the return
   CAGR = (ratio ^ (1 / years) - 1) * 100
   ```

4. **Key Points:**
   - Works for any time period (even less than 1 year)
   - Minimum requirement: At least 1 day of data (0.00274 years)
   - Handles portfolios that started at $0 by finding first positive value
   - Result is annualized, so a 3-month return is converted to what it would be over a full year

5. **Example:**
   - Start: $1,000 on Jan 1, 2023
   - End: $4,067.80 on Jan 1, 2024 (1 year later)
   - Ratio: 4.0678
   - CAGR: (4.0678^(1/1) - 1) * 100 = 306.78%

---

## 2. Max Drawdown

**Displayed Value:** -63.20%  
**What it measures:** The largest peak-to-trough decline in portfolio value over the entire history.

### Calculation Method

1. **Data Requirements:**
   - All historical portfolio values (sorted by date)

2. **Algorithm:**
   ```typescript
   peak = firstValue
   maxDrawdown = 0
   
   for each value in history:
     if value > peak:
       peak = value  // Update peak
     
     drawdown = ((value - peak) / peak) * 100
     
     if drawdown < maxDrawdown:
       maxDrawdown = drawdown  // Track worst drawdown
   ```

3. **Step-by-Step Process:**
   - Start with the first portfolio value as the initial peak
   - For each subsequent value:
     - If current value exceeds the peak, update the peak
     - Calculate drawdown from current peak: `(current - peak) / peak * 100`
     - Track the most negative drawdown value
   - Result is always negative (or zero if no decline)

4. **Key Points:**
   - Measures the worst decline from any peak
   - Always negative (or 0 if portfolio never declined)
   - Shows the maximum loss an investor would have experienced
   - Example: -63.20% means the portfolio dropped 63.20% from its highest point

5. **Example:**
   - Peak: $10,000
   - Trough: $3,680
   - Drawdown: (3,680 - 10,000) / 10,000 * 100 = -63.20%

---

## 3. Volatility (30-day)

**Displayed Value:** +14.31%  
**What it measures:** The annualized standard deviation of daily returns over the last 30 days, indicating how much the portfolio value fluctuates.

### Calculation Method

1. **Data Requirements:**
   - Last 30 days of daily returns (excluding cash flow days)
   - Minimum: 5 days of data

2. **Formula:**
   ```
   Volatility = Standard Deviation of Daily Returns × √252 × 100
   ```

3. **Step-by-Step Process:**
   ```typescript
   // 1. Get last 30 days of daily returns (as decimals)
   returns = last30Days.map(r => r.return / 100)
   
   // 2. Calculate mean return
   mean = sum(returns) / returns.length
   
   // 3. Calculate variance
   variance = sum((return - mean)²) / returns.length
   
   // 4. Calculate standard deviation
   stdDev = √variance
   
   // 5. Annualize (multiply by √252 trading days per year)
   volatility = stdDev × √252 × 100
   ```

4. **Key Points:**
   - Uses only the last 30 days of returns
   - Excludes days with cash flows (deposits/withdrawals)
   - Annualized to make it comparable across different time periods
   - √252 represents the square root of trading days in a year
   - Higher volatility = more price swings (riskier)

5. **Example:**
   - Daily returns: [0.5%, -0.3%, 0.8%, -0.2%, 0.4%]
   - Mean: 0.24%
   - Variance: 0.000184
   - Std Dev: 1.36% (daily)
   - Annualized: 1.36% × √252 = 21.6%

---

## 4. Sharpe Ratio

**Displayed Value:** 0.70  
**What it measures:** Risk-adjusted return. Shows how much excess return you're getting per unit of risk (volatility).

### Calculation Method

1. **Data Requirements:**
   - All daily returns (excluding cash flow days)
   - Minimum: 5 days of data
   - Risk-free rate: 2.5% (assumed annual rate)

2. **Formula:**
   ```
   Sharpe Ratio = (Annualized Return - Risk-Free Rate) / Annualized Volatility
   ```

3. **Step-by-Step Process:**
   ```typescript
   // 1. Get all daily returns (as decimals)
   returns = dailyReturns.map(r => r.return / 100)
   
   // 2. Calculate mean daily return
   meanDaily = sum(returns) / returns.length
   
   // 3. Calculate variance and standard deviation
   variance = sum((return - meanDaily)²) / returns.length
   stdDev = √variance
   
   // 4. Annualize return
   annualizedReturn = meanDaily × 252 × 100  // Convert to percentage
   
   // 5. Annualize volatility
   annualizedStdDev = stdDev × √252 × 100
   
   // 6. Calculate Sharpe Ratio
   riskFreeRate = 2.5  // 2.5% annual
   sharpeRatio = (annualizedReturn - riskFreeRate) / annualizedStdDev
   ```

4. **Key Points:**
   - Uses all available daily returns (not just 30 days)
   - Risk-free rate is assumed to be 2.5% annually
   - Higher Sharpe Ratio = better risk-adjusted returns
   - Interpretation:
     - < 1: Poor risk-adjusted return
     - 1-2: Good
     - 2-3: Very good
     - > 3: Excellent

5. **Example:**
   - Annualized Return: 20%
   - Risk-Free Rate: 2.5%
   - Annualized Volatility: 25%
   - Sharpe Ratio: (20 - 2.5) / 25 = 0.70

---

## 5. Beta

**Displayed Value:** 1.82  
**What it measures:** Sensitivity of your portfolio to market movements. Compares your portfolio's returns to a benchmark index.

### Calculation Method

1. **Data Requirements:**
   - Portfolio daily values (aligned with benchmark dates)
   - Benchmark prices (S&P 500 for USD, KSE 100 for PKR)
   - Minimum: 5 aligned data points

2. **Benchmark Selection:**
   - USD portfolios: S&P 500 (SPX500)
   - PKR portfolios: KSE 100 (KSE100)

3. **Formula:**
   ```
   Beta = Covariance(Portfolio Returns, Benchmark Returns) / Variance(Benchmark Returns)
   ```

4. **Step-by-Step Process:**
   ```typescript
   // 1. Fetch benchmark data for the same period
   benchmarkData = fetchHistoricalData(benchmarkSymbol, startDate, endDate)
   
   // 2. Align portfolio and benchmark dates
   commonDates = intersection(portfolioDates, benchmarkDates)
   
   // 3. Calculate daily returns for both
   for each date pair:
     portfolioReturn = (currPortfolio - prevPortfolio) / prevPortfolio
     benchmarkReturn = (currBenchmark - prevBenchmark) / prevBenchmark
   
   // 4. Calculate means
   portfolioMean = mean(portfolioReturns)
   benchmarkMean = mean(benchmarkReturns)
   
   // 5. Calculate covariance
   covariance = sum((portfolioReturn - portfolioMean) × (benchmarkReturn - benchmarkMean)) / (n - 1)
   
   // 6. Calculate benchmark variance
   benchmarkVariance = sum((benchmarkReturn - benchmarkMean)²) / (n - 1)
   
   // 7. Calculate beta
   beta = covariance / benchmarkVariance
   ```

5. **Key Points:**
   - Beta measures relative volatility compared to the market
   - Interpretation:
     - β = 1.0: Moves in line with the market
     - β > 1.0: More volatile than the market (aggressive)
     - β < 1.0: Less volatile than the market (defensive)
     - β = 1.82: Portfolio moves 1.82x as much as the market
   - Only calculated when benchmark data is available
   - Requires aligned dates between portfolio and benchmark

6. **Example:**
   - If S&P 500 goes up 1%, a portfolio with β = 1.82 typically goes up ~1.82%
   - If S&P 500 goes down 1%, the portfolio typically goes down ~1.82%

---

## Data Quality Considerations

### Cash Flow Handling
All return calculations **exclude days with cash flows** (deposits/withdrawals) because:
- Cash flows are not investment returns
- They would artificially inflate or deflate daily returns
- The system uses a small epsilon (0.01) to detect cash flows

### Minimum Data Requirements
- **CAGR:** At least 1 day of data
- **Max Drawdown:** At least 2 data points
- **Volatility:** At least 5 days of returns
- **Sharpe Ratio:** At least 5 days of returns
- **Beta:** At least 5 aligned data points with benchmark

### Date Alignment
- Portfolio history is sorted chronologically
- Beta calculation aligns portfolio and benchmark dates
- Only common dates are used for beta calculation

### Annualization
- **CAGR:** Uses actual time period (even if < 1 year)
- **Volatility:** Annualized using √252 (trading days)
- **Sharpe Ratio:** Both return and volatility are annualized
- **Beta:** No annualization needed (ratio of returns)

---

## Technical Implementation Details

### Code Location
All calculations are performed in:
- `components/portfolio/performance-metrics.tsx` (lines 39-352)

### API Endpoints Used
1. `/api/user/portfolio/history?days=ALL&currency={currency}&unified={unified}`
   - Fetches complete portfolio history
   
2. `/api/historical-data?assetType={type}&symbol={symbol}&startDate={start}&endDate={end}`
   - Fetches benchmark data for beta calculation

### Data Structure
```typescript
interface HistoryEntry {
  date: string
  invested: number  // Portfolio value (market value + cash)
  cashFlow: number  // Deposits/withdrawals (0 if none)
  bookValue?: number  // Alternative value field
}
```

---

## Summary

| Metric | Formula | Time Period | Annualized? | Benchmark? |
|--------|---------|-------------|-------------|------------|
| **CAGR** | `(End/Start)^(1/Years) - 1` | Full history | Yes | No |
| **Max Drawdown** | `Min((Value - Peak)/Peak)` | Full history | No | No |
| **Volatility** | `StdDev(Returns) × √252` | Last 30 days | Yes | No |
| **Sharpe Ratio** | `(Return - Rf) / Volatility` | Full history | Yes | No |
| **Beta** | `Cov(Port, Bench) / Var(Bench)` | Full history | No | Yes (S&P 500/KSE 100) |

---

## References

- **CAGR:** Standard compound annual growth rate formula
- **Max Drawdown:** Peak-to-trough decline calculation
- **Volatility:** Annualized standard deviation of returns
- **Sharpe Ratio:** William F. Sharpe's risk-adjusted return measure
- **Beta:** Capital Asset Pricing Model (CAPM) beta coefficient

