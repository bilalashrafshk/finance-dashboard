
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

async function refineKeywords() {
    const client = await pool.connect();
    try {
        console.log('🔄 Refining Ignore Keywords...');

        const res = await client.query("SELECT value FROM alert_configs WHERE key = 'ignore_keywords'");
        let current: string[] = [];
        if (res.rows.length > 0) {
            current = Array.isArray(res.rows[0].value) ? res.rows[0].value : JSON.parse(res.rows[0].value || '[]');
        }

        console.log('Current:', current);

        // 1. Remove "Distributes"
        current = current.filter(k => k !== 'Distributes');

        // 2. Add ETF terms
        const toAdd = ['ETF', 'Exchange Traded Fund', 'Unit Holder', 'Net Asset Value', 'NAV'];
        toAdd.forEach(k => {
            if (!current.includes(k)) current.push(k);
        });

        console.log('New List:', current);

        await client.query(`
            UPDATE alert_configs 
            SET value = $1 
            WHERE key = 'ignore_keywords'
        `, [JSON.stringify(current)]);

        console.log('✅ Updated.');

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

refineKeywords();
