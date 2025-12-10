CREATE TABLE IF NOT EXISTS portfolio_history_cache (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,                 -- The calculated history array
  format_version INTEGER DEFAULT 1,    -- To handle future data shape changes
  duration VARCHAR(10) DEFAULT 'ALL',  -- '1M', '1Y', 'ALL'
  last_updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure one cache record per user per duration type
  UNIQUE(user_id, duration)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_portfolio_history_cache_user ON portfolio_history_cache(user_id);
