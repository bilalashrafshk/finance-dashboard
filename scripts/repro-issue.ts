
import { detectMarketCycles } from '../lib/algorithms/market-cycle-detection'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function test() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })
  
  try {
    const res = await pool.query(`
      SELECT date, close 
      FROM historical_price_data 
      WHERE asset_type = 'kse100' AND symbol = 'KSE100'
      ORDER BY date ASC
    `)
    
    const priceData = res.rows.map(r => ({
      date: r.date.toISOString().split('T')[0],
      close: parseFloat(r.close)
    }))
    
    console.log(`Loaded ${priceData.length} records.`)
    
    const cycles = detectMarketCycles(priceData)
    
    console.log('\nDetected Cycles:')
    cycles.forEach(c => {
      console.log(`Cycle ${c.cycleId}: ${c.startDate} - ${c.endDate} (ROI: ${c.roi.toFixed(2)}%, EndPrice: ${c.endPrice})`)
    })
    
    // Debug specific logic for Cycle 3 -> Cycle 4 transition
    // Find Cycle 3
    const cycle3 = cycles.find(c => c.endDate === '2017-05-24')
    if (cycle3) {
        console.log('\nCycle 3 found. Peak:', cycle3.endPrice)
        // check what findLowestPointDuringDrawdown would return for this peak
    }
    
  } finally {
    await pool.end()
  }
}

test()
