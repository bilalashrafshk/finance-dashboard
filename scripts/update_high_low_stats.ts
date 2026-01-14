import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * Efficiently update All-Time Highs and 52-Week Highs
 * Logic:
 * 1. For each stock in company_profiles
 * 2. Get current cached ATH and 52W_High
 * 3. Use recursive logic for ATH:
 *    - If ATH exists, only query for prices > Cached ATH since last update
 *    - If no ATH, query entire history
 */
async function updateStats() {
    const client = await pool.connect();
    try {
        console.log('🔄 Starting Cache Update for ATH & 52W High...');

        // 1. Get all profiles
        const res = await client.query('SELECT symbol, all_time_high, fifty_two_week_high, high_low_updated_at FROM company_profiles');
        const profiles = res.rows;

        for (const profile of profiles) {
            const { symbol, all_time_high, high_low_updated_at } = profile;

            // --- Update All Time High ---
            let newATH = parseFloat(all_time_high || '0');
            let athChanged = false;

            if (!all_time_high) {

                // Full scan if no cache
                const athRes = await client.query(`
          SELECT MAX(high) as val FROM historical_price_data 
          WHERE symbol = $1 AND asset_type = 'pk-equity' AND date < CURRENT_DATE
        `, [symbol]);
                if (athRes.rows[0].val) {
                    newATH = parseFloat(athRes.rows[0].val);
                    athChanged = true;
                }
            } else {
                // Incremental scan
                const betterRes = await client.query(`
          SELECT MAX(high) as val FROM historical_price_data 
          WHERE symbol = $1 AND asset_type = 'pk-equity' AND high > $2 AND date < CURRENT_DATE
        `, [symbol, newATH]);


                if (betterRes.rows[0].val) {
                    newATH = parseFloat(betterRes.rows[0].val);
                    athChanged = true;
                }
            }

            // --- Update 52 Week High ---
            // This always needs a window query because the window moves!
            // But we can optimize by only querying the last 1 year.
            const yearHighRes = await client.query(`
        SELECT MAX(high) as val FROM historical_price_data 
        WHERE symbol = $1 AND asset_type = 'pk-equity'
        AND date > NOW() - INTERVAL '1 year'
      `, [symbol]);

            const new52W = parseFloat(yearHighRes.rows[0].val || '0');

            // Update DB if changed or if it was null
            if (athChanged || new52W !== parseFloat(profile.fifty_two_week_high || '0')) {
                await client.query(`
          UPDATE company_profiles 
          SET all_time_high = $1, fifty_two_week_high = $2, high_low_updated_at = NOW()
          WHERE symbol = $3
        `, [newATH, new52W, symbol]);

                console.log(`✅ Updated ${symbol}: ATH=${newATH}, 52W=${new52W}`);
            }
        }

        console.log('✨ Cache Update Complete.');

    } catch (err) {
        console.error('Update failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

updateStats();
