
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load envs
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
    console.error('No DATABASE_URL or POSTGRES_URL found in env');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
});

async function checkKeywords() {
    const client = await pool.connect();
    try {
        const res = await client.query("SELECT key, value FROM alert_configs WHERE key IN ('priority_keywords', 'ignore_keywords')");
        res.rows.forEach(r => {
            console.log(`\n=== ${r.key} ===`);
            let val = Array.isArray(r.value) ? r.value : JSON.parse(r.value || '[]');
            console.log(val);
        });
    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

checkKeywords();
