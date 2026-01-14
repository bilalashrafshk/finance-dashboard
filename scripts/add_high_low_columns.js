
const { Pool } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Adding ATH and 52W High columns to company_profiles...');

        await client.query(`
      ALTER TABLE company_profiles 
      ADD COLUMN IF NOT EXISTS all_time_high DECIMAL(20, 2),
      ADD COLUMN IF NOT EXISTS fifty_two_week_high DECIMAL(20, 2),
      ADD COLUMN IF NOT EXISTS high_low_updated_at TIMESTAMP;
    `);

        console.log('Migration successful: Columns added.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
