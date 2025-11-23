
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

async function checkCycles() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })
  
  try {
    const res = await pool.query(`SELECT * FROM market_cycles WHERE asset_type = 'kse100' ORDER BY cycle_id ASC`)
    console.log('Saved Cycles:', res.rows.length)
    res.rows.forEach(r => console.log(`${r.cycle_name}: ${r.start_date} - ${r.end_date}`))
  } finally {
    await pool.end()
  }
}

checkCycles()

