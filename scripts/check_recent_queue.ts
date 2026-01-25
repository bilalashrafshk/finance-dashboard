
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

async function checkRecentActivity() {
    const client = await pool.connect();
    try {
        console.log('🔍 Checking recent event queue activity (Last 30 mins)...');

        // 1. Check newly created PENDING items
        const pendingRes = await client.query(`
            SELECT symbol, created_at, metadata->>'title' as title
            FROM event_queue 
            WHERE event_type = 'fundamental_alert' 
            AND status = 'PENDING'
            AND created_at > NOW() - INTERVAL '30 minutes'
            ORDER BY created_at DESC
        `);

        console.log(`\n🆕 PENDING Events (Created < 30m ago): ${pendingRes.rowCount}`);
        if (pendingRes.rowCount > 0) {
            console.log('Sample:', pendingRes.rows.slice(0, 3));
        }

        // 2. Check recently PROCESSED items (Sent to Discord)
        const processedRes = await client.query(`
            SELECT symbol, processed_at, metadata->'ai_analysis'->>'verdict' as verdict
            FROM event_queue 
            WHERE event_type = 'fundamental_alert' 
            AND status = 'PROCESSED'
            AND processed_at > NOW() - INTERVAL '30 minutes'
            ORDER BY processed_at DESC
        `);

        console.log(`\n✅ PROCESSED Events (Sent < 30m ago): ${processedRes.rowCount}`);
        if (processedRes.rowCount > 0) {
            console.log('Sample:', processedRes.rows.slice(0, 3));
        }

        // 3. Check recently SKIPPED items (By me or system)
        const skippedRes = await client.query(`
            SELECT count(*), metadata->>'skipped_reason' as reason
            FROM event_queue 
            WHERE event_type = 'fundamental_alert' 
            AND status = 'SKIPPED'
            AND processed_at > NOW() - INTERVAL '30 minutes'
            GROUP BY reason
        `);

        console.log('\nOthers SKIPPED breakdown:');
        skippedRes.rows.forEach(r => console.log(`- ${r.reason || 'No Reason'}: ${r.count}`));

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

checkRecentActivity();
