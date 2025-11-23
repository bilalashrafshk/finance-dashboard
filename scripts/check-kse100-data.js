const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

async function checkData() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })
  
  try {
    const res = await pool.query(`
      SELECT COUNT(*) as count 
      FROM historical_price_data 
      WHERE asset_type = 'kse100' AND symbol = 'KSE100'
    `)
    console.log('KSE100 Record Count:', res.rows[0].count)
    
    const latest = await pool.query(`
      SELECT date, close 
      FROM historical_price_data 
      WHERE asset_type = 'kse100' AND symbol = 'KSE100'
      ORDER BY date DESC LIMIT 5
    `)
    console.log('Latest 5 records:', latest.rows)
    
  } catch(e) {
    console.error(e)
  } finally {
    await pool.end()
  }
}

checkData()

