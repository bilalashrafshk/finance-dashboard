
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('🔌 Connected to DB');

        // 1. Fetch pending titles to assume "Done"
        console.log('🔍 Fetching pending items...');
        const res = await client.query(`
            SELECT DISTINCT(metadata->>'title') as title, symbol 
            FROM event_queue 
            WHERE status IN ('PENDING', 'PROCESSED', 'FAILED')
            AND event_type = 'fundamental_alert'
        `);

        if (res.rowCount === 0) {
            console.log('✅ No pending items found to migrate.');
        } else {
            console.log(`found ${res.rowCount} unique titles to backfill.`);

            // 2. Insert into notable_events
            for (const row of res.rows) {
                const { title, symbol } = row;
                if (!title) continue;

                console.log(`📝 Backfilling: [${symbol}] ${title}`);
                await client.query(`
                    INSERT INTO notable_events (symbol, event_type, headline, summary, metadata, created_at)
                    VALUES ($1, 'fundamental_alert', $2, 'Manual Fix - Auto Inserted', $3, NOW())
                    ON CONFLICT DO NOTHING
                `, [
                    symbol,
                    `[Manual Fix] ${title}`,
                    JSON.stringify({ psx_title: title, is_manual_fix: true, sector: 'General' })
                ]);
            }
        }

        // 3. Clear Queue
        console.log('🧹 Clearing event_queue...');
        const deleteRes = await client.query("DELETE FROM event_queue");
        console.log(`🗑️ Deleted ${deleteRes.rowCount} items from event_queue.`);

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
