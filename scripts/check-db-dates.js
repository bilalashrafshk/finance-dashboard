/**
 * Script to check database dates for troubleshooting
 * Queries the database directly to see what dates are actually stored
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

async function checkAssetDates(assetType, symbol) {
  const client = await pool.connect()
  
  try {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Checking: ${assetType} - ${symbol}`)
    console.log(`${'='.repeat(60)}`)
    
    // 1. Check MAX(date) query
    const maxDateResult = await client.query(
      `SELECT MAX(date) as latest_date
       FROM historical_price_data
       WHERE asset_type = $1 AND symbol = $2`,
      [assetType, symbol.toUpperCase()]
    )
    const maxDate = maxDateResult.rows[0]?.latest_date
      ? maxDateResult.rows[0].latest_date.toISOString().split('T')[0]
      : null
    console.log(`\n1. MAX(date) query result: ${maxDate}`)
    
    // 2. Check ORDER BY DESC query
    const orderByResult = await client.query(
      `SELECT date, close FROM historical_price_data
       WHERE asset_type = $1 AND symbol = $2
       ORDER BY date DESC LIMIT 10`,
      [assetType, symbol.toUpperCase()]
    )
    console.log(`\n2. ORDER BY date DESC (latest 10 dates):`)
    orderByResult.rows.forEach((row, i) => {
      const date = row.date.toISOString().split('T')[0]
      console.log(`   ${i + 1}. ${date} - close: ${row.close}`)
    })
    
    const latestFromOrderBy = orderByResult.rows.length > 0
      ? orderByResult.rows[0].date.toISOString().split('T')[0]
      : null
    console.log(`\n   Latest date from ORDER BY: ${latestFromOrderBy}`)
    
    // 3. Check for duplicate dates
    const duplicateResult = await client.query(
      `SELECT date, COUNT(*) as count
       FROM historical_price_data
       WHERE asset_type = $1 AND symbol = $2
       GROUP BY date
       HAVING COUNT(*) > 1
       ORDER BY date DESC`,
      [assetType, symbol.toUpperCase()]
    )
    console.log(`\n3. Duplicate dates check:`)
    if (duplicateResult.rows.length > 0) {
      console.log(`   ⚠️ Found ${duplicateResult.rows.length} duplicate dates:`)
      duplicateResult.rows.forEach(row => {
        console.log(`   - ${row.date.toISOString().split('T')[0]}: ${row.count} records`)
      })
    } else {
      console.log(`   ✅ No duplicate dates found`)
    }
    
    // 4. Check total record count
    const countResult = await client.query(
      `SELECT COUNT(*) as total
       FROM historical_price_data
       WHERE asset_type = $1 AND symbol = $2`,
      [assetType, symbol.toUpperCase()]
    )
    console.log(`\n4. Total records: ${countResult.rows[0].total}`)
    
    // 5. Check MIN and MAX dates
    const rangeResult = await client.query(
      `SELECT MIN(date) as earliest, MAX(date) as latest
       FROM historical_price_data
       WHERE asset_type = $1 AND symbol = $2`,
      [assetType, symbol.toUpperCase()]
    )
    const earliest = rangeResult.rows[0]?.earliest
      ? rangeResult.rows[0].earliest.toISOString().split('T')[0]
      : null
    const latest = rangeResult.rows[0]?.latest
      ? rangeResult.rows[0].latest.toISOString().split('T')[0]
      : null
    console.log(`\n5. Date range: ${earliest} to ${latest}`)
    
    // 6. Check recent records (last 5 days)
    const recentResult = await client.query(
      `SELECT date, close, source, updated_at
       FROM historical_price_data
       WHERE asset_type = $1 AND symbol = $2
       AND date >= CURRENT_DATE - INTERVAL '5 days'
       ORDER BY date DESC`,
      [assetType, symbol.toUpperCase()]
    )
    console.log(`\n6. Recent records (last 5 days):`)
    if (recentResult.rows.length > 0) {
      recentResult.rows.forEach(row => {
        const date = row.date.toISOString().split('T')[0]
        const updated = row.updated_at ? new Date(row.updated_at).toISOString() : 'N/A'
        console.log(`   ${date} - close: ${row.close}, source: ${row.source}, updated_at: ${updated}`)
      })
    } else {
      console.log(`   No records in last 5 days`)
    }
    
    // 7. Check for records with date = 2025-11-13 and 2025-11-14 specifically
    const specificDatesResult = await client.query(
      `SELECT date, close, source, updated_at
       FROM historical_price_data
       WHERE asset_type = $1 AND symbol = $2
       AND date IN ('2025-11-13', '2025-11-14', '2025-11-12')
       ORDER BY date DESC`,
      [assetType, symbol.toUpperCase()]
    )
    console.log(`\n7. Records for dates 2025-11-12, 2025-11-13, 2025-11-14:`)
    if (specificDatesResult.rows.length > 0) {
      specificDatesResult.rows.forEach(row => {
        const date = row.date.toISOString().split('T')[0]
        const dateObj = row.date
        const updated = row.updated_at ? new Date(row.updated_at).toISOString() : 'N/A'
        console.log(`   date=${date} (type: ${typeof dateObj}, value: ${dateObj}), close: ${row.close}, source: ${row.source}, updated_at: ${updated}`)
      })
    } else {
      console.log(`   No records found for these dates`)
    }
    
    // 8. Comparison
    console.log(`\n8. Comparison:`)
    if (maxDate === latestFromOrderBy) {
      console.log(`   ✅ MAX(date) and ORDER BY DESC match: ${maxDate}`)
    } else {
      console.log(`   ⚠️ MISMATCH! MAX(date)=${maxDate}, ORDER BY DESC=${latestFromOrderBy}`)
    }
    
  } catch (error) {
    console.error(`Error checking ${assetType}-${symbol}:`, error)
  } finally {
    client.release()
  }
}

async function main() {
  try {
    // Check the problematic assets
    await checkAssetDates('us-equity', 'TSLA')
    await checkAssetDates('pk-equity', 'PTC')
    await checkAssetDates('crypto', 'BTCUSDT')
    
    console.log(`\n${'='.repeat(60)}`)
    console.log('Done!')
    console.log(`${'='.repeat(60)}\n`)
    
    await pool.end()
  } catch (error) {
    console.error('Error:', error)
    await pool.end()
    process.exit(1)
  }
}

main()

