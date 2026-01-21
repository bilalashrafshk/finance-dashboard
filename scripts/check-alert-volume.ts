
import { getPool } from '../lib/db';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkFrequency() {
    const pool = getPool();

    console.log('--- Alert & Triage Volume (Last 24 Hours) ---');

    // 1. Notable Events (Full Analysis)
    const notableRes = await pool.query(`
        SELECT count(*) FROM notable_events 
        WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    console.log('Full AI Analyses (Notable Events):', notableRes.rows[0].count);

    // 2. Triage Volume (From event_queue)
    // We store 'SKIPPED' entries in event_queue now to avoid re-triage.
    const triageRes = await pool.query(`
        SELECT status, count(*) FROM event_queue 
        WHERE processed_at > NOW() - INTERVAL '24 hours'
        GROUP BY status
    `);
    console.log('\nTriage Results (event_queue):');
    triageRes.rows.forEach(row => {
        console.log(`- ${row.status}: ${row.count}`);
    });

}

checkFrequency().catch(console.error);
