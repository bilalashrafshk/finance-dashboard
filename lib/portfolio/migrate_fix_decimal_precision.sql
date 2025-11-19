-- Migration: Fix DECIMAL precision for financial_statements table
-- Some columns may have been created with DECIMAL(10, 4) instead of DECIMAL(20, 2)
-- This causes overflow errors when inserting large financial values

-- Alter all financial metric columns to DECIMAL(20, 2) to handle large values
-- (Values are in actual currency units, e.g., 96,192,000,000 for 96.192B revenue)

ALTER TABLE financial_statements
  ALTER COLUMN revenue TYPE DECIMAL(20, 2),
  ALTER COLUMN cost_of_revenue TYPE DECIMAL(20, 2),
  ALTER COLUMN gross_profit TYPE DECIMAL(20, 2),
  ALTER COLUMN operating_expenses TYPE DECIMAL(20, 2),
  ALTER COLUMN operating_income TYPE DECIMAL(20, 2),
  ALTER COLUMN interest_expense TYPE DECIMAL(20, 2),
  ALTER COLUMN interest_income TYPE DECIMAL(20, 2),
  ALTER COLUMN currency_gain_loss TYPE DECIMAL(20, 2),
  ALTER COLUMN pretax_income TYPE DECIMAL(20, 2),
  ALTER COLUMN income_tax_expense TYPE DECIMAL(20, 2),
  ALTER COLUMN net_income TYPE DECIMAL(20, 2),
  ALTER COLUMN cash_and_equivalents TYPE DECIMAL(20, 2),
  ALTER COLUMN short_term_investments TYPE DECIMAL(20, 2),
  ALTER COLUMN accounts_receivable TYPE DECIMAL(20, 2),
  ALTER COLUMN inventory TYPE DECIMAL(20, 2),
  ALTER COLUMN total_current_assets TYPE DECIMAL(20, 2),
  ALTER COLUMN property_plant_equipment TYPE DECIMAL(20, 2),
  ALTER COLUMN total_assets TYPE DECIMAL(20, 2),
  ALTER COLUMN accounts_payable TYPE DECIMAL(20, 2),
  ALTER COLUMN total_current_liabilities TYPE DECIMAL(20, 2),
  ALTER COLUMN total_debt TYPE DECIMAL(20, 2),
  ALTER COLUMN total_liabilities TYPE DECIMAL(20, 2),
  ALTER COLUMN total_equity TYPE DECIMAL(20, 2),
  ALTER COLUMN retained_earnings TYPE DECIMAL(20, 2),
  ALTER COLUMN operating_cash_flow TYPE DECIMAL(20, 2),
  ALTER COLUMN capital_expenditures TYPE DECIMAL(20, 2),
  ALTER COLUMN free_cash_flow TYPE DECIMAL(20, 2),
  ALTER COLUMN dividends_paid TYPE DECIMAL(20, 2),
  ALTER COLUMN change_in_working_capital TYPE DECIMAL(20, 2);

-- EPS columns should remain DECIMAL(10, 4) as they are small values
-- shares_outstanding columns should remain DECIMAL(20, 0) as they are whole numbers

