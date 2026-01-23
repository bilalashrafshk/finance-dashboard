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

async function check() {
    try {
        const res = await pool.query("SELECT key, value FROM alert_configs WHERE key IN ('fundamental_webhook_url', 'technical_webhook_url')");
        console.log('--- Webhook Configs ---');
        console.log(JSON.stringify(res.rows, null, 2));

        console.log('--- Env Var ---');
        console.log('DISCORD_WEBHOOK_URL:', process.env.DISCORD_WEBHOOK_URL ? 'Set (Hidden)' : 'Not Set');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

check();
