import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import { processVolumeSurges } from '../lib/events/event-processor';

// Load env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function test() {
    console.log('🧪 Starting Volume Surge Test...');

    const client = await pool.connect();
    try {
        // 1. Pick a symbol with enough history
        const testSymbol = 'OGDC';
        console.log(`Checking ${testSymbol}...`);

        // 2. Clear existing events for today to allow detection
        await client.query(`DELETE FROM event_queue WHERE symbol = $1 AND event_type = 'VOLUME_SURGE'`, [testSymbol]);
        await client.query(`DELETE FROM notable_events WHERE symbol = $1 AND event_type = 'VOLUME_SURGE'`, [testSymbol]);

        // 3. Find 10-day average
        const today = new Date().toISOString().split('T')[0];
        const histRes = await client.query(`
            SELECT AVG(volume) as avg_vol
            FROM (
                SELECT volume FROM historical_price_data 
                WHERE symbol = $1 AND asset_type = 'pk-equity' AND date < $2
                ORDER BY date DESC LIMIT 10
            ) t
        `, [testSymbol, today]);

        const avgVol = parseFloat(histRes.rows[0].avg_vol) || 0;
        console.log(`Average Volume (10D): ${avgVol.toLocaleString()}`);

        if (avgVol === 0) {
            console.error('No volume history found for test. Try another symbol.');
            return;
        }

        // 4. Simulate a surge (3x average)
        const simulatedVolume = avgVol * 3;
        console.log(`Simulating current volume: ${simulatedVolume.toLocaleString()} (3x Avg)`);

        await processVolumeSurges([{ symbol: testSymbol, volume: simulatedVolume }]);

        // 5. Verify Queue
        const queueRes = await client.query(`SELECT * FROM event_queue WHERE symbol = $1 AND event_type = 'VOLUME_SURGE' AND status = 'PENDING'`, [testSymbol]);

        if (queueRes.rowCount && queueRes.rowCount > 0) {
            console.log('✅ PASS: Volume Surge detected and queued!');
            console.log('Queue Item:', queueRes.rows[0]);
        } else {
            console.log('❌ FAIL: Volume Surge not detected.');
        }

    } catch (err) {
        console.error('Test Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

test();
