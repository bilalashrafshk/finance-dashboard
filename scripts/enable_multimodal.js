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
        console.log('--- Enabling Multimodal Analysis ---');
        const updateRes = await client.query(`
            UPDATE alert_configs 
            SET value = 'true'
            WHERE key = 'enable_multimodal_analysis'
        `);

        // If it doesn't exist, insert it
        if (updateRes.rowCount === 0) {
            await client.query(`
                INSERT INTO alert_configs (key, value, description)
                VALUES ('enable_multimodal_analysis', 'true', 'Master switch for AI analysis')
            `);
            console.log('✅ Inserted enable_multimodal_analysis = true');
        } else {
            console.log('✅ Updated enable_multimodal_analysis = true');
        }

        const res = await client.query(`SELECT key, value FROM alert_configs WHERE key = 'enable_multimodal_analysis'`);
        console.log('Current Value:', res.rows[0]);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
