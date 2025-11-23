/**
 * Clear market_cycles table to force regeneration
 */

require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

async function resetCycles() {
  const client = await pool.connect()
  try {
    console.log('🧹 Clearing market_cycles table...')
    await client.query('TRUNCATE TABLE market_cycles')
    console.log('✅ Table cleared. Cycles will be regenerated on next API call.')
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    client.release()
    await pool.end()
  }
}

resetCycles()

