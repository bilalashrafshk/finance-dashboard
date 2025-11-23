#!/usr/bin/env node
/**
 * Create Dividend Table Script
 * Creates the dividend_data table in the database
 */

const { Pool } = require('pg');
const path = require('path');

// Load environment variables from .env.local
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
} catch (e) {
  try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  } catch (e2) {
    // Continue without dotenv if not available
  }
}

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  console.error('❌ Error: DATABASE_URL or POSTGRES_URL not found');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

const createDividendTableSQL = `
-- Dividend data table
-- Stores dividend data for assets (only dividends, not bonus or right shares)
CREATE TABLE IF NOT EXISTS dividend_data (
  id SERIAL PRIMARY KEY,
  asset_type VARCHAR(50) NOT NULL,  -- 'pk-equity', 'us-equity', etc.
  symbol VARCHAR(50) NOT NULL,       -- 'PTC', 'HBL', etc.
  date DATE NOT NULL,                -- Dividend date (YYYY-MM-DD)
  dividend_amount DECIMAL(10, 4) NOT NULL,  -- Dividend amount (percent/10, e.g., 110% = 11.0)
  source VARCHAR(50) NOT NULL DEFAULT 'scstrade',  -- Data source
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint: one dividend record per asset+symbol+date
  UNIQUE(asset_type, symbol, date)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_dividend_asset_symbol ON dividend_data(asset_type, symbol);
CREATE INDEX IF NOT EXISTS idx_dividend_date ON dividend_data(date);
CREATE INDEX IF NOT EXISTS idx_dividend_asset_symbol_date ON dividend_data(asset_type, symbol, date);
CREATE INDEX IF NOT EXISTS idx_dividend_latest_date ON dividend_data(asset_type, symbol, date DESC);
`;

async function createTable() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Creating dividend_data table...');
    await client.query(createDividendTableSQL);
    console.log('✅ Dividend table created successfully!');
  } catch (error) {
    console.error('❌ Error creating table:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

createTable();




