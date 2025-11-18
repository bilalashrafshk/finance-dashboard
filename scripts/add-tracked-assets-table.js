#!/usr/bin/env node
/**
 * Add Tracked Assets Table Script
 * Adds the user_tracked_assets table to the database
 */

const { Pool } = require('pg')
const path = require('path')

// Load environment variables from .env.local
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

if (!connectionString) {
  console.error('❌ Error: DATABASE_URL or POSTGRES_URL not found in .env.local')
  console.error('Please make sure .env.local exists and contains DATABASE_URL')
  process.exit(1)
}

// SQL to create the tracked assets table
const createTableSQL = `
-- User tracked assets table (for asset screener)
CREATE TABLE IF NOT EXISTS user_tracked_assets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_type VARCHAR(50) NOT NULL,
  symbol VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Prevent duplicate tracking of same asset by same user
  UNIQUE(user_id, asset_type, symbol)
);

CREATE INDEX IF NOT EXISTS idx_user_tracked_assets_user_id ON user_tracked_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tracked_assets_user_asset ON user_tracked_assets(user_id, asset_type, symbol);
`

// Create database connection
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

async function addTable() {
  const client = await pool.connect()
  
  try {
    console.log('🚀 Adding user_tracked_assets table...')
    console.log('✅ Connected to database')
    console.log('📝 Executing SQL...')
    
    // Execute the SQL
    await client.query(createTableSQL)
    
    // Verify the table was created
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_tracked_assets'
      );
    `)
    
    if (result.rows[0].exists) {
      console.log('')
      console.log('✅ Table user_tracked_assets created successfully!')
      console.log('')
      console.log('Table structure:')
      console.log('  - id (SERIAL PRIMARY KEY)')
      console.log('  - user_id (INTEGER, references users)')
      console.log('  - asset_type (VARCHAR)')
      console.log('  - symbol (VARCHAR)')
      console.log('  - name (VARCHAR)')
      console.log('  - currency (VARCHAR, default USD)')
      console.log('  - notes (TEXT)')
      console.log('  - created_at, updated_at (TIMESTAMP)')
      console.log('')
      console.log('Indexes created:')
      console.log('  - idx_user_tracked_assets_user_id')
      console.log('  - idx_user_tracked_assets_user_asset')
      console.log('')
      console.log('✅ Asset Screener is ready to use!')
      console.log('')
    } else {
      console.error('❌ Table was not created. Please check the error above.')
      process.exit(1)
    }
  } catch (error) {
    console.error('')
    console.error('❌ Error creating table:')
    if (error.code === '42P07') {
      console.error('⚠️  Table already exists. This is okay - the table is ready to use.')
      console.log('')
    } else {
      console.error(error.message)
      console.error('')
      console.error('Please check:')
      console.error('  1. Database connection string is correct')
      console.error('  2. Database is accessible')
      console.error('  3. Users table exists (required for foreign key)')
      console.error('')
      process.exit(1)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

addTable().catch((error) => {
  console.error('❌ Unexpected error:', error)
  process.exit(1)
})




