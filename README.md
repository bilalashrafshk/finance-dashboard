# Ethereum Risk Dashboard

A comprehensive real-time risk analysis dashboard for Ethereum (ETH) that provides quantitative risk metrics, valuation analysis, and relative performance indicators. Built with Next.js, React, TypeScript, and Chart.js.

**Author:** Bilal Ashraf

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Data Sources](#data-sources)
4. [Risk Metrics Explained](#risk-metrics-explained)
5. [Setup & Installation](#setup--installation)
6. [Architecture](#architecture)
7. [Configuration](#configuration)

---

## Overview

This dashboard provides a comprehensive risk analysis framework for Ethereum using multiple quantitative metrics. All metrics are normalized to a [0, 1] scale for intuitive interpretation:

- **0.0 - 0.3**: Low risk / Undervalued / Weak (Green)
- **0.3 - 0.7**: Medium risk / Fair Value / Neutral (Yellow)
- **0.7 - 1.0**: High risk / Overvalued / Strong (Red)

---

## Features

The dashboard includes five main tabs:

1. **Risk Analysis** (Default): Summary panel, Overall Risk chart, and Price chart
2. **Price & Valuation**: ETH/USD price with fair value bands and Valuation Risk chart
3. **Relative Risk to Bitcoin**: ETH/BTC ratio with trendlines and Relative Risk chart
4. **Heat Map**: Visual heat map of risk metrics over time
5. **Parameters**: Configurable fair value band parameters and risk weights

### Key Features

- Real-time data fetching from Binance API
- Interactive charts with crosshair tooltips (optimized to prevent re-rendering on hover)
- Dark mode support
- Configurable parameters for fair value calculations
- Adjustable risk metric weights
- Cutoff date support for backtesting scenarios
- **Inverse Risk-to-Price Calculator**: Calculate ETH/USD prices that correspond to specific risk levels at a future date
  - Automatically generates risk levels from 0.0 to 0.95 in 0.1 increments
  - Shows current risk level and price when target date is today
  - Default target date is today
  - Displays table with Valuation Risk and Risk Relative to Bitcoin metrics

---

## Data Sources

### Primary Data Source: Binance API

The dashboard fetches historical cryptocurrency data from the **Binance Public API**:

- **API Endpoint**: `https://api.binance.com/api/v3/klines`
- **Symbols Fetched**:
  - `ETHBTC`: Ethereum to Bitcoin ratio
  - `BTCUSDT`: Bitcoin to USDT (for USD conversion)
- **Interval**: Daily (`1d`)
- **Start Date**: August 8, 2015 (Ethereum launch)

### Data Processing

1. **ETH/USD Calculation**: 
   ```
   ETH/USD = ETH/BTC × BTC/USDT
   ```
   Calculated for each timestamp where both ETH/BTC and BTC/USDT data exist.

2. **Weekly Resampling**:
   - Daily data is resampled to weekly frequency
   - Uses pandas-style `W-SUN` logic (weeks ending on Sunday)
   - For each week, keeps the last (most recent) day's data
   - Reduces ~3,500 daily records to ~500 weekly records

### Data Fetching Details

- Fetches data in batches of 1000 candles per request
- Implements pagination to retrieve all historical data
- 30-second timeout per API request
- 100ms delay between requests to respect rate limits
- Maximum 50 iterations to prevent infinite loops
- 2-minute overall timeout for complete data fetch

---

## Risk Metrics Explained

### 1. Valuation Risk

**What it measures**: How overvalued or undervalued Ethereum is relative to its calculated fair value trendline.

**Calculation Process**:

1. **Fair Value Calculation**:
   - Uses parametric log-regression model (Pine script style)
   - Formula: `ln(fairValue) = ln(basePrice) + baseCoeff + growthCoeff × ln(years)`
   - Where `years` = years since start date (default: December 3, 2014)

2. **Log Residuals**:
   ```
   residual = ln(actualPrice) - ln(fairValue)
   ```

3. **Z-Score Calculation**:
   ```
   z = residual / σ
   ```
   Where `σ` (sigma) is the standard deviation of log residuals.

4. **Percentile Rank Mapping**:
   - Z-scores are mapped to their percentile rank in the historical distribution
   - Uses binary search for efficient percentile calculation
   - Result is naturally bounded to [0, 1] without clipping

5. **Cutoff Date Feature**:
   - Optional cutoff date allows using only historical data up to a specific point
   - Prevents look-ahead bias in backtesting scenarios
   - Default: Last date of 2024 in the dataset

**Interpretation**:
- **0.0 - 0.3**: Undervalued (price significantly below fair value)
- **0.3 - 0.7**: Fair Value (price near fair value trendline)
- **0.7 - 1.0**: Overvalued (price significantly above fair value)

---

### 2. Relative Risk to Bitcoin

**What it measures**: Ethereum's risk relative to Bitcoin based on trendline analysis of the ETH/BTC ratio.

**Calculation Process**:

1. **Log Space Conversion**:
   - ETH/BTC ratio is converted to log space for peak/trough detection
   - `logRatio = ln(ETH/BTC)`

2. **Peak and Trough Detection**:
   - **Peaks**: Local maxima where `value[i] > value[i-1] && value[i] > value[i+1]`
   - **Troughs**: Local minima where `value[i] < value[i-1] && value[i] < value[i+1]`

3. **Top Extremes Selection**:
   - Selects top N peaks (highest values) and bottom N troughs (lowest values)
   - N = min(5, max(3, floor(peaks.length / 3)))
   - Ensures global maximum and minimum are always included

4. **Linear Regression Trendlines**:
   - Fits linear regression to top peaks in log space: `upperTrendline = slope × time + intercept`
   - Fits linear regression to bottom troughs in log space: `lowerTrendline = slope × time + intercept`
   - Uses least squares method for regression

5. **Gap Adjustment**:
   - Calculates gap between upper and lower trendlines
   - Enforces minimum gap: `minGap = percentile(abs(price_changes), 95) × 0.1`
   - Prevents unrealistic compression of trendlines

6. **Relative Position Calculation**:
   ```
   relativePosition = (currentLogPrice - lowerTrendline) / adjustedGap
   ```
   - Clamped to [0, 1] range
   - 0 = at lower trendline (weakest relative to BTC)
   - 1 = at upper trendline (strongest relative to BTC)

**Interpretation**:
- **0.0 - 0.3**: Weak (underperforming Bitcoin)
- **0.3 - 0.7**: Neutral
- **0.7 - 1.0**: Strong (outperforming Bitcoin)

---

### 3. Overall Risk (Risk_eq)

**What it measures**: Composite risk metric that combines both Valuation Risk and Relative Risk to Bitcoin.

**Calculation**:

```
Risk_eq = (w1 × Valuation Risk + w2 × Relative Risk to Bitcoin) / (w1 + w2)
```

Where:
- `w1` = Valuation Risk weight (default: 0.5)
- `w2` = Relative Risk to Bitcoin weight (default: 0.5)
- Weights are normalized to sum to 1.0

**Default Configuration**:
- Equal weights (50% each) for balanced risk assessment
- User-configurable through the Parameters tab

**Interpretation**:
- **0.0 - 0.3**: Low Risk
- **0.3 - 0.7**: Medium Risk
- **0.7 - 1.0**: High Risk

### Additional Risk Variants

Two additional risk metrics with different weightings:

- **Valuation-Focused Risk (Risk_valHeavy)**: 70% Valuation Risk, 30% Relative Risk to Bitcoin
- **Relative-Focused Risk (Risk_relHeavy)**: 30% Valuation Risk, 70% Relative Risk to Bitcoin

---

### 4. Inverse Risk-to-Price Calculator

**What it does**: Calculates what ETH/USD price would achieve a target risk level at a future date.

**Features**:
- Automatically generates risk levels from 0.0 to 0.95 in 0.1 increments
- Default target date is today
- Only requires two inputs:
  - Target date (defaults to today)
  - Target BTC price (defaults to current BTC price)
- Displays comprehensive table showing:
  - Risk level (0.0, 0.1, 0.2, ..., 0.9, 0.95)
  - Corresponding ETH/USD price
  - Valuation Risk at that price
  - Risk Relative to Bitcoin at that price
  - Actual Risk_eq achieved
  - Fair value at target date
  - ETH/BTC ratio
- **Current Market Position**: When target date is today, highlights the current risk level and price with a "Current" badge

**How it works**:
- Uses binary search to find ETH/USD price that achieves target Risk_eq
- Extrapolates fair value bands and ETH/BTC trendlines to the target date
- Calculates Valuation Risk and Risk Relative to Bitcoin for each hypothetical price
- Combines them using configured risk weights to find matching Risk_eq

---

## Setup & Installation

### Prerequisites

- Node.js 18+ (recommended: Node.js 22+)
- npm, pnpm, or yarn package manager

### Installation Steps

1. **Clone or navigate to the project directory**:
   ```bash
   cd "Risk Metric Dashboard"
   ```

2. **Install dependencies**:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```
   The server will start on `http://localhost:3002`

4. **Build for production**:
   ```bash
   npm run build
   npm start
   ```

### Environment Variables

No environment variables are required. The application uses public Binance API endpoints.

---

## Architecture

### Technology Stack

- **Framework**: Next.js 15.2.4 (React 19)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4.1.9
- **Charts**: Chart.js with react-chartjs-2
- **UI Components**: Radix UI primitives (shadcn/ui)
- **Theme**: next-themes (dark mode support)
- **Date Handling**: date-fns 4.1.0

### Project Structure

```
Risk Metric Dashboard/
├── app/                          # Next.js app directory
│   ├── layout.tsx                # Root layout with ThemeProvider
│   ├── page.tsx                  # Main page
│   └── globals.css               # Global styles
├── components/                    # React components
│   ├── eth-risk-dashboard.tsx    # Main dashboard component
│   ├── price-chart.tsx           # Price chart with fair value bands
│   ├── s-val-chart.tsx           # Valuation Risk chart
│   ├── s-rel-chart.tsx           # Relative Risk to Bitcoin chart
│   ├── eth-btc-proper-chart.tsx  # ETH/BTC chart with trendlines
│   ├── risk-eq-chart.tsx         # Overall Risk chart
│   ├── heat-map-chart.tsx        # Heat map visualization
│   ├── summary-panel.tsx         # Summary panel component
│   ├── inverse-risk-calculator.tsx  # Inverse risk-to-price calculator
│   ├── chart-explanation-dialog.tsx  # Chart explanations
│   ├── metrics-explanation.tsx   # Metrics explanations
│   ├── theme-toggle.tsx          # Dark mode toggle
│   └── ui/                       # Reusable UI components (shadcn/ui)
├── lib/
│   ├── algorithms/               # Core calculation algorithms
│   │   ├── fair-value-bands.ts   # Fair value band calculation
│   │   ├── s-val-calculation.ts   # Valuation Risk calculation
│   │   ├── s-rel-calculation.ts   # Relative Risk to Bitcoin calculation
│   │   ├── peak-trough-detection.ts  # Peak/trough detection
│   │   ├── risk-metrics.ts       # Composite risk metrics
│   │   ├── inverse-risk-to-price.ts  # Inverse risk-to-price calculation
│   │   └── helpers.ts             # Helper functions
│   ├── charts/                    # Chart configuration
│   │   ├── chart-config.ts        # Chart.js configuration
│   │   ├── crosshair-plugin.ts    # Custom crosshair plugin
│   │   └── dataset-helpers.ts     # Dataset creation helpers
│   ├── config/                    # Configuration files
│   │   ├── app.config.ts          # Application configuration
│   │   └── metric-names.config.ts # Metric display names
│   ├── eth-analysis.ts            # Main analysis orchestration
│   └── utils.ts                   # Utility functions
├── hooks/                         # Custom React hooks
│   ├── use-toast.ts              # Toast notification hook
│   └── use-mobile.ts              # Mobile detection hook
└── public/                        # Static assets
```

### Data Flow

1. **Data Fetching** (`lib/eth-analysis.ts`):
   - Fetches ETH/BTC and BTC/USDT data from Binance API
   - Merges data to calculate ETH/USD
   - Resamples daily data to weekly

2. **Fair Value Calculation** (`lib/algorithms/fair-value-bands.ts`):
   - Calculates fair value using parametric log-regression
   - Calculates statistical bands (2σ, 3σ)

3. **Risk Metrics Calculation**:
   - **Valuation Risk**: Uses fair value bands and percentile mapping
   - **Relative Risk to Bitcoin**: Uses peak/trough detection and trendlines
   - **Overall Risk**: Combines both metrics with weights

4. **Chart Rendering**:
   - Charts receive processed metrics
   - Use Chart.js for visualization
   - Custom crosshair plugin for interactivity

---

## Configuration

### Application Configuration

**File**: `lib/config/app.config.ts`

All hardcoded parameters are centralized in this file:

#### Fair Value Band Parameters

```typescript
DEFAULT_FAIR_VALUE_BAND_PARAMS = {
  basePrice: 0.16,        // Base price in USD
  baseCoeff: 1.7,         // Base coefficient
  growthCoeff: 3.22,      // Growth coefficient
  startYear: 2014,        // Start year
  startMonth: 12,         // Start month (1-12)
  startDay: 3,            // Start day
  mainMult: 1.0,          // Main multiplier
  upperMult: 1.35,        // Upper band multiplier
  lowerMult: 0.7,         // Lower band multiplier
  offset: 0.0             // Offset
}
```

#### Risk Weights

```typescript
DEFAULT_RISK_WEIGHTS = {
  sValWeight: 0.5,        // Valuation Risk weight
  sRelWeight: 0.5         // Relative Risk to Bitcoin weight
}
```

#### Risk Variant Weights

```typescript
RISK_VARIANT_WEIGHTS = {
  valHeavy: {
    sValWeight: 0.7,
    sRelWeight: 0.3
  },
  relHeavy: {
    sValWeight: 0.3,
    sRelWeight: 0.7
  }
}
```

#### Risk Thresholds

```typescript
RISK_THRESHOLDS = {
  high: 0.7,              // High risk threshold
  low: 0.3                // Low risk threshold
}
```

#### Valuation Risk Cutoff Configuration

```typescript
S_VAL_CUTOFF_CONFIG = {
  defaultYear: 2024       // Default year for cutoff date (used for Valuation Risk calculation)
}
```

### Metric Names Configuration

**File**: `lib/config/metric-names.config.ts`

User-friendly display names for all metrics used throughout the UI.

---

## Key Design Decisions

### Why Weekly Resampling?

- **Reduces Noise**: Daily price movements can be volatile and noisy
- **Computational Efficiency**: ~7x reduction in data points
- **Trend Preservation**: Weekly data preserves long-term trends
- **Industry Standard**: Many financial analyses use weekly data

### Why Log Space for ETH/BTC Analysis?

- **Multiplicative Relationships**: Cryptocurrency ratios often follow multiplicative patterns
- **Better Trendline Fitting**: Linear regression works better in log space
- **Proportional Changes**: Log space treats 10% changes equally regardless of absolute level

### Why Percentile Rank for Valuation Risk?

- **Natural Bounding**: Automatically bounds to [0, 1] without clipping
- **No Retroactive Changes**: Once calculated, percentile ranks don't change when new data is added
- **Statistical Robustness**: Less sensitive to outliers than z-score clipping
- **Intuitive Interpretation**: Percentile rank is easier to understand than raw z-scores

### Why Minimum Gap Enforcement?

- **Prevents Unrealistic Compression**: Ensures trendlines don't collapse to a single line
- **Maintains Signal**: Preserves meaningful relative position information
- **Robustness**: Handles edge cases with few extremes gracefully

---

## Mathematical Formulas Reference

### Fair Value Calculation

```
ln(fairValue) = ln(basePrice) + baseCoeff + growthCoeff × ln(years)
fairValue = exp(ln(fairValue)) × mainMult + offset
```

Where:
- `years = (currentDate - startDate) / (365.25 × 24 × 60 × 60 × 1000)`
- `years = max(0.01, years)`

### Statistical Bands

```
sigma = std(logResiduals)
upper2s = exp(logFair + 2.0 × sigma)
lower2s = exp(logFair - 2.0 × sigma)
upper3s = exp(logFair + 3.0 × sigma)
lower3s = exp(logFair - 3.0 × sigma)
```

### Valuation Risk (formerly S_val)

```
residual = ln(price) - ln(fairValue)
z = residual / sigma
valuationRisk = percentileRank(z, historicalZDistribution)
```

### Relative Risk to Bitcoin (formerly S_rel)

```
logRatio = ln(ETH/BTC)
upperTrendline = linearRegression(topPeaks)
lowerTrendline = linearRegression(bottomTroughs)
gap = upperTrendline - lowerTrendline
minGap = percentile(abs(priceChanges), 95) × 0.1
adjustedGap = max(gap, minGap)
relativeRiskToBitcoin = (currentLogRatio - lowerTrendline) / adjustedGap
relativeRiskToBitcoin = clamp(relativeRiskToBitcoin, 0, 1)
```

### Overall Risk (Risk_eq)

```
Risk_eq = (w1 × Valuation Risk + w2 × Relative Risk to Bitcoin) / (w1 + w2)
```

Where weights are normalized to sum to 1.0.

---

## Performance Considerations

### Data Processing

- **Weekly Resampling**: Reduces ~3,500 daily records to ~500 weekly records
- **Efficient Algorithms**: Binary search for percentile rank (O(log n))
- **Memoization**: Chart data and options are memoized with `useMemo`
- **Lazy Loading**: Charts only render when visible (via tab system)

### API Optimization

- **Batch Fetching**: 1000 candles per request
- **Pagination**: Automatic pagination until all data retrieved
- **Rate Limiting**: 100ms delay between requests
- **Timeout Handling**: 30-second timeout per request, 2-minute overall timeout

### Memory Management

- **Chart Cleanup**: Chart instances are destroyed before creating new ones
- **State Management**: Efficient React state updates
- **Data Structures**: Uses Maps for O(1) lookups during data merging

---

## License

Private project by Bilal Ashraf.

---

**Last Updated**: 2025
