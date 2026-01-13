
import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { getDbClient } from '@/lib/portfolio/db-client'

async function check() {
    const client = await getDbClient()
    try {
        const today = '2026-01-13'

        // 1. Count records for Jan 13
        const res = await client.query(`
        SELECT COUNT(*) as count 
        FROM historical_price_data 
        WHERE asset_type = 'pk-equity' AND date = $1
    `, [today])
        console.log(`Total PK Equity Records for ${today}: ${res.rows[0].count}`)

        // 2. Check overlap with Top 100
        const overlapRes = await client.query(`
        WITH top_stocks AS (
            SELECT symbol 
            FROM company_profiles 
            WHERE asset_type = 'pk-equity' AND market_cap > 0 
            ORDER BY market_cap DESC LIMIT 100
        )
        SELECT COUNT(*) as count
        FROM historical_price_data hpd
        JOIN top_stocks ts ON hpd.symbol = ts.symbol
        WHERE hpd.date = $1 AND hpd.asset_type = 'pk-equity'
    `, [today])
        console.log(`Records for Top 100 Stocks on ${today}: ${overlapRes.rows[0].count}`)

    } catch (e) {
        console.error(e)
    } finally {
        client.release()
    }
}

check()
