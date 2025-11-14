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

