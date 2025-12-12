
import { fetchLipiData } from '../lib/portfolio/market-liquidity-service'
import { getPostgresClient } from '../lib/portfolio/db-client'

async function debugLipiDates() {
    try {
        console.log('--- Debugging Liquidity Map Data ---')

        // Test Dates
        const dates = [
            '2025-12-05', // Friday (Should have data)
            '2025-12-06', // Saturday (Likely empty)
            '2025-12-07'  // Sunday (Likely empty)
        ]

        for (const date of dates) {
            console.log(`\nChecking date: ${date}`)
            try {
                const data    // await fetchLipiData(start, end)
                console.log(`Records found: ${data.length}`)
                if (data.length > 0) {
                    console.log('Sample:', JSON.stringify(data[0]))
                } else {
                    console.log('Result is empty array')
                }
            } catch (e: any) {
                console.log(`Error fetching ${date}:`, e.message)
            }
        }

    } catch (e) {
        console.error('Fatal error:', e)
    } finally {
        process.exit(0)
    }
}

debugLipiDates()
