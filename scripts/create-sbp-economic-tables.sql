-- Create SBP Economic Data tables
-- Run this in Neon SQL Editor if tables don't exist

-- SBP Economic Data Table (CPI, GDP, etc.)
CREATE TABLE IF NOT EXISTS sbp_economic_data (
  id SERIAL PRIMARY KEY,
  series_key VARCHAR(100) NOT NULL,
  series_name VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  value DECIMAL(20, 8) NOT NULL,
  unit VARCHAR(50) NOT NULL DEFAULT 'Percent',
  observation_status VARCHAR(50) DEFAULT 'Normal',
  status_comments TEXT,
  source VARCHAR(50) NOT NULL DEFAULT 'sbp-easydata',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(series_key, date)
);

CREATE INDEX IF NOT EXISTS idx_sbp_economic_series_key ON sbp_economic_data(series_key);
CREATE INDEX IF NOT EXISTS idx_sbp_economic_date ON sbp_economic_data(date);
CREATE INDEX IF NOT EXISTS idx_sbp_economic_series_date ON sbp_economic_data(series_key, date DESC);

-- Metadata table for SBP Economic Data
CREATE TABLE IF NOT EXISTS sbp_economic_metadata (
  id SERIAL PRIMARY KEY,
  series_key VARCHAR(100) NOT NULL UNIQUE,
  last_stored_date DATE,
  last_updated TIMESTAMP DEFAULT NOW(),
  total_records INTEGER DEFAULT 0,
  source VARCHAR(50) NOT NULL DEFAULT 'sbp-easydata'
);

CREATE INDEX IF NOT EXISTS idx_sbp_economic_metadata_series_key ON sbp_economic_metadata(series_key);

