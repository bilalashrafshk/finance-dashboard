-- Historical Price Data Storage Schema
-- Stores historical price data for all asset types with incremental updates

-- Main table for historical price data
CREATE TABLE IF NOT EXISTS historical_price_data (
  id SERIAL PRIMARY KEY,
  asset_type VARCHAR(50) NOT NULL,  -- 'pk-equity', 'us-equity', 'crypto', 'spx500', 'kse100'
  symbol VARCHAR(50) NOT NULL,       -- 'PTC', 'AAPL', 'BTC', 'SPX500', 'KSE100'
  date DATE NOT NULL,                -- Trading date (YYYY-MM-DD)
  open DECIMAL(20, 8),               -- Opening price
  high DECIMAL(20, 8),                -- High price
  low DECIMAL(20, 8),                 -- Low price
  close DECIMAL(20, 8) NOT NULL,      -- Closing price
  volume DECIMAL(20, 8),              -- Trading volume (supports decimals for crypto)
  adjusted_close DECIMAL(20, 8),      -- Adjusted close (if available)
  change_pct DECIMAL(10, 4),          -- Change percentage (if available)
  source VARCHAR(50) NOT NULL,        -- 'stockanalysis', 'binance', 'investing'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint: one record per asset+symbol+date
  UNIQUE(asset_type, symbol, date)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_historical_asset_symbol ON historical_price_data(asset_type, symbol);
CREATE INDEX IF NOT EXISTS idx_historical_date ON historical_price_data(date);
CREATE INDEX IF NOT EXISTS idx_historical_asset_symbol_date ON historical_price_data(asset_type, symbol, date);

-- Index for finding latest date per asset
CREATE INDEX IF NOT EXISTS idx_historical_latest_date ON historical_price_data(asset_type, symbol, date DESC);

-- Metadata table to track last update time per asset
CREATE TABLE IF NOT EXISTS historical_data_metadata (
  id SERIAL PRIMARY KEY,
  asset_type VARCHAR(50) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  last_stored_date DATE,              -- Latest date we have data for
  last_updated TIMESTAMP DEFAULT NOW(),
  total_records INTEGER DEFAULT 0,    -- Count of records for this asset
  source VARCHAR(50) NOT NULL,
  
  UNIQUE(asset_type, symbol)
);

CREATE INDEX IF NOT EXISTS idx_metadata_asset_symbol ON historical_data_metadata(asset_type, symbol);

-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- User holdings table (replaces localStorage)
CREATE TABLE IF NOT EXISTS user_holdings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_type VARCHAR(50) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  purchase_price DECIMAL(20, 8) NOT NULL,
  purchase_date DATE NOT NULL,
  current_price DECIMAL(20, 8) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_holdings_user_id ON user_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_holdings_user_asset ON user_holdings(user_id, asset_type, symbol);

-- User trades table (transaction history)
CREATE TABLE IF NOT EXISTS user_trades (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  holding_id INTEGER REFERENCES user_holdings(id) ON DELETE SET NULL,
  trade_type VARCHAR(20) NOT NULL, -- 'buy', 'sell', 'add', 'remove'
  asset_type VARCHAR(50) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  price DECIMAL(20, 8) NOT NULL,
  total_amount DECIMAL(20, 8) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  trade_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_trades_user_id ON user_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_user_trades_user_date ON user_trades(user_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_user_trades_holding_id ON user_trades(holding_id);

-- User tracked assets table (for asset screener)
CREATE TABLE IF NOT EXISTS user_tracked_assets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_type VARCHAR(50) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Prevent duplicate tracking of same asset by same user
  UNIQUE(user_id, asset_type, symbol)
);

CREATE INDEX IF NOT EXISTS idx_user_tracked_assets_user_id ON user_tracked_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tracked_assets_user_asset ON user_tracked_assets(user_id, asset_type, symbol);

-- Dividend data table
-- Stores dividend data for assets (only dividends, not bonus or right shares)
CREATE TABLE IF NOT EXISTS dividend_data (
  id SERIAL PRIMARY KEY,
  asset_type VARCHAR(50) NOT NULL,  -- 'pk-equity', 'us-equity', etc.
  symbol VARCHAR(50) NOT NULL,       -- 'PTC', 'HBL', etc.
  date DATE NOT NULL,                -- Dividend date (YYYY-MM-DD)
  dividend_amount DECIMAL(10, 4) NOT NULL,  -- Dividend amount (percent/10, e.g., 110% = 11.0)
  source VARCHAR(50) NOT NULL DEFAULT 'scstrade',  -- Data source
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint: one dividend record per asset+symbol+date
  UNIQUE(asset_type, symbol, date)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_dividend_asset_symbol ON dividend_data(asset_type, symbol);
CREATE INDEX IF NOT EXISTS idx_dividend_date ON dividend_data(date);
CREATE INDEX IF NOT EXISTS idx_dividend_asset_symbol_date ON dividend_data(asset_type, symbol, date);
CREATE INDEX IF NOT EXISTS idx_dividend_latest_date ON dividend_data(asset_type, symbol, date DESC);

-- 1. Company Profiles Table
-- Stores static/slow-moving data about the entity (Sector, Industry, Description)
-- Also acts as a cache for "Latest Snapshot" metrics used in the Screener
CREATE TABLE IF NOT EXISTS company_profiles (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(50) NOT NULL,
  asset_type VARCHAR(50) NOT NULL DEFAULT 'pk-equity', -- 'pk-equity', 'us-equity'
  name VARCHAR(255),
  sector VARCHAR(100),                 -- e.g., 'Energy', 'Technology'
  industry VARCHAR(100),               -- e.g., 'Oil & Gas Exploration'
  website VARCHAR(255),
  description TEXT,
  
  -- Face Value (for dividend calculations)
  face_value DECIMAL(10, 2),
  
  -- Latest Snapshot Metrics (Updated Daily/Weekly)
  market_cap DECIMAL(20, 2),
  shares_outstanding DECIMAL(20, 2),
  float_shares DECIMAL(20, 2),
  beta DECIMAL(10, 4),
  
  last_updated TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint per asset
  UNIQUE(asset_type, symbol)
);

-- Index for fast lookups by sector/industry
CREATE INDEX IF NOT EXISTS idx_profiles_sector ON company_profiles(sector);
CREATE INDEX IF NOT EXISTS idx_profiles_industry ON company_profiles(industry);

-- 2. Financial Statements Table
-- Stores the historical time-series of financial reports (Quarterly & Annual)
CREATE TABLE IF NOT EXISTS financial_statements (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(50) NOT NULL,
  asset_type VARCHAR(50) NOT NULL DEFAULT 'pk-equity',
  period_end_date DATE NOT NULL,       -- The 'As of' date (e.g., 2025-09-30)
  period_type VARCHAR(20) NOT NULL,    -- 'quarterly', 'annual', 'ttm'
  
  -- Income Statement (Profitability)
  revenue DECIMAL(20, 2),
  cost_of_revenue DECIMAL(20, 2),
  gross_profit DECIMAL(20, 2),
  operating_expenses DECIMAL(20, 2),
  operating_income DECIMAL(20, 2),     -- EBIT
  interest_expense DECIMAL(20, 2),
  interest_income DECIMAL(20, 2),      -- Critical for PSX (Cash rich companies)
  currency_gain_loss DECIMAL(20, 2),   -- Critical for PSX (Devaluation impact)
  pretax_income DECIMAL(20, 2),
  income_tax_expense DECIMAL(20, 2),
  net_income DECIMAL(20, 2),
  eps_basic DECIMAL(10, 4),
  eps_diluted DECIMAL(10, 4),
  shares_outstanding_basic DECIMAL(20, 0),
  shares_outstanding_diluted DECIMAL(20, 0),
  
  -- Balance Sheet (Health)
  cash_and_equivalents DECIMAL(20, 2),
  short_term_investments DECIMAL(20, 2), -- T-Bills/Mutual Funds
  accounts_receivable DECIMAL(20, 2),    -- Critical for Circular Debt
  accrued_interest_receivable DECIMAL(20, 2),  -- Bank-specific: Interest receivable
  other_receivables DECIMAL(20, 2),            -- Bank-specific: Other receivables
  inventory DECIMAL(20, 2),
  total_current_assets DECIMAL(20, 2),
  property_plant_equipment DECIMAL(20, 2),
  total_assets DECIMAL(20, 2),
  
  accounts_payable DECIMAL(20, 2),
  total_current_liabilities DECIMAL(20, 2),
  total_debt DECIMAL(20, 2),             -- Short + Long Term Debt
  total_liabilities DECIMAL(20, 2),
  
  total_equity DECIMAL(20, 2),
  retained_earnings DECIMAL(20, 2),      -- Accumulated Profits
  
  -- Cash Flow Statement (Reality Check)
  operating_cash_flow DECIMAL(20, 2),
  capital_expenditures DECIMAL(20, 2),
  free_cash_flow DECIMAL(20, 2),
  dividends_paid DECIMAL(20, 2),
  change_in_working_capital DECIMAL(20, 2), -- Cash trapped in ops
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraint: Only one record per period type per date for a symbol
  UNIQUE(asset_type, symbol, period_end_date, period_type)
);

-- Indexes for time-series queries
CREATE INDEX IF NOT EXISTS idx_financials_symbol_date ON financial_statements(symbol, period_end_date DESC);
CREATE INDEX IF NOT EXISTS idx_financials_period_type ON financial_statements(period_type);

-- 3. Trigger to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_financial_statements_modtime ON financial_statements;
CREATE TRIGGER update_financial_statements_modtime
    BEFORE UPDATE ON financial_statements
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- 4. Screener Metrics Table (Materialized View for Efficiency)
-- Stores pre-calculated valuation metrics for the Relative Valuation Screener
-- Updated via Cron Job (daily)
CREATE TABLE IF NOT EXISTS screener_metrics (
  id SERIAL PRIMARY KEY,
  asset_type VARCHAR(50) NOT NULL,     -- 'pk-equity'
  symbol VARCHAR(50) NOT NULL,
  sector VARCHAR(100),
  
  -- Price Data
  price DECIMAL(20, 2),
  price_date DATE,
  
  -- Valuation Metrics
  pe_ratio DECIMAL(10, 2),             -- Price / EPS (TTM)
  pb_ratio DECIMAL(10, 2),             -- Price / Book Value
  dividend_yield DECIMAL(10, 2),       -- Annual Dividend / Price %
  
  -- Relative Metrics (Pre-calculated for speed)
  sector_pe DECIMAL(10, 2),            -- Average P/E of the sector
  relative_pe DECIMAL(10, 2),          -- Stock P/E / Sector P/E
  
  market_cap DECIMAL(20, 2),
  
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(asset_type, symbol)
);

-- Indexes for filtering/sorting
CREATE INDEX IF NOT EXISTS idx_screener_sector ON screener_metrics(sector);
CREATE INDEX IF NOT EXISTS idx_screener_pe ON screener_metrics(pe_ratio);
CREATE INDEX IF NOT EXISTS idx_screener_relative_pe ON screener_metrics(relative_pe);

-- Market Cycles Table
-- Stores completed market cycles (trough-to-peak) for efficient retrieval
-- Only completed cycles are stored; current/ongoing cycle is calculated on-the-fly
CREATE TABLE IF NOT EXISTS market_cycles (
  id SERIAL PRIMARY KEY,
  asset_type VARCHAR(50) NOT NULL,  -- 'kse100', 'spx500', etc.
  symbol VARCHAR(50) NOT NULL,       -- 'KSE100', 'SPX500', etc.
  cycle_id INTEGER NOT NULL,          -- Cycle number (1, 2, 3, etc.)
  cycle_name VARCHAR(50) NOT NULL,   -- 'Cycle 1', 'Cycle 2', etc.
  start_date DATE NOT NULL,          -- Trough date
  end_date DATE NOT NULL,            -- Peak date
  start_price DECIMAL(20, 8) NOT NULL,
  end_price DECIMAL(20, 8) NOT NULL,
  roi DECIMAL(10, 2) NOT NULL,       -- ROI percentage
  duration_trading_days INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint: one cycle per asset+symbol+cycle_id
  UNIQUE(asset_type, symbol, cycle_id)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_market_cycles_asset_symbol ON market_cycles(asset_type, symbol);
CREATE INDEX IF NOT EXISTS idx_market_cycles_asset_symbol_cycle ON market_cycles(asset_type, symbol, cycle_id);
CREATE INDEX IF NOT EXISTS idx_market_cycles_end_date ON market_cycles(end_date DESC);
