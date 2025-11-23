/**
 * Test script to run market cycle detection algorithm
 * Fetches KSE100 data and runs the cycle detection
 */

const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

// Import the cycle detection function
// Since it's TypeScript, we'll need to use ts-node or compile it
// For now, let's copy the logic or use a workaround

async function testMarketCycles() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL
  
  if (!connectionString) {
    console.error('DATABASE_URL or POSTGRES_URL environment variable is required')
    process.exit(1)
  }
  
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  })
  
  try {
    console.log('Fetching KSE100 data from database...\n')
    
    // Fetch all KSE100 data
    const result = await pool.query(
      `SELECT date, close 
       FROM historical_price_data 
       WHERE asset_type = 'kse100' AND symbol = 'KSE100' 
       ORDER BY date ASC`
    )
    
    if (result.rows.length === 0) {
      console.log('No data found in database')
      return
    }
    
    console.log(`Total records: ${result.rows.length}`)
    console.log(`First record: ${result.rows[0].date}`)
    console.log(`Last record: ${result.rows[result.rows.length - 1].date}\n`)
    
    // Convert to the format expected by the algorithm
    const priceData = result.rows.map(row => ({
      date: row.date,
      close: parseFloat(row.close)
    }))
    
    // Since we can't directly import TypeScript, let's use a workaround
    // We'll call the API endpoint or use node with ts-node
    console.log('Running cycle detection algorithm...\n')
    
    // Use child_process to run a TypeScript file with ts-node
    const { execSync } = require('child_process')
    const fs = require('fs')
    const path = require('path')
    
    // Create a temporary test file
    const testFile = path.join(__dirname, 'test-cycles-temp.ts')
    const testCode = `import { detectMarketCycles } from '../lib/algorithms/market-cycle-detection'

const data = ${JSON.stringify(priceData)}

const cycles = detectMarketCycles(data, '1978-07-13')

console.log('\\n=== DETECTED CYCLES ===\\n')
console.log('Total cycles: ' + cycles.length + '\\n')

cycles.forEach((cycle, idx) => {
  const durationYears = (cycle.durationTradingDays / 252).toFixed(2)
  console.log(cycle.cycleName + ':')
  console.log('  Period: ' + cycle.startDate + ' to ' + cycle.endDate)
  console.log('  ROI: ' + (cycle.roi >= 0 ? '+' : '') + cycle.roi.toFixed(2) + '%')
  console.log('  Duration: ' + cycle.durationTradingDays + ' trading days (' + durationYears + ' years)')
  console.log('  Start Price: ' + cycle.startPrice.toFixed(2))
  console.log('  End Price: ' + cycle.endPrice.toFixed(2))
  console.log('  Data Points: ' + cycle.priceData.length)
  console.log('')
})
`
    
    fs.writeFileSync(testFile, testCode)
    
    try {
      // Try to run with ts-node if available, otherwise use tsx
      try {
        execSync(`npx tsx ${testFile}`, { 
          stdio: 'inherit',
          cwd: path.join(__dirname, '..')
        })
      } catch (e) {
        // Fallback to ts-node
        execSync(`npx ts-node ${testFile}`, { 
          stdio: 'inherit',
          cwd: path.join(__dirname, '..')
        })
      }
    } finally {
      // Clean up
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile)
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
  } finally {
    await pool.end()
  }
}

testMarketCycles()

