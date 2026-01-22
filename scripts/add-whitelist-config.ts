
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('🔌 Connected to database...');

        const key = 'priority_whitelist';
        const defaultValue = JSON.stringify(["AIRLINK"]);
        const description = 'List of symbols (e.g., AIRLINK) that are always treated as priority stocks, bypassing market cap rank checks.';

        // Check if exists
        const checkRes = await client.query('SELECT key FROM alert_configs WHERE key = $1', [key]);

        if (checkRes.rows.length === 0) {
            console.log(`📝 Inserting ${key}...`);
            await client.query(
                'INSERT INTO alert_configs (key, value, description, updated_at) VALUES ($1, $2, $3, NOW())',
                [key, defaultValue, description]
            );
            console.log('✅ Configuration added.');
        } else {
            console.log(`ℹ️  ${key} already exists. Skipping.`);
        }

    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
