import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: '.env.local' })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') 
    ? { rejectUnauthorized: false } 
    : undefined
})

async function run() {
  let client
  try {
    client = await pool.connect()
    
    console.log('1. Fetching all pk-equity symbols...')
    const symbolsRes = await client.query(`
      SELECT DISTINCT symbol FROM historical_price_data WHERE asset_type = 'pk-equity'
    `)
    const symbols = symbolsRes.rows.map(r => r.symbol)
    console.log(`Found ${symbols.length} symbols. Processing individually...`)
    
    let splitsCalculated = []
    
    // Process in batches of 20 to avoid exhausting the pool but speed up latency
    const BATCH_SIZE = 20
    for (let b = 0; b < symbols.length; b += BATCH_SIZE) {
      const batch = symbols.slice(b, b + BATCH_SIZE)
      console.log(`Processing batch ${b/BATCH_SIZE + 1} of ${Math.ceil(symbols.length/BATCH_SIZE)}`)
      
      await Promise.all(batch.map(async (symbol) => {
        // use pool.query so it checks out a connection temporarily
        const res = await pool.query(`
          SELECT date, close
          FROM historical_price_data
          WHERE asset_type = 'pk-equity' AND symbol = $1
          ORDER BY date ASC
        `, [symbol])
        
        const rows = res.rows
        for (let i = 1; i < rows.length; i++) {
          const current = parseFloat(rows[i].close)
          const prev = parseFloat(rows[i-1].close)
          
          if (prev > 0 && current > 0) {
              const rawRatio = prev / current
              if (rawRatio > 1.25) { 
                  let sustained = true
                  if (i + 3 < rows.length) {
                     const futurePrice = parseFloat(rows[i+3].close)
                     if (futurePrice > prev * 0.8) sustained = false
                  }
                  
                  if (sustained) {
                      splitsCalculated.push({
                         symbol,
                         date: rows[i].date,
                         prev,
                         current,
                         ratio: rawRatio
                      })
                  }
              }
          }
        }
      }))
    }
    
    console.log(`Found ${splitsCalculated.length} potential structured splits/bonuses.`)
    
    // Sort chronologically for each symbol
    splitsCalculated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    console.log('2. Applying multipliers to adjusted_close...')
    
    // We update adjusted_close dynamically.
    // For each split event for symbol X on Date Y with ratio Z, we do:
    // UPDATE historical_price_data SET adjusted_close = adjusted_close / Z WHERE symbol = X AND date < Y
    
    await client.query('BEGIN')
    
    let appliedCount = 0
    for (const split of splitsCalculated) {
      if (!split.symbol) continue

      await client.query(`
        UPDATE historical_price_data
        SET adjusted_close = adjusted_close / $1
        WHERE asset_type = 'pk-equity' AND symbol = $2 AND date < $3
      `, [split.ratio, split.symbol, split.date])
      
      appliedCount++
      if (appliedCount % 50 === 0) {
        console.log(`Applied ${appliedCount}/${splitsCalculated.length} splits...`)
      }
    }
    
    await client.query('COMMIT')
    
    console.log(`Success! Applied ${appliedCount} historical split adjustments to adjusted_close column.`)
    fs.writeFileSync('splits_applied.json', JSON.stringify(splitsCalculated, null, 2))
    console.log("Details saved to splits_applied.json")
    
  } catch (error) {
    if (client) await client.query('ROLLBACK')
    console.error('Error applying splits:', error)
  } finally {
    if (client) client.release()
    await pool.end()
  }
}

run()
