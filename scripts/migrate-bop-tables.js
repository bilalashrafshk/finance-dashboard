/**
 * Migration script to create Balance of Payments tables
 * Run with: node scripts/migrate-bop-tables.js
 */

const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

if (!connectionString) {
  console.error('❌ DATABASE_URL or POSTGRES_URL environment variable is required')
  process.exit(1)
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

const bopTablesSQL = `
-- Balance of Payments Table
-- Stores Pakistan's Balance of Payments data from SBP EasyData API
CREATE TABLE IF NOT EXISTS balance_of_payments (
  id SERIAL PRIMARY KEY,
  series_key VARCHAR(100) NOT NULL,  -- 'TS_GP_ES_PKBOPSTND_M.BOPSNA01810', etc.
  series_name VARCHAR(255) NOT NULL,  -- 'Current account-Net'
  date DATE NOT NULL,                  -- Observation date (YYYY-MM-DD)
  value DECIMAL(20, 2) NOT NULL,       -- Value in Million USD (can be negative)
  unit VARCHAR(50) NOT NULL DEFAULT 'Million USD',
  observation_status VARCHAR(50) DEFAULT 'Normal',
  status_comments TEXT,
  source VARCHAR(50) NOT NULL DEFAULT 'sbp-easydata',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint: one record per series+date
  UNIQUE(series_key, date)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_bop_series_key ON balance_of_payments(series_key);
CREATE INDEX IF NOT EXISTS idx_bop_date ON balance_of_payments(date);
CREATE INDEX IF NOT EXISTS idx_bop_series_date ON balance_of_payments(series_key, date DESC);

-- Metadata table to track last update time per series (for 3-day caching)
CREATE TABLE IF NOT EXISTS bop_metadata (
  id SERIAL PRIMARY KEY,
  series_key VARCHAR(100) NOT NULL UNIQUE,
  last_stored_date DATE,              -- Latest date we have data for
  last_updated TIMESTAMP DEFAULT NOW(),  -- When we last fetched from API
  total_records INTEGER DEFAULT 0,     -- Count of records for this series
  source VARCHAR(50) NOT NULL DEFAULT 'sbp-easydata'
);

CREATE INDEX IF NOT EXISTS idx_bop_metadata_series_key ON bop_metadata(series_key);
`

async function runMigration() {
  const client = await pool.connect()
  
  try {
    console.log('🔄 Running Balance of Payments tables migration...')
    
    // Execute each statement separately
    const statements = [
      `CREATE TABLE IF NOT EXISTS balance_of_payments (
        id SERIAL PRIMARY KEY,
        series_key VARCHAR(100) NOT NULL,
        series_name VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        value DECIMAL(20, 2) NOT NULL,
        unit VARCHAR(50) NOT NULL DEFAULT 'Million USD',
        observation_status VARCHAR(50) DEFAULT 'Normal',
        status_comments TEXT,
        source VARCHAR(50) NOT NULL DEFAULT 'sbp-easydata',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(series_key, date)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_bop_series_key ON balance_of_payments(series_key)`,
      `CREATE INDEX IF NOT EXISTS idx_bop_date ON balance_of_payments(date)`,
      `CREATE INDEX IF NOT EXISTS idx_bop_series_date ON balance_of_payments(series_key, date DESC)`,
      `CREATE TABLE IF NOT EXISTS bop_metadata (
        id SERIAL PRIMARY KEY,
        series_key VARCHAR(100) NOT NULL UNIQUE,
        last_stored_date DATE,
        last_updated TIMESTAMP DEFAULT NOW(),
        total_records INTEGER DEFAULT 0,
        source VARCHAR(50) NOT NULL DEFAULT 'sbp-easydata'
      )`,
      `CREATE INDEX IF NOT EXISTS idx_bop_metadata_series_key ON bop_metadata(series_key)`
    ]
    
    for (const statement of statements) {
      try {
        await client.query(statement)
        const desc = statement.substring(0, statement.indexOf('(') || 60)
        console.log('✅ Executed:', desc)
      } catch (err) {
        // Ignore "already exists" errors
        if (err.message.includes('already exists') || err.code === '42P07' || err.code === '42710') {
          const desc = statement.substring(0, statement.indexOf('(') || 60)
          console.log('ℹ️  Already exists:', desc)
        } else {
          throw err
        }
      }
    }
    
    // Verify tables were created
    const tablesCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('balance_of_payments', 'bop_metadata')
      ORDER BY table_name
    `)
    
    console.log('\n✅ Migration completed successfully!')
    console.log('\n📊 Created tables:')
    tablesCheck.rows.forEach(row => {
      console.log(`   - ${row.table_name}`)
    })
    
    // Check indexes
    const indexesCheck = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename IN ('balance_of_payments', 'bop_metadata')
      ORDER BY tablename, indexname
    `)
    
    console.log('\n📇 Created indexes:')
    indexesCheck.rows.forEach(row => {
      console.log(`   - ${row.indexname}`)
    })
    
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

runMigration().catch(console.error)

