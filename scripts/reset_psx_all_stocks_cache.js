const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

async function resetCache() {
  const client = await pool.connect()
  try {
    // Set last_run to 2 months ago to ensure it's past the 1-month threshold
    await client.query(`
      UPDATE psx_all_stocks_batch_cache 
      SET last_run = NOW() - INTERVAL '2 months'
      WHERE id = 1
    `)
    
    // If no row exists, create one with old timestamp
    await client.query(`
      INSERT INTO psx_all_stocks_batch_cache (id, last_run) 
      VALUES (1, NOW() - INTERVAL '2 months')
      ON CONFLICT (id) DO UPDATE SET last_run = NOW() - INTERVAL '2 months'
    `)
    
    console.log('✅ Reset psx_all_stocks_batch_cache - last_run set to 2 months ago')
    
    // Verify the update
    const result = await client.query(`
      SELECT last_run FROM psx_all_stocks_batch_cache WHERE id = 1
    `)
    
    if (result.rows.length > 0) {
      console.log(`📅 Current last_run: ${result.rows[0].last_run}`)
    }
  } catch (error) {
    console.error('❌ Error resetting cache:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

resetCache().catch(console.error)


