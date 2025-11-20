const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

/**
 * Fetch all symbols from PSX API and build a map
 */
async function fetchPSXSymbols() {
  try {
    console.log('📡 Fetching symbols from PSX API...')
    const response = await fetch('https://dps.psx.com.pk/symbols', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch PSX symbols: ${response.status}`)
    }
    
    const symbols = await response.json()
    const sectorMap = new Map()
    
    for (const sym of symbols) {
      const sector = sym.sectorName && sym.sectorName.trim() ? sym.sectorName.trim() : null
      sectorMap.set(sym.symbol.toUpperCase(), sector)
    }
    
    console.log(`✅ Fetched ${symbols.length} symbols from PSX API`)
    console.log(`📊 Found ${sectorMap.size} symbols with sector data`)
    
    return sectorMap
  } catch (error) {
    console.error('❌ Error fetching PSX symbols:', error)
    throw error
  }
}

/**
 * Update all PK equity stocks' sector names from PSX API
 */
async function updateSectors() {
  const client = await pool.connect()
  
  try {
    // 1. Fetch sector data from PSX API
    const sectorMap = await fetchPSXSymbols()
    
    // 2. Get all PK equity stocks from database
    console.log('\n📋 Fetching all PK equity stocks from database...')
    const result = await client.query(`
      SELECT DISTINCT symbol 
      FROM company_profiles 
      WHERE asset_type = 'pk-equity'
      ORDER BY symbol
    `)
    
    const stocks = result.rows.map(row => row.symbol.toUpperCase())
    console.log(`📊 Found ${stocks.length} PK equity stocks in database`)
    
    // 3. Update sectors
    let updated = 0
    let notFound = 0
    let unchanged = 0
    const notFoundSymbols = []
    
    console.log('\n🔄 Updating sectors...\n')
    
    for (const symbol of stocks) {
      const psxSector = sectorMap.get(symbol)
      
      if (psxSector === undefined) {
        // Symbol not found in PSX API
        notFound++
        notFoundSymbols.push(symbol)
        console.log(`⚠️  ${symbol}: Not found in PSX API`)
        continue
      }
      
      // Get current sector from DB
      const currentResult = await client.query(`
        SELECT sector FROM company_profiles 
        WHERE asset_type = 'pk-equity' AND symbol = $1
      `, [symbol])
      
      const currentSector = currentResult.rows[0]?.sector
      
      if (currentSector === psxSector) {
        unchanged++
        continue
      }
      
      // Update sector
      await client.query(`
        UPDATE company_profiles 
        SET sector = $1, last_updated = NOW()
        WHERE asset_type = 'pk-equity' AND symbol = $2
      `, [psxSector, symbol])
      
      updated++
      console.log(`✅ ${symbol}: ${currentSector || 'NULL'} → ${psxSector}`)
    }
    
    // 4. Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 UPDATE SUMMARY')
    console.log('='.repeat(60))
    console.log(`✅ Updated: ${updated}`)
    console.log(`➖ Unchanged: ${unchanged}`)
    console.log(`⚠️  Not found in PSX API: ${notFound}`)
    
    if (notFoundSymbols.length > 0) {
      console.log('\n⚠️  Symbols not found in PSX API:')
      console.log(notFoundSymbols.join(', '))
    }
    
    console.log('\n✅ Sector update complete!')
    
  } catch (error) {
    console.error('❌ Error updating sectors:', error)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

updateSectors().catch(console.error)

