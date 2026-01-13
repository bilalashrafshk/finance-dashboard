
import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { ensureHistoricalData } from '@/lib/portfolio/historical-data-service'
import { getDbClient } from '@/lib/portfolio/db-client'

async function forceUpdate() {
    const client = await getDbClient()
    try {
        console.log('Fetching Top 100 PK Equity Stocks...')
        const res = await client.query(`
            SELECT symbol 
            FROM company_profiles 
            WHERE asset_type = 'pk-equity' AND market_cap > 0 
            ORDER BY market_cap DESC LIMIT 100
        `)
        const stocks = res.rows
        console.log(`Found ${stocks.length} stocks. Starting update...`)

        let success = 0
        let fail = 0

        for (const [i, stock] of stocks.entries()) {
            try {
                console.log(`[${i + 1}/${stocks.length}] Updating ${stock.symbol}...`)
                // Force refresh? No, just ensure data exists for today.
                await ensureHistoricalData('pk-equity', stock.symbol, 1, false)
                success++
            } catch (e) {
                console.error(`Failed ${stock.symbol}:`, e)
                fail++
            }
            // Small delay to be polite
            await new Promise(r => setTimeout(r, 200))
        }

        console.log('Done!')
        console.log(`Success: ${success}, Failed: ${fail}`)

    } catch (e) {
        console.error('Error:', e)
    } finally {
        client.release()
    }
}

forceUpdate()
