/**
 * Migration script to add market_cycles table
 */

require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

if (!connectionString) {
  console.error('❌ No database connection string found in .env.local (DATABASE_URL or POSTGRES_URL)')
  process.exit(1)
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

async function addTable() {
  const client = await pool.connect()
  
  try {
    console.log('🔌 Connecting to database...')
    await client.query('SELECT 1')
    console.log('✅ Connected.')
    
    console.log('📝 Adding market_cycles table...')
    
    // Read the SQL from db-schema.sql (just the market_cycles part)
    const schemaPath = path.join(__dirname, '..', 'lib', 'portfolio', 'db-schema.sql')
    const fullSchema = fs.readFileSync(schemaPath, 'utf8')
    
    // Extract just the market_cycles table creation SQL
    const marketCyclesMatch = fullSchema.match(/-- Market Cycles Table[\s\S]*?CREATE INDEX IF NOT EXISTS idx_market_cycles_end_date ON market_cycles\(end_date DESC\);?/)
    
    if (!marketCyclesMatch) {
      console.error('❌ Could not find market_cycles table definition in schema file')
      process.exit(1)
    }
    
    const marketCyclesSQL = marketCyclesMatch[0]
    
    // Execute the SQL
    await client.query(marketCyclesSQL)
    
    console.log('✅ Market cycles table created successfully!')
    console.log('')
    console.log('Table created:')
    console.log('  - market_cycles')
    console.log('')
    
  } catch (error) {
    if (error.code === '42P07') {
      console.log('ℹ️  Table market_cycles already exists. Skipping creation.')
    } else {
      console.error('❌ Error:', error.message)
      process.exit(1)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

addTable()

