#!/usr/bin/env node
/**
 * Verify Database Setup
 * Checks if tables exist and connection works
 */

const { Pool } = require('pg')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

if (!connectionString) {
  console.error('❌ DATABASE_URL not found')
  process.exit(1)
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

async function verify() {
  const client = await pool.connect()
  
  try {
    console.log('🔍 Verifying database setup...')
    
    // Check if tables exist
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('historical_price_data', 'historical_data_metadata')
      ORDER BY table_name;
    `)
    
    const tables = tablesResult.rows.map(r => r.table_name)
    
    console.log('')
    if (tables.includes('historical_price_data') && tables.includes('historical_data_metadata')) {
      console.log('✅ All tables exist:')
      tables.forEach(table => console.log(`   - ${table}`))
      console.log('')
      console.log('✅ Database setup is complete!')
    } else {
      console.log('⚠️  Some tables are missing:')
      if (!tables.includes('historical_price_data')) {
        console.log('   ❌ historical_price_data')
      }
      if (!tables.includes('historical_data_metadata')) {
        console.log('   ❌ historical_data_metadata')
      }
    }
    
    // Check table structure
    const columnsResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'historical_price_data'
      ORDER BY ordinal_position;
    `)
    
    console.log('')
    console.log('📊 Table structure (historical_price_data):')
    columnsResult.rows.slice(0, 5).forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`)
    })
    console.log(`   ... and ${columnsResult.rows.length - 5} more columns`)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

verify()






