-- Add asset_type to portfolio_history_cache to allow caching specific asset histories
ALTER TABLE portfolio_history_cache 
ADD COLUMN IF NOT EXISTS asset_type VARCHAR(50) DEFAULT 'ALL';

-- Drop the old unique constraint
ALTER TABLE portfolio_history_cache 
DROP CONSTRAINT IF EXISTS portfolio_history_cache_user_id_currency_is_unified_key;

-- Add new unique constraint including asset_type
-- Note: 'currency' and 'is_unified' columns were likely added in a previous migration not shown in the initial create table snippet I viewed.
-- I should verify the table structure first to be safe, but assuming they exist based on the service code usage:
-- WHERE user_id = $1 AND currency = $2 AND is_unified = $3

-- However, to be safe and idempotent:
DO $$
BEGIN
    -- Check if currency column exists, if not add it (just in case)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='portfolio_history_cache' AND column_name='currency') THEN
        ALTER TABLE portfolio_history_cache ADD COLUMN currency VARCHAR(10) DEFAULT 'USD';
    END IF;

    -- Check if is_unified column exists, if not add it
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='portfolio_history_cache' AND column_name='is_unified') THEN
        ALTER TABLE portfolio_history_cache ADD COLUMN is_unified BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Now add the constraint
-- We need to handle potential duplicates before adding unique constraint? 
-- Simplest is to truncate cache as it can be rebuilt.
TRUNCATE TABLE portfolio_history_cache;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_history_cache_unique 
ON portfolio_history_cache(user_id, currency, is_unified, asset_type);
