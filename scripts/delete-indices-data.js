/**
 * Script to delete KSE100 and SPX500 data from the database
 */

// Try to load environment variables
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  try {
    require('dotenv').config({ path: '.env' })
  } catch (e2) {
    // Continue without dotenv if not available
  }
}

const { Pool } = require('pg')

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

if (!connectionString) {
  console.error('DATABASE_URL or POSTGRES_URL environment variable is required')
  process.exit(1)
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

async function deleteIndicesData() {
  const client = await pool.connect()
  try {
    console.log('Deleting KSE100 and SPX500 data from database...')
    
    // Delete KSE100 data
    const kse100Result = await client.query(
      `DELETE FROM historical_price_data WHERE asset_type = 'kse100' AND symbol = 'KSE100'`
    )
    console.log(`Deleted ${kse100Result.rowCount} KSE100 records`)
    
    // Delete SPX500 data
    const spx500Result = await client.query(
      `DELETE FROM historical_price_data WHERE asset_type = 'spx500' AND symbol = 'SPX500'`
    )
    console.log(`Deleted ${spx500Result.rowCount} SPX500 records`)
    
    // Also delete from metadata table if it exists
    try {
      const kse100MetaResult = await client.query(
        `DELETE FROM historical_data_metadata WHERE asset_type = 'kse100' AND symbol = 'KSE100'`
      )
      console.log(`Deleted ${kse100MetaResult.rowCount} KSE100 metadata records`)
      
      const spx500MetaResult = await client.query(
        `DELETE FROM historical_data_metadata WHERE asset_type = 'spx500' AND symbol = 'SPX500'`
      )
      console.log(`Deleted ${spx500MetaResult.rowCount} SPX500 metadata records`)
    } catch (metaError) {
      console.log('Metadata table may not exist or already empty:', metaError.message)
    }
    
    console.log('\n✅ Successfully deleted KSE100 and SPX500 data from database')
  } catch (error) {
    console.error('Error deleting indices data:', error)
    throw error
  } finally {
    client.release()
  }
}

async function main() {
  try {
    await deleteIndicesData()
  } catch (err) {
    console.error('Script failed:', err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()

