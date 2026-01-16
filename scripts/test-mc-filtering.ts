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

async function testFiltering() {
    console.log('🧪 Starting Market Cap Filtering Test...');

    const client = await pool.connect();
    try {
        const testSymbol = 'OGDC';

        // 1. Set threshold to 1 (Only the #1 company triggers alerts)
        console.log('Setting mc_threshold_rank to 1...');
        await client.query("UPDATE alert_configs SET value = '1' WHERE key = 'mc_threshold_rank'");

        // 2. Check if OGDC is #1
        const topRes = await client.query(`
            SELECT symbol, market_cap 
            FROM company_profiles 
            WHERE asset_type = 'pk-equity' AND market_cap IS NOT NULL 
            ORDER BY market_cap DESC LIMIT 5
        `);
        console.log('Top 5 Symbols by Market Cap:');
        topRes.rows.forEach((r, i) => console.log(`${i + 1}. ${r.symbol} (${r.market_cap})`));

        const topSymbol = topRes.rows[0].symbol;
        const testSubject = (topSymbol === testSymbol) ? topRes.rows[1].symbol : testSymbol;
        console.log(`Testing with ${testSubject} (Rank > 1)...`);

        // 3. Clear existing
        await client.query(`DELETE FROM event_queue WHERE symbol = $1 AND event_type = 'VOLUME_SURGE'`, [testSubject]);

        // 4. Try to trigger (Large Volume)
        const hugeVolume = 100000000;
        console.log(`Simulating huge volume for ${testSubject}...`);
        await processVolumeSurges([{ symbol: testSubject, volume: hugeVolume, price: 100 }]);

        // 5. Verify Queue (Should be empty due to filtering)
        const queueRes = await client.query(`SELECT * FROM event_queue WHERE symbol = $1 AND event_type = 'VOLUME_SURGE'`, [testSubject]);

        if (queueRes.rowCount === 0) {
            console.log('✅ PASS: Alert successfully FILTERED OUT because rank > 1.');
        } else {
            console.log('❌ FAIL: Alert was NOT filtered out.');
        }

        // 6. Restore threshold to a high value
        console.log('Restoring threshold to 100...');
        await client.query("UPDATE alert_configs SET value = '100' WHERE key = 'mc_threshold_rank'");

        // 7. Try again (Should pass now)
        console.log(`Testing again with high threshold...`);
        await processVolumeSurges([{ symbol: testSubject, volume: hugeVolume, price: 100 }]);

        const queueRes2 = await client.query(`SELECT * FROM event_queue WHERE symbol = $1 AND event_type = 'VOLUME_SURGE'`, [testSubject]);
        if (queueRes2.rowCount && queueRes2.rowCount > 0) {
            console.log('✅ PASS: Alert allowed with correct threshold.');
        } else {
            console.log('❌ FAIL: Alert still filtered? Check logic.');
        }

    } catch (err) {
        console.error('Test Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

testFiltering();
