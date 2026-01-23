import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function retryFailedEvents() {
    const client = await pool.connect();
    try {
        console.log('🔄 Adjustment: Reverting old events, keeping only Jan 23...');

        // 1. Revert events before Jan 23 to FAILED (if they are currently PENDING)
        // This undoes the previous "Reset all" for older items.
        // We look for PENDING items (since we just reset them) created before today.
        const revertRes = await client.query(`
            UPDATE event_queue 
            SET status = 'FAILED'
            WHERE event_type = 'fundamental_alert' 
              AND status = 'PENDING'
              AND created_at < '2026-01-23'
        `);
        console.log(`🔙 Reverted ${revertRes.rowCount} old events (pre-Jan 23) to FAILED.`);

        // 2. Ensure Jan 23 events are PENDING 
        // We look for FAILED items created ON or AFTER Jan 23 and set them to PENDING.
        const retryRes = await client.query(`
            UPDATE event_queue 
            SET status = 'PENDING', processed_at = NULL
            WHERE event_type = 'fundamental_alert' 
              AND status = 'FAILED'
              AND created_at >= '2026-01-23'
        `);
        console.log(`✅ Ensured ${retryRes.rowCount} events from Jan 23 are set to PENDING.`);

    } catch (err) {
        console.error('❌ Retry script failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

retryFailedEvents();
