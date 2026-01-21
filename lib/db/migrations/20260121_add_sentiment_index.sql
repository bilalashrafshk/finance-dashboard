-- Add index for JSONB sentiment filtering to optimize "Bullish/Bearish" queries
CREATE INDEX IF NOT EXISTS idx_notable_events_sentiment ON notable_events ((metadata->'ai_analysis'->>'sentiment'));
