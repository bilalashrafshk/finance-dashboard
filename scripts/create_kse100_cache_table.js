const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

async function createTable() {
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS kse100_batch_cache (
        id INTEGER PRIMARY KEY DEFAULT 1,
        last_run TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `)
    
    // Ensure only one row exists
    await client.query(`
      INSERT INTO kse100_batch_cache (id, last_run) 
      VALUES (1, NOW())
      ON CONFLICT (id) DO NOTHING
    `)
    console.log('✅ Created kse100_batch_cache table')
  } catch (error) {
    console.error('❌ Error creating table:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

createTable().catch(console.error)

