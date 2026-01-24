const { Pool } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('--- Action 1: Clearing Pending Fundamental Alerts ---');
        const updateRes = await client.query(`
            UPDATE event_queue 
            SET status = 'SKIPPED', processed_at = NOW()
            WHERE status = 'PENDING' AND event_type = 'fundamental_alert'
        `);
        console.log(`✅ Cleared (SKIPPED) ${updateRes.rowCount} pending fundamental alerts.`);

        console.log('\n--- Action 2: checking Alert Configurations ---');
        const res = await client.query(`
            SELECT key, value FROM alert_configs 
            WHERE key IN (
                'enable_multimodal_analysis', 
                'fundamental_mc_threshold_rank', 
                'priority_keywords', 
                'priority_whitelist'
            )
        `);
        console.log(JSON.stringify(res.rows, null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
