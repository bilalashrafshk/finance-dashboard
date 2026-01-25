
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

async function countPending() {
    const client = await pool.connect();
    try {
        console.log('📊 Counting pending fundamental alerts...');

        const res = await client.query(`
            SELECT count(*) 
            FROM event_queue 
            WHERE event_type = 'fundamental_alert' 
            AND status = 'PENDING'
        `);

        console.log(`\n🔢 Total Pending Fundamental Alerts: ${res.rows[0].count}`);

        // Also check recent failed ones just in case
        const failedRes = await client.query(`
            SELECT count(*) 
            FROM event_queue 
            WHERE event_type = 'fundamental_alert' 
            AND status = 'FAILED'
            AND created_at > NOW() - INTERVAL '24 hours'
        `);
        console.log(`⚠️  Recently Failed (24h): ${failedRes.rows[0].count}`);

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

countPending();
