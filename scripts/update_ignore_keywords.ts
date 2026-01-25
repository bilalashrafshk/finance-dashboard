
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

async function updateIgnoreKeywords() {
    const client = await pool.connect();
    try {
        console.log('🚫 Updating Ignore Keywords to reduce noise...');

        // 1. Fetch current
        const res = await client.query("SELECT value FROM alert_configs WHERE key = 'ignore_keywords'");
        let current: string[] = [];
        if (res.rows.length > 0) {
            current = Array.isArray(res.rows[0].value) ? res.rows[0].value : JSON.parse(res.rows[0].value || '[]');
        }

        console.log('Before:', current);

        const newKeywords = [
            'Credit of',
            'Dispatch of',
            'Certificate',
            'Entitlement Letter',
            'Notice of AGM',
            'Notice of EOGM',
            'Transmission',
            'Ballot Paper',
            'Election of Directors'
        ];

        // 2. Merge unique
        const updated = Array.from(new Set([...current, ...newKeywords]));

        console.log('After:', updated);

        // 3. Save
        await client.query(`
            INSERT INTO alert_configs (key, description, value)
            VALUES ('ignore_keywords', 'Keywords to instantly ignore', $1)
            ON CONFLICT (key) DO UPDATE SET value = $1
        `, [JSON.stringify(updated)]);

        console.log('✅ Updated Ignore Keywords.');

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

updateIgnoreKeywords();
