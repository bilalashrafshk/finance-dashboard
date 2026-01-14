
import { Pool } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

// Load env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkDataRange() {
    const client = await pool.connect();
    try {
        console.log('Checking data range for PSX stocks...');

        // Check overall min/max date
        const res = await client.query(`
      SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as total_rows
      FROM historical_price_data 
      WHERE asset_type = 'pk-equity'
    `);
        console.log('Overall Range:', res.rows[0]);

        // Check for a few specific major stocks
        const symbols = ['OGDC', 'HBL', 'ENGRO', 'LUCK', 'MCB'];
        console.log(`\nChecking specific symbols: ${symbols.join(', ')}`);

        const tokenRes = await client.query(`
      SELECT symbol, MIN(date) as min_date, MAX(date) as max_date, COUNT(*) as count
      FROM historical_price_data 
      WHERE asset_type = 'pk-equity' AND symbol = ANY($1)
      GROUP BY symbol
      ORDER BY symbol
    `, [symbols]);

        console.table(tokenRes.rows.map(r => ({
            Symbol: r.symbol,
            Start: r.min_date ? new Date(r.min_date).toISOString().split('T')[0] : 'N/A',
            End: r.max_date ? new Date(r.max_date).toISOString().split('T')[0] : 'N/A',
            Records: r.count
        })));

        // Check how many stocks have > 10 years of data (approx 2520 trading days)
        const longHistoryRes = await client.query(`
        SELECT COUNT(*) as count
        FROM (
            SELECT symbol, COUNT(*) as c
            FROM historical_price_data
            WHERE asset_type = 'pk-equity'
            GROUP BY symbol
            HAVING COUNT(*) > 2000
        ) as sub
    `);
        console.log(`\nNumber of stocks with > 2000 records (~8-10 years): ${longHistoryRes.rows[0].count}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

checkDataRange();
