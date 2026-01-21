
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function run() {
    const client = await pool.connect();
    try {
        console.log('Disabling Volume Surge Config...');
        // Upsert logic: Update if exists, Insert if not
        await client.query(`
            INSERT INTO alert_configs (key, value, description)
            VALUES ('auto_tweet_vol', 'false', 'Master switch for Volume Surge detection and tweeting')
            ON CONFLICT (key) DO UPDATE SET value = 'false';
        `);
        console.log('✅ Volume Surge Detection DISABLED.');
    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
