# Portfolio Tracker Design Document

## Overview
An all-in-one portfolio tracker supporting multiple asset classes with a clean, modern UI that matches the existing risk dashboard aesthetic.

## Supported Asset Types
1. **US Equities** - Stocks, ETFs listed on US exchanges (NYSE, NASDAQ)
2. **PK Equities** - Pakistan Stock Exchange (PSX) stocks
3. **Crypto** - Cryptocurrencies (BTC, ETH, and others)
4. **Bonds** - Government and corporate bonds
5. **Fixed Deposits (FDs)** - Bank fixed deposits
6. **Cash** - Cash balances in different currencies

## Core Features

### 1. Holdings Management
- **Add Holdings**: Form to add new positions
  - Asset type selector
  - Symbol/Ticker (e.g., AAPL, TSLA, BTC-USD)
  - Quantity/Shares
  - Purchase price
  - Purchase date
  - Currency
  - Notes (optional)
  
- **Edit Holdings**: Modify existing positions
- **Delete Holdings**: Remove positions with confirmation
- **Bulk Operations**: Import/Export CSV functionality (future)

### 2. Portfolio Overview
- **Total Portfolio Value**: Sum of all holdings
- **Total Gain/Loss**: Absolute and percentage
- **Asset Allocation**: Pie chart showing distribution by asset type
- **Top Performers**: Best and worst performing holdings
- **Quick Stats Cards**:
  - Total invested
  - Current value
  - Unrealized P&L
  - ROI percentage

### 3. Holdings Table
- Sortable columns:
  - Asset name/symbol
  - Asset type
  - Quantity
  - Avg. purchase price
  - Current price
  - Total invested
  - Current value
  - Gain/Loss ($)
  - Gain/Loss (%)
- Filter by asset type
- Search by symbol/name
- Group by asset type option

### 4. Visualizations
- **Allocation Chart**: Pie/donut chart by asset type
- **Performance Chart**: Line chart showing portfolio value over time
- **Asset Type Breakdown**: Bar chart comparing values by type
- **Individual Holdings**: Mini charts for each position (optional)

### 5. Price Updates
- **Manual Entry**: User can manually update prices
- **API Integration** (Future):
  - Crypto: CoinGecko API (free tier)
  - US Stocks: Alpha Vantage, Yahoo Finance, or Polygon.io
  - PK Stocks: PSX API or manual entry
  - Bonds: Manual entry or yield data
  - FDs: Manual entry

## Data Structure

```typescript
interface Holding {
  id: string
  assetType: 'us-equity' | 'pk-equity' | 'crypto' | 'bond' | 'fd' | 'cash'
  symbol: string
  name: string
  quantity: number
  purchasePrice: number
  purchaseDate: string // ISO date
  currentPrice: number
  currency: string // USD, PKR, etc.
  notes?: string
  createdAt: string
  updatedAt: string
}

interface Portfolio {
  holdings: Holding[]
  lastUpdated: string
}
```

## UI Layout

### Page Structure
1. **Header Section**
   - Page title: "Portfolio Tracker"
   - Add Holding button
   - Settings/Preferences button
   - Export/Import options

2. **Summary Cards Row**
   - Total Portfolio Value
   - Total Invested
   - Total Gain/Loss
   - ROI Percentage

3. **Charts Section**
   - Asset Allocation (Pie Chart)
   - Portfolio Performance (Line Chart)
   - Asset Type Comparison (Bar Chart)

4. **Holdings Table**
   - Full table with all positions
   - Filters and search
   - Sort options

## Technical Implementation

### File Structure
```
app/portfolio/
  page.tsx                    # Main portfolio page
components/portfolio/
  portfolio-dashboard.tsx     # Main dashboard component
  holdings-table.tsx          # Holdings table component
  add-holding-dialog.tsx      # Add/edit holding form
  portfolio-summary.tsx       # Summary cards
  allocation-chart.tsx        # Pie chart component
  performance-chart.tsx       # Line chart component
  asset-type-chart.tsx        # Bar chart component
lib/portfolio/
  portfolio-utils.ts          # Calculation utilities
  portfolio-storage.ts        # LocalStorage management
  price-fetcher.ts           # Price update logic (future)
  types.ts                    # TypeScript types
```

### State Management
- React useState for local state
- localStorage for persistence
- Future: Consider Zustand or Context API for complex state

### Styling
- Match existing dashboard theme
- Use shadcn/ui components
- Dark/light mode support
- Responsive design

## Future Enhancements
1. **Price API Integration**: Real-time price updates
2. **Historical Data**: Track portfolio value over time
3. **Dividends/Interest**: Track income from holdings
4. **Tax Reporting**: Generate tax reports
5. **Multi-Currency**: Handle currency conversions
6. **Alerts**: Price alerts and notifications
7. **Backup/Sync**: Cloud backup functionality
8. **Mobile App**: React Native version

## Implementation Phases

### Phase 1: Core Functionality (MVP)
- Basic CRUD operations for holdings
- Portfolio calculations
- Summary cards
- Holdings table
- LocalStorage persistence

### Phase 2: Visualizations
- Allocation chart
- Performance chart
- Asset type breakdown

### Phase 3: Enhanced Features
- Price API integration
- Historical tracking
- Export/Import
- Advanced filters

### Phase 4: Polish
- Animations
- Loading states
- Error handling
- Performance optimization





