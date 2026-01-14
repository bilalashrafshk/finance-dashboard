
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

async function main() {
    const client = await pool.connect();
    try {
        console.log('🗑️  Starting Reset for Jan 14th (Market Closed)...');

        // 1. Delete Notable Events for Today
        console.log('Deleting notable events created on or after 2026-01-14...');
        const eventRes = await client.query(`
            DELETE FROM notable_events 
            WHERE created_at >= '2026-01-14 00:00:00'
        `);
        console.log(`✅ Deleted ${eventRes.rowCount} events.`);

        // 2. Delete Historical Price Data for Today (Intraday/EOD placeholder)
        console.log('Deleting price data for 2026-01-14...');
        const priceRes = await client.query(`
            DELETE FROM historical_price_data 
            WHERE date = '2026-01-14' 
            AND asset_type = 'pk-equity'
        `);
        console.log(`✅ Deleted ${priceRes.rowCount} price records.`);

        console.log('✨ Reset Complete. Now you should run the stats update script.');

    } catch (err) {
        console.error('❌ Error during reset:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
