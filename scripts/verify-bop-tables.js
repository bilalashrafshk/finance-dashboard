/**
 * Verify BOP tables were created correctly
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
    console.log('🔍 Verifying Balance of Payments tables...\n')
    
    // Check tables
    const tablesResult = await client.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      AND table_name IN ('balance_of_payments', 'bop_metadata')
      ORDER BY table_name
    `)
    
    console.log('📊 Tables:')
    for (const row of tablesResult.rows) {
      console.log(`   ✅ ${row.table_name} (${row.column_count} columns)`)
    }
    
    // Check indexes
    const indexesResult = await client.query(`
      SELECT tablename, indexname
      FROM pg_indexes 
      WHERE tablename IN ('balance_of_payments', 'bop_metadata')
      ORDER BY tablename, indexname
    `)
    
    console.log('\n📇 Indexes:')
    let currentTable = ''
    for (const row of indexesResult.rows) {
      if (row.tablename !== currentTable) {
        currentTable = row.tablename
        console.log(`   ${currentTable}:`)
      }
      console.log(`      - ${row.indexname}`)
    }
    
    // Check SBP interest rates tables too
    const sbpTablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('sbp_interest_rates', 'sbp_rates_metadata')
      ORDER BY table_name
    `)
    
    console.log('\n📊 SBP Interest Rates Tables:')
    if (sbpTablesResult.rows.length === 0) {
      console.log('   ⚠️  SBP interest rates tables not found. You may need to run the full schema.')
    } else {
      for (const row of sbpTablesResult.rows) {
        console.log(`   ✅ ${row.table_name}`)
      }
    }
    
    console.log('\n✅ Verification complete!')
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

verifyTables().catch(console.error)

