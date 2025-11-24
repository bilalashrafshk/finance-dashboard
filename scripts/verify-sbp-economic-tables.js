/**
 * Verify that SBP Economic Data tables exist in the database
 * Run with: node scripts/verify-sbp-economic-tables.js
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

async function verifyTables() {
  const client = await pool.connect()
  
  try {
    console.log('🔍 Checking for SBP Economic Data tables...\n')
    
    // Check if tables exist
    const tablesCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('sbp_economic_data', 'sbp_economic_metadata')
      ORDER BY table_name
    `)
    
    if (tablesCheck.rows.length === 0) {
      console.log('❌ Tables do NOT exist!')
      console.log('\n📝 To create them, run:')
      console.log('   1. Go to Neon Console: https://console.neon.tech')
      console.log('   2. Open SQL Editor')
      console.log('   3. Copy and paste the contents of scripts/create-sbp-economic-tables.sql')
      console.log('   4. Execute the SQL')
      process.exit(1)
    }
    
    console.log('✅ Tables exist:')
    tablesCheck.rows.forEach(row => {
      console.log(`   - ${row.table_name}`)
    })
    
    // Check indexes
    const indexesCheck = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename IN ('sbp_economic_data', 'sbp_economic_metadata')
      ORDER BY tablename, indexname
    `)
    
    console.log('\n📇 Indexes:')
    indexesCheck.rows.forEach(row => {
      console.log(`   - ${row.indexname}`)
    })
    
    // Check record counts
    const dataCount = await client.query('SELECT COUNT(*) as count FROM sbp_economic_data')
    const metadataCount = await client.query('SELECT COUNT(*) as count FROM sbp_economic_metadata')
    
    console.log('\n📊 Record counts:')
    console.log(`   - sbp_economic_data: ${dataCount.rows[0].count} records`)
    console.log(`   - sbp_economic_metadata: ${metadataCount.rows[0].count} series`)
    
    console.log('\n✅ All tables and indexes are present!')
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

verifyTables().catch(console.error)

