-- Migration: Add fiscal_quarter column to financial_statements table
-- This stores the quarter label directly from the source (e.g., "Q3 2025")

ALTER TABLE financial_statements 
ADD COLUMN IF NOT EXISTS fiscal_quarter VARCHAR(20);

-- Create index for faster queries by fiscal quarter
CREATE INDEX IF NOT EXISTS idx_financials_fiscal_quarter ON financial_statements(fiscal_quarter);

-- Add comment
COMMENT ON COLUMN financial_statements.fiscal_quarter IS 'Fiscal quarter label from source (e.g., "Q3 2025", "Q4 2024")';


