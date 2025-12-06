-- Migration: Expand Screener Metrics Table
-- Adds columns for Valuation, Profitability, Health, Growth, Per Share, Technicals (3Y), and Dividends

ALTER TABLE screener_metrics
ADD COLUMN IF NOT EXISTS pb_ratio DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS ps_ratio DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS peg_ratio DECIMAL(10, 2),

ADD COLUMN IF NOT EXISTS roe DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS roa DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS gross_margin DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS operating_margin DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS net_margin DECIMAL(10, 2),

ADD COLUMN IF NOT EXISTS debt_to_equity DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS current_ratio DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS quick_ratio DECIMAL(10, 2),

ADD COLUMN IF NOT EXISTS revenue_growth DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS net_income_growth DECIMAL(10, 2),

ADD COLUMN IF NOT EXISTS book_value_per_share DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS sales_per_share DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS cash_per_share DECIMAL(10, 2),

ADD COLUMN IF NOT EXISTS beta_3y DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS sharpe_3y DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS sortino_3y DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS max_drawdown_3y DECIMAL(10, 4),
ADD COLUMN IF NOT EXISTS rsi_14 DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS ytd_return DECIMAL(10, 2),

ADD COLUMN IF NOT EXISTS dividend_payout_ratio DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS dividend_growth_5y DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS last_dividend_date DATE,
ADD COLUMN IF NOT EXISTS ex_dividend_date DATE;

-- Rename old 1y columns if they exist (handling re-run scenarios)
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'screener_metrics' AND column_name = 'beta_1y') THEN
    ALTER TABLE screener_metrics RENAME COLUMN beta_1y TO beta_3y;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'screener_metrics' AND column_name = 'sharpe_1y') THEN
    ALTER TABLE screener_metrics RENAME COLUMN sharpe_1y TO sharpe_3y;
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'screener_metrics' AND column_name = 'max_drawdown_1y') THEN
    ALTER TABLE screener_metrics RENAME COLUMN max_drawdown_1y TO max_drawdown_3y;
  END IF;
END $$;

-- Add index for faster filtering on common metrics
CREATE INDEX IF NOT EXISTS idx_screener_metrics_pe ON screener_metrics(pe_ratio);
CREATE INDEX IF NOT EXISTS idx_screener_metrics_market_cap ON screener_metrics(market_cap);
CREATE INDEX IF NOT EXISTS idx_screener_metrics_dividend_yield ON screener_metrics(dividend_yield);
CREATE INDEX IF NOT EXISTS idx_screener_metrics_beta ON screener_metrics(beta_3y);
