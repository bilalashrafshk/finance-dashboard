
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function checkRank() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT symbol, market_cap, rank FROM (
                SELECT symbol, market_cap, RANK() OVER (ORDER BY market_cap DESC) as rank 
                FROM company_profiles 
                WHERE market_cap IS NOT NULL
            ) sub 
            WHERE symbol = 'TSML'
        `);
        console.log("TSML Rank Info:", res.rows[0]);

        const configRes = await client.query("SELECT value FROM alert_configs WHERE key = 'fundamental_mc_threshold_rank'");
        console.log("Configured Threshold:", configRes.rows[0]?.value);

    } catch (err) {
        console.error(err);
    } finally {
        client.release();
        pool.end();
    }
}

checkRank();
