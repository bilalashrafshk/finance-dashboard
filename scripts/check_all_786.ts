
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function checkAll786() {
    const client = await pool.connect();
    try {
        console.log('🔍 Checking ALL 786 Events in Queue...');

        const res = await client.query(`
            SELECT id, status, created_at, processed_at, metadata->>'title' as raw_title
            FROM event_queue 
            WHERE symbol LIKE '%786%'
            ORDER BY created_at DESC
            LIMIT 10
        `);

        res.rows.forEach(r => {
            console.log(`[${r.status}] ${r.created_at} (Proc: ${r.processed_at}) - "${r.raw_title}"`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

checkAll786();
