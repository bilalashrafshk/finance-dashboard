# Stack Them Gains - Application Functionalities

## Overview
Stack Them Gains is a comprehensive investment risk analysis and portfolio management platform that provides real-time risk metrics, portfolio tracking, and asset screening capabilities.

---

## 1. Ethereum Risk Dashboard (`/eth-risk`)

### Core Features
- **Real-time Risk Metrics**: Live Ethereum risk analysis using quantitative models
- **Historical Data**: Fetches ~3,500 daily records from Binance API (since August 2015)
- **Weekly Resampling**: Converts daily data to weekly for trend analysis

### Risk Metrics
1. **Valuation Risk (S_val)**
   - Measures overvaluation/undervaluation relative to fair value trendline
   - Uses parametric log-regression model
   - Percentile rank mapping (0-1 scale)
   - Configurable cutoff date for backtesting

2. **Relative Risk to Bitcoin (S_rel)**
   - Analyzes ETH/BTC ratio performance
   - Peak/trough detection with trendline analysis
   - Measures strength relative to Bitcoin

3. **Overall Risk (Risk_eq)**
   - Composite metric combining Valuation and Relative Risk
   - Configurable weights (default: 50/50)
   - Additional variants: Valuation-heavy (70/30) and Relative-heavy (30/70)

### Dashboard Tabs
- **Risk Analysis**: Summary panel, Overall Risk chart, Price chart
- **Price & Valuation**: ETH/USD with fair value bands, Valuation Risk chart
- **Relative Risk to Bitcoin**: ETH/BTC ratio with trendlines, Relative Risk chart
- **Heat Map**: Visual heat map of risk metrics over time
- **Inverse Calculator**: Calculate ETH/USD prices for target risk levels
- **Parameters**: Configurable fair value band parameters and risk weights

### Key Features
- Interactive charts with crosshair tooltips
- Dark mode support
- Configurable parameters (base price, coefficients, multipliers)
- Adjustable risk metric weights
- Cutoff date support for backtesting

---

## 2. Portfolio Tracker (`/portfolio`)

### Supported Asset Types
- **US Equities**: Stocks, ETFs (NYSE, NASDAQ)
- **PK Equities**: Pakistan Stock Exchange (PSX) stocks
- **Cryptocurrency**: Bitcoin, Ethereum, and other Binance-listed coins
- **Metals**: Gold, Silver, Platinum, Palladium
- **Bonds**: Fixed income securities
- **Fixed Deposits**: Bank deposits
- **Cash**: Cash holdings
- **Commodities**: Other commodities
- **Indices**: KSE 100 Index, S&P 500 Index

### Portfolio Features
- **Multi-Asset Tracking**: Track holdings across all asset types
- **Real-time Price Updates**: Automatic price fetching from multiple APIs
- **Currency Support**: Multi-currency portfolios (USD, PKR, etc.)
- **Exchange Rate Conversion**: Unified portfolio view with currency conversion

### Portfolio Analytics
- **Portfolio Summary**:
  - Total portfolio value
  - Total invested
  - Total gain/loss (absolute and percentage)
  - CAGR (Compound Annual Growth Rate)
  - Holdings count

- **Dividend Tracking**:
  - Dividend collection tracking
  - Dividend-adjusted returns
  - Toggle to include/exclude dividends in returns

- **Asset Allocation**:
  - By asset type (pie charts)
  - By currency (segregated view)
  - Unified view with currency conversion

- **Performance Charts**:
  - Asset allocation visualization
  - Performance over time
  - Asset-specific portfolio charts (US Equity, PK Equity, Crypto, Metals)

### Portfolio Management
- **Add Holdings**: Purchase price, quantity, date tracking
- **Edit Holdings**: Update quantities, prices, notes
- **Delete Holdings**: Remove assets from portfolio
- **Price Refresh**: Manual and automatic price updates
- **Notes**: Add notes to each holding

### View Modes
- **Segregated**: View by currency (separate summaries per currency)
- **Unified**: Combined view with exchange rate conversion

---

## 3. Asset Screener (`/asset-screener`)

### Asset Tracking
- **Track Multiple Assets**: Add and monitor any supported asset type
- **User-Specific**: Each user has their own tracked assets list
- **Asset Details**: Symbol, name, currency, notes

### Risk Metrics & Analytics
For each tracked asset, calculates:

1. **Performance Metrics**:
   - Current price
   - YTD return (Year-to-Date)
   - CAGR (Compound Annual Growth Rate)

2. **Risk Metrics**:
   - Beta (1-year, relative to benchmark)
   - Sharpe Ratio (1-year, risk-adjusted return)
   - Sortino Ratio (1-year, downside risk-adjusted return)
   - Maximum Drawdown (1Y, 3Y, 5Y, All-time)

