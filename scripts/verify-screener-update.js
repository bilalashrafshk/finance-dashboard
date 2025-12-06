const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function verifyScreenerUpdate() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
        ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });

    try {
        const client = await pool.connect();
        console.log('Connected to database...');

        // 1. Trigger the update (simulated by calling the logic, but here we just check DB)
        // Since we can't easily call the Next.js API from a node script without running the server,
        // we will assume the user will run the server and hit the endpoint, OR we can just check if columns exist.

        // Check if new columns exist
        const res = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'screener_metrics'
    `);

        const columns = res.rows.map(r => r.column_name);
        console.log('Columns in screener_metrics:', columns);

        const requiredColumns = ['beta_3y', 'sharpe_3y', 'sortino_3y', 'dividend_yield', 'dividend_payout_ratio'];
        const missing = requiredColumns.filter(c => !columns.includes(c));

        if (missing.length > 0) {
            console.error('Missing columns:', missing);
        } else {
            console.log('All new columns present!');
        }

        // Check if any data has been populated (optional, depends if update ran)
        const dataRes = await client.query(`SELECT symbol, beta_3y, sharpe_3y FROM screener_metrics WHERE beta_3y IS NOT NULL LIMIT 5`);
        console.log('Sample Data:', dataRes.rows);

        client.release();
    } catch (err) {
        console.error('Verification failed:', err);
    } finally {
        await pool.end();
    }
}

verifyScreenerUpdate();
