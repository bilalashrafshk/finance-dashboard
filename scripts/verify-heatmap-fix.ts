
import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { ensureHistoricalData } from '@/lib/portfolio/historical-data-service'
import { getDbClient } from '@/lib/portfolio/db-client'

async function verify() {
    const symbol = 'SYS' // A top PSX stock
    const today = '2026-01-14'
    console.log(`Testing gap detection for ${symbol}...`)

    // Trigger sync
    // The previous bug caused this to return database data even if empty for today
    // with my fix, shouldFetch will be true and it will fetch from SCSTrade
    const result = await ensureHistoricalData('pk-equity', symbol, 5, true)

    console.log(`Latest date in service result: ${result.latestDate}`)

    // Check DB explicitly for Jan 14
    const client = await getDbClient()
    const res = await client.query(
        "SELECT COUNT(*) FROM historical_price_data WHERE symbol = $1 AND date = $2",
        [symbol, today]
    )
    console.log(`Records found in DB for ${today}: ${res.rows[0].count}`)

    if (parseInt(res.rows[0].count) > 0) {
        console.log('✅ FIX VERIFIED: Today\'s record successfully fetched and stored.')
    } else {
        console.error('❌ FIX FAILED: Record for today is still missing.')
    }

    client.release()
}

verify().catch(console.error)
