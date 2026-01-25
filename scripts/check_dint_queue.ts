
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function checkDintQueue() {
    const client = await pool.connect();
    try {
        console.log('🔍 Checking DINT in Queue...');

        const res = await client.query(`
            SELECT metadata
            FROM event_queue 
            WHERE symbol = 'DINT'
            AND status = 'PROCESSED'
            ORDER BY created_at DESC
            LIMIT 1
        `);

        if (res.rows.length === 0) {
            console.log('No processed DINT event found in queue history.');
            return;
        }

        const task = typeof res.rows[0].metadata === 'string'
            ? JSON.parse(res.rows[0].metadata)
            : res.rows[0].metadata;

        console.log(`\nRaw Title: "${task.title}"`);

        // Check keywords against THIS title
        const configRes = await client.query("SELECT value FROM alert_configs WHERE key = 'priority_keywords'");
        const priorityKeywords = Array.isArray(configRes.rows[0].value) ? configRes.rows[0].value : JSON.parse(configRes.rows[0].value || '[]');

        const matchedKw = priorityKeywords.find((k: string) => task.title.toLowerCase().includes(k.toLowerCase()));
        console.log(`Matched Priority Keyword? ${matchedKw ? `YES (${matchedKw})` : 'NO'}`);

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

checkDintQueue();
