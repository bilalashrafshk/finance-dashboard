/**
 * Clear all SBP Interest Rates and Balance of Payments data
 * This will delete all records and reset metadata
 * Run with: node scripts/clear-sbp-data.js
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

async function clearSBPData() {
  const client = await pool.connect()
  
  try {
    console.log('🗑️  Clearing SBP Interest Rates and Balance of Payments data...\n')
    
    // Clear SBP Interest Rates data
    console.log('📊 Clearing SBP Interest Rates...')
    const sbpRatesResult = await client.query('DELETE FROM sbp_interest_rates')
    console.log(`   ✅ Deleted ${sbpRatesResult.rowCount} records from sbp_interest_rates`)
    
    const sbpMetadataResult = await client.query('DELETE FROM sbp_rates_metadata')
    console.log(`   ✅ Deleted ${sbpMetadataResult.rowCount} records from sbp_rates_metadata`)
    
    // Clear Balance of Payments data
    console.log('\n📊 Clearing Balance of Payments...')
    const bopResult = await client.query('DELETE FROM balance_of_payments')
    console.log(`   ✅ Deleted ${bopResult.rowCount} records from balance_of_payments`)
    
    const bopMetadataResult = await client.query('DELETE FROM bop_metadata')
    console.log(`   ✅ Deleted ${bopMetadataResult.rowCount} records from bop_metadata`)
    
    // Verify tables are empty
    const verifyQueries = [
      { name: 'sbp_interest_rates', query: 'SELECT COUNT(*) as count FROM sbp_interest_rates' },
      { name: 'sbp_rates_metadata', query: 'SELECT COUNT(*) as count FROM sbp_rates_metadata' },
      { name: 'balance_of_payments', query: 'SELECT COUNT(*) as count FROM balance_of_payments' },
      { name: 'bop_metadata', query: 'SELECT COUNT(*) as count FROM bop_metadata' },
    ]
    
    console.log('\n🔍 Verifying tables are empty...')
    for (const { name, query } of verifyQueries) {
      const result = await client.query(query)
      const count = parseInt(result.rows[0].count)
      if (count === 0) {
        console.log(`   ✅ ${name}: ${count} records`)
      } else {
        console.log(`   ⚠️  ${name}: ${count} records (should be 0)`)
      }
    }
    
    console.log('\n✅ All SBP data cleared successfully!')
    console.log('\n💡 Next steps:')
    console.log('   1. Restart your development server to clear in-memory cache:')
    console.log('      - Stop the server (Ctrl+C)')
    console.log('      - Run: npm run dev')
    console.log('   2. Refresh the charts in your app')
    console.log('   3. The API will fetch fresh historical data from SBP EasyData API')
    console.log('   4. All historical data will be stored in the database')
    
  } catch (error) {
    console.error('❌ Error clearing data:', error.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

clearSBPData().catch(console.error)

