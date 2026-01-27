-- Create asset_analyses table
CREATE TABLE IF NOT EXISTS asset_analyses (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  url TEXT NOT NULL,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('video', 'presentation')),
  thought VARCHAR(50) NOT NULL CHECK (thought IN ('buy', 'sell', 'watch', 'hold')),
  remarks TEXT,
  analysis_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add index on symbol for faster lookups
CREATE INDEX IF NOT EXISTS idx_asset_analyses_symbol ON asset_analyses(symbol);
