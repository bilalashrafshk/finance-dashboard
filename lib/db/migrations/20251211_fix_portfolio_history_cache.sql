DROP TABLE IF EXISTS portfolio_history_cache;

CREATE TABLE portfolio_history_cache (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,                 -- The calculated history array
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  is_unified BOOLEAN NOT NULL DEFAULT false,
  format_version INTEGER DEFAULT 1,    -- To handle future data shape changes
  duration VARCHAR(10) DEFAULT 'ALL',  -- Kept for querying, but unique constraint excludes it
  last_updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure one cache record per user per view (currency + unified)
  UNIQUE(user_id, currency, is_unified)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_portfolio_history_cache_lookup ON portfolio_history_cache(user_id, currency, is_unified);
