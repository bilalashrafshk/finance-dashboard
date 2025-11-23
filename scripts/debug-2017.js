
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

async function debug2017() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })
  
  try {
    // Fetch data from 2017 to 2021
    const res = await pool.query(`
      SELECT date, close 
      FROM historical_price_data 
      WHERE asset_type = 'kse100' 
      AND date >= '2017-05-01' AND date <= '2021-01-01'
      ORDER BY date ASC
    `)
    
    const data = res.rows.map(r => ({
      date: r.date.toISOString().split('T')[0],
      close: parseFloat(r.close)
    }))
    
    // Find the peak on May 24, 2017
    const peakIndex = data.findIndex(d => d.date === '2017-05-24')
    if (peakIndex === -1) {
      console.log('Peak date 2017-05-24 not found')
      return
    }
    
    const peak = data[peakIndex]
    console.log('Peak:', peak)
    
    // Simulate findLowestPointDuringDrawdown
    let recoveryIndex = -1
    for (let i = peakIndex + 1; i < data.length; i++) {
      if (data[i].close >= peak.close) {
        recoveryIndex = i
        console.log('Found recovery at:', data[i])
        break
      }
    }
    
    const searchEnd = recoveryIndex !== -1 ? recoveryIndex : data.length
    console.log('Searching for trough until index:', searchEnd, '(Date:', data[searchEnd-1].date, ')')
    
    let lowestPrice = peak.close
    let lowestIndex = peakIndex
    
    for (let i = peakIndex + 1; i < searchEnd; i++) {
      if (data[i].close < lowestPrice) {
        lowestPrice = data[i].close
        lowestIndex = i
        console.log('New lowest found:', data[i])
      }
    }
    
    console.log('Final Trough:', data[lowestIndex])
    
  } finally {
    await pool.end()
  }
}

debug2017()

