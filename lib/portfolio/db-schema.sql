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

