/**
 * Script to verify KSE100 data from database
 * Fetches data starting from July 13, 1978
 */

const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

async function verifyKSE100Data() {
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
    
    console.log(`Total records: ${result.rows.length}`)
    
    if (result.rows.length === 0) {
      console.log('No data found in database')
      return
    }
    
    // Find data around July 13, 1978
    const startDate = '1978-07-13'
    const startIndex = result.rows.findIndex(row => row.date >= startDate)
    
    console.log(`\nFirst record: ${result.rows[0].date} - Close: ${result.rows[0].close}`)
    console.log(`Last record: ${result.rows[result.rows.length - 1].date} - Close: ${result.rows[result.rows.length - 1].close}`)
    
    if (startIndex >= 0) {
      console.log(`\nData starting from ${startDate}:`)
      console.log(`Index: ${startIndex}`)
      console.log(`Date: ${result.rows[startIndex].date}`)
      console.log(`Close: ${result.rows[startIndex].close}`)
      
      // Show first 10 records from start date
      console.log(`\nFirst 10 records from ${startDate}:`)
      for (let i = startIndex; i < Math.min(startIndex + 10, result.rows.length); i++) {
        console.log(`${result.rows[i].date}: ${result.rows[i].close}`)
      }
    } else {
      console.log(`\nNo data found at or after ${startDate}`)
      console.log('Showing first 10 records:')
      for (let i = 0; i < Math.min(10, result.rows.length); i++) {
        console.log(`${result.rows[i].date}: ${result.rows[i].close}`)
      }
    }
    
    // Show sample of data
    console.log(`\nSample data (every 100th record):`)
    for (let i = 0; i < result.rows.length; i += 100) {
      console.log(`${result.rows[i].date}: ${result.rows[i].close}`)
    }
    
  } catch (error) {
    console.error('Error fetching data:', error)
  } finally {
    await pool.end()
  }
}

verifyKSE100Data()

