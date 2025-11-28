-- Database Indexes for Portfolio Performance Optimization
-- Run this migration to add indexes that improve query performance

-- Index for user_trades table - optimized for realized PnL queries
-- This index helps with queries filtering by user_id and trade_type
CREATE INDEX IF NOT EXISTS idx_user_trades_user_type_date 
ON user_trades(user_id, trade_type, trade_date DESC);

-- Index for user_trades table - optimized for transaction history queries
-- Helps with queries that need to order by trade_date
CREATE INDEX IF NOT EXISTS idx_user_trades_user_date 
ON user_trades(user_id, trade_date DESC);

-- Index for user_holdings table - optimized for fast load queries
-- Helps with queries filtering by user_id and ordering by asset_type
CREATE INDEX IF NOT EXISTS idx_user_holdings_user_asset 
ON user_holdings(user_id, asset_type, symbol);

-- Index for historical_price_data table - optimized for date range queries
-- Helps with queries filtering by asset_type, symbol, and date range
CREATE INDEX IF NOT EXISTS idx_historical_price_asset_symbol_date 
ON historical_price_data(asset_type, symbol, date DESC);

-- Composite index for dividend queries (if dividend table exists)
-- Helps with queries filtering by asset_type and symbol
-- Note: Adjust table name if your dividend table has a different name
-- CREATE INDEX IF NOT EXISTS idx_dividends_asset_symbol_date 
-- ON dividend_data(asset_type, symbol, date DESC);

-- Analyze tables after creating indexes to update query planner statistics
ANALYZE user_trades;
ANALYZE user_holdings;
ANALYZE historical_price_data;

