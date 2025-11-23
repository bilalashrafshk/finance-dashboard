/**
 * Migration script to create SBP Interest Rates tables
 * Run with: node scripts/migrate-sbp-tables.js
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

async function runMigration() {
  const client = await pool.connect()
  
  try {
    console.log('🔄 Running SBP Interest Rates tables migration...')
    
    const statements = [
      `CREATE TABLE IF NOT EXISTS sbp_interest_rates (
        id SERIAL PRIMARY KEY,
        series_key VARCHAR(100) NOT NULL,
        series_name VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        value DECIMAL(10, 2) NOT NULL,
        unit VARCHAR(50) NOT NULL DEFAULT 'Percent',
        observation_status VARCHAR(50) DEFAULT 'Normal',
        status_comments TEXT,
        source VARCHAR(50) NOT NULL DEFAULT 'sbp-easydata',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(series_key, date)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sbp_rates_series_key ON sbp_interest_rates(series_key)`,
      `CREATE INDEX IF NOT EXISTS idx_sbp_rates_date ON sbp_interest_rates(date)`,
      `CREATE INDEX IF NOT EXISTS idx_sbp_rates_series_date ON sbp_interest_rates(series_key, date DESC)`,
      `CREATE TABLE IF NOT EXISTS sbp_rates_metadata (
        id SERIAL PRIMARY KEY,
        series_key VARCHAR(100) NOT NULL UNIQUE,
        last_stored_date DATE,
        last_updated TIMESTAMP DEFAULT NOW(),
        total_records INTEGER DEFAULT 0,
        source VARCHAR(50) NOT NULL DEFAULT 'sbp-easydata'
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sbp_metadata_series_key ON sbp_rates_metadata(series_key)`
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
      AND table_name IN ('sbp_interest_rates', 'sbp_rates_metadata')
      ORDER BY table_name
    `)
    
    console.log('\n✅ Migration completed successfully!')
    console.log('\n📊 Created tables:')
    tablesCheck.rows.forEach(row => {
      console.log(`   - ${row.table_name}`)
    })
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

runMigration().catch(console.error)