3. **Benchmark Comparison**:
   - Automatic benchmark selection (KSE 100 for PK equities, S&P 500 for US equities)
   - Beta calculation against benchmark
   - Relative performance analysis

4. **Seasonality Analysis**:
   - Monthly performance patterns
   - Historical monthly returns
   - Best/worst performing months

5. **Dividend Analysis**:
   - Dividend history table
   - Dividend yield
   - Dividend-adjusted price charts
   - Ex-dividend date tracking

### Asset Detail View
- **Price Charts**: Historical price visualization with dividend adjustments
- **Metrics Dashboard**: Comprehensive metrics display
- **Timeframe Selection**: 1Y, 3Y, 5Y, All-time for max drawdown
- **Risk-Free Rate Settings**: Configurable risk-free rates for Sharpe/Sortino calculations

### Modern Portfolio Theory (MPT)
- **Portfolio Optimization**: MPT-based portfolio optimization
- **Efficient Frontier**: Risk-return optimization
- **Asset Correlation**: Correlation matrix analysis
- **Optimal Weights**: Suggested portfolio allocations

### Risk-Free Rate Configuration
- **Customizable Rates**: Set risk-free rates for different markets
- **Market-Specific**: Different rates for US, PK, and other markets
- **Sharpe/Sortino Calculation**: Uses configured rates in calculations

---

## 4. Authentication & User Management

### Features
- **User Registration**: Create new accounts
- **User Login**: Secure authentication
- **User Profiles**: Email, name, avatar support
- **Session Management**: Persistent login sessions
- **Protected Routes**: Portfolio and Asset Screener require authentication

---

## 5. Data Sources & APIs

### Price Data Sources
- **Binance API**: Cryptocurrency prices and historical data
- **StockAnalysis API**: US equity historical data
- **PSX Data**: Pakistan Stock Exchange data
- **Metals API**: Precious metals prices
- **Investing.com Client API**: Indices (KSE 100, S&P 500) and metals historical data

### Historical Data Storage
- **Database Storage**: PostgreSQL database for historical price data
- **Caching**: Redis caching for performance optimization
- **Automatic Backfilling**: Historical data fetched and stored automatically
- **Data Deduplication**: Prevents duplicate API calls

---

## 6. Technical Features

### Performance
- **Caching**: Multi-level caching (Redis, in-memory)
- **Request Deduplication**: Prevents duplicate API calls
- **Optimized Queries**: Efficient database queries
- **Lazy Loading**: Components load on demand

### User Experience
- **Dark Mode**: Full dark mode support
- **Responsive Design**: Mobile, tablet, desktop optimized
- **Interactive Charts**: Chart.js with custom crosshair plugin
- **Real-time Updates**: Live price updates
- **Error Handling**: Graceful error handling and retry logic

### Data Management
- **Historical Data Management**: Automatic fetching and storage
- **Dividend Data**: Dividend history tracking and parsing
- **Market Hours**: Market hours awareness for price updates
- **Currency Conversion**: Real-time exchange rates

---

## 7. Key Algorithms

### Portfolio Optimization
- **Modern Portfolio Theory**: Mean-variance optimization
- **Quadratic Programming**: Efficient frontier calculation
- **Risk-Return Analysis**: Optimal portfolio weights

### Risk Calculations
- **Fair Value Bands**: Parametric log-regression model
- **Peak/Trough Detection**: Algorithm for trendline analysis
- **Percentile Rank Mapping**: Statistical risk normalization
- **Beta Calculation**: Regression-based beta against benchmarks

### Metrics Calculations
- **Sharpe Ratio**: Risk-adjusted return calculation
- **Sortino Ratio**: Downside risk-adjusted return
- **Max Drawdown**: Maximum peak-to-trough decline
- **CAGR**: Compound annual growth rate
- **YTD Return**: Year-to-date return calculation

---

## Summary

Stack Them Gains provides:
1. **Ethereum Risk Analysis**: Comprehensive quantitative risk metrics for ETH
2. **Multi-Asset Portfolio Tracking**: Track holdings across 10+ asset types
3. **Asset Screening**: Detailed risk and performance analysis for any asset
4. **Portfolio Optimization**: MPT-based portfolio optimization
5. **Real-time Data**: Live prices and historical data from multiple sources
6. **Advanced Analytics**: Beta, Sharpe, Sortino, Max Drawdown, CAGR, Seasonality
7. **Dividend Tracking**: Complete dividend history and analysis
8. **User Management**: Secure authentication and user-specific data

All features are designed for informed investment decision-making with comprehensive risk analysis and portfolio management capabilities.

