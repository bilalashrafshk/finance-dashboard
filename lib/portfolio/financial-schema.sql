-- Schema Migration: Financial Data & Company Profiles
-- Adds tables for fundamental analysis, company profiles, and financial statements

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
-- A wide table design is used to minimize joins for common ratios
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

-- 3. Trigger to update updated_at timestamp
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

