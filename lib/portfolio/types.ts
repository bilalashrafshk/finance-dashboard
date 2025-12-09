/**
 * Portfolio Tracker Types
 * 
 * Type definitions for portfolio holdings and related data structures.
 */

export type AssetType = 'us-equity' | 'pk-equity' | 'crypto' | 'fd' | 'cash' | 'metals' | 'commodities' | 'kse100' | 'spx500'

export interface Trade {
  id: number
  userId: number
  holdingId: number | null
  tradeType: 'buy' | 'sell' | 'add' | 'remove'
  assetType: string
  symbol: string
  name: string
  quantity: number
  price: number
  totalAmount: number
  currency: string
  tradeDate: string
  notes: string | null
  createdAt: string
}

export interface Holding {
  id: string
  assetType: AssetType
  symbol: string
  name: string
  quantity: number
  purchasePrice: number
  purchaseDate: string // ISO date string
  currentPrice: number
  currency: string // USD, PKR, etc.
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface Portfolio {
  holdings: Holding[]
  lastUpdated: string
}

export interface PortfolioSummary {
  totalInvested: number
  currentValue: number
  totalGainLoss: number // Unrealized PnL
  totalGainLossPercent: number
  holdingsCount: number
  dividendsCollected?: number
  dividendsCollectedPercent?: number
  cagr?: number // Compound Annual Growth Rate as percentage
  realizedPnL?: number // Realized PnL from sell transactions
  totalPnL?: number // Total PnL = Unrealized + Realized
}

export interface AssetTypeAllocation {
  assetType: AssetType
  value: number
  percentage: number
  count: number
}

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  'us-equity': 'US Equities',
  'pk-equity': 'PK Equities',
  'crypto': 'Cryptocurrency',
  'fd': 'Fixed Deposits',
  'cash': 'Cash',
  'metals': 'Metals',
  'commodities': 'Commodities',
  'kse100': 'KSE 100 Index',
  'spx500': 'S&P 500 Index',
}

export const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  'us-equity': '#3b82f6', // blue
  'pk-equity': '#10b981', // green
  'crypto': '#f59e0b', // amber
  'fd': '#06b6d4', // cyan
  'cash': '#6b7280', // gray
  'metals': '#f97316', // orange
  'commodities': '#ec4899', // pink
  'kse100': '#6366f1', // indigo
  'spx500': '#a855f7', // purple
}

