
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function checkPrices() {
    const client = await pool.connect();
    try {
        const symbols = ['DINT', 'KPUS', 'BML'];
        console.log(`Checking pricing for: ${symbols.join(', ')}...`);

        for (const sym of symbols) {
            console.log(`\n=== ${sym} ===`);
            // 1. Screener Metrics (Current method)
            const smRes = await client.query("SELECT price, pe_ratio FROM screener_metrics WHERE symbol = $1", [sym]);
            console.log('Screener Metrics:', smRes.rows[0] || 'NOT FOUND');

            // 2. Historical Price (Potential fallback)
            const histRes = await client.query(`
                SELECT close, date 
                FROM historical_price_data 
                WHERE symbol = $1 
                ORDER BY date DESC 
                LIMIT 1
            `, [sym]);
            console.log('Historical Data:', histRes.rows[0] || 'NOT FOUND');
        }

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

checkPrices();
