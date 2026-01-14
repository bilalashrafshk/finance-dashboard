import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import path from 'path'
import { fetchPKEquityData } from '../lib/portfolio/pk-equity-api'

// Load env
const envPath = path.resolve(__dirname, '../.env.local')
dotenv.config({ path: envPath })

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
})

async function remediate() {
    const client = await pool.connect()
    try {
        console.log('🚀 Starting Surgical PSX Data Remediation (Last 10 Years)...')

        // 1. Get all PSX symbols
        const res = await client.query(`
      SELECT symbol FROM company_profiles 
      WHERE asset_type = 'pk-equity'
      ORDER BY symbol ASC
    `)

        const symbols = res.rows.map(r => r.symbol)
        console.log(`Processing ${symbols.length} symbols...`)

        const today = new Date().toISOString().split('T')[0]
        const tenYearsAgo = new Date()
        tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10)
        const startDate = tenYearsAgo.toISOString().split('T')[0]

        for (const symbol of symbols) {
            console.log(`\n🛠️  Remediating ${symbol} (${startDate} to ${today})...`)

            try {
                // SCSTrade API allows fetch in range. 10 years is ~2500 trading days.
                // fetchPKEquityData may need to be called twice or we just fetch the max available (2000 rows).
                // Actually, our fetchPKEquityData has a limit of 2000 rows.
                // For 10 years we might need two fetches.

                const midDate = new Date()
                midDate.setFullYear(midDate.getFullYear() - 5)
                const midDateStr = midDate.toISOString().split('T')[0]

                // Fetch chunk 1 (0-5 years)
                const data1 = await fetchPKEquityData(symbol, midDateStr, today) || []
                // Fetch chunk 2 (5-10 years)
                const data2 = await fetchPKEquityData(symbol, startDate, midDateStr) || []

                const correctData = [...data1, ...data2]

                if (correctData && correctData.length > 0) {
                    // Deduplicate by date
                    const seenDates = new Set<string>()
                    const uniqueData = correctData.filter(d => {
                        if (seenDates.has(d.date)) return false
                        seenDates.add(d.date)
                        return true
                    })

                    console.log(`  Fetched ${uniqueData.length} records from SCSTrade. Determining which needs replacement...`)

                    // Surgical logic: 
                    // We only replace if the record in DB is from source 'stockanalysis' AND is corrupted
                    // BUT since I already deleted all 'stockanalysis' records previously for pk-equity,
                    // I will just insert all available good data for the last 10 years.
                    // If some 'stockanalysis' records survived (because they didn't meet my previous deletion criteria),
                    // they will be updated by ON CONFLICT.

                    // Insert/Update records
                    const values: any[] = []
                    const placeholders = uniqueData.map((d, i) => {
                        const offset = i * 10
                        values.push(
                            'pk-equity',
                            symbol,
                            d.date,
                            d.open,
                            d.high,
                            d.low,
                            d.close,
                            d.volume ?? 0,
                            'scstrade',
                            d.change_pct ?? 0
                        )
                        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`
                    }).join(',')

                    // We use ON CONFLICT to ensure we overwrite any remaining bad data
                    await client.query(`
            INSERT INTO historical_price_data 
            (asset_type, symbol, date, open, high, low, close, volume, source, change_pct)
            VALUES ${placeholders}
            ON CONFLICT (asset_type, symbol, date) DO UPDATE SET
              open = EXCLUDED.open,
              high = EXCLUDED.high,
              low = EXCLUDED.low,
              close = EXCLUDED.close,
              volume = EXCLUDED.volume,
              source = EXCLUDED.source,
              change_pct = EXCLUDED.change_pct
          `, values)

                    console.log(`  ✅ Successfully updated ${symbol}.`)
                } else {
                    console.warn(`  ⚠️ SCSTrade returned no data for ${symbol}.`)
                }

                // Small delay to be nice to API
                await new Promise(resolve => setTimeout(resolve, 300))

            } catch (err: any) {
                console.error(`  ❌ Error remediating ${symbol}:`, err)
                if (err.message && err.message.includes('limit')) {
                    console.error('🛑 Storage limit hit. Stopping remediation.')
                    process.exit(1)
                }
            }
        }

        console.log('\n✨ Remediation completed successfully.')

    } catch (error) {
        console.error('❌ Remediation failed:', error)
    } finally {
        client.release()
        await pool.end()
    }
}

remediate()
