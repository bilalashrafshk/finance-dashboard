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

async function backfill() {
    const client = await pool.connect()
    try {
        console.log('🚀 Starting PSX Historical Backfill (2000-2020)...')

        // 1. Get all symbols
        const res = await client.query(`
      SELECT symbol FROM company_profiles 
      WHERE asset_type = 'pk-equity'
      ORDER BY symbol ASC
    `)
        const symbols = res.rows.map(r => r.symbol)
        console.log(`Found ${symbols.length} symbols to process.`)

        // We'll process in chunks of time to respect the 2000 row limit of SCSTrade
        // 2000-2020 is ~5000 trading days. 3 chunks of 7 years approx.
        const timeChunks = [
            { start: '2000-01-01', end: '2007-01-01' },
            { start: '2007-01-01', end: '2014-01-01' },
            { start: '2014-01-01', end: '2020-01-01' }
        ]

        for (const symbol of symbols) {
            try {
                console.log(`\nProcessing ${symbol}...`)

                for (const chunk of timeChunks) {
                    console.log(`  Fetching ${chunk.start} to ${chunk.end}...`)
                    const data = await fetchPKEquityData(symbol, chunk.start, chunk.end)

                    if (data && data.length > 0) {
                        console.log(`  Inserting ${data.length} records...`)

                        // Bulk insert
                        const values: any[] = []
                        const placeholders = data.map((d, i) => {
                            const offset = i * 9
                            values.push(
                                'pk-equity',
                                symbol,
                                d.date,
                                d.open,
                                d.high,
                                d.low,
                                d.close,
                                d.volume ?? 0,
                                'scstrade_backfill'
                            )
                            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`
                        }).join(',')

                        await client.query(`
              INSERT INTO historical_price_data 
              (asset_type, symbol, date, open, high, low, close, volume, source)
              VALUES ${placeholders}
              ON CONFLICT (asset_type, symbol, date) DO NOTHING
            `, values)
                    }

                    // Small delay to be nice to SCSTrade
                    await new Promise(resolve => setTimeout(resolve, 300))
                }
            } catch (symbolErr) {
                console.error(`❌ Error processing ${symbol}:`, symbolErr)
            }
        }

        console.log('\n✅ Backfill complete. Starting ATH/52W recalculation...')

        // 2. Recalculate ATH and 52W High
        await client.query(`
      UPDATE company_profiles cp
      SET all_time_high = (
          SELECT MAX(high)
          FROM historical_price_data hpd
          WHERE hpd.symbol = cp.symbol AND hpd.asset_type = 'pk-equity'
      )
      WHERE cp.asset_type = 'pk-equity';
    `)
        console.log('Updated All-Time Highs.')

        await client.query(`
      UPDATE company_profiles cp
      SET fifty_two_week_high = (
          SELECT MAX(high)
          FROM historical_price_data hpd
          WHERE hpd.symbol = cp.symbol 
            AND hpd.asset_type = 'pk-equity'
            AND hpd.date >= CURRENT_DATE - INTERVAL '1 year'
      )
      WHERE cp.asset_type = 'pk-equity';
    `)
        console.log('Updated 52-Week Highs.')

        console.log('\n✨ All operations completed successfully.')

    } catch (error) {
        console.error('❌ Backfill failed:', error)
    } finally {
        client.release()
        await pool.end()
    }
}

backfill()
