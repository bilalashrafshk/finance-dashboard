
import { fetchPKEquityData } from '../lib/portfolio/pk-equity-api';
import { insertHistoricalData } from '../lib/portfolio/db-client';
import * as dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';

// Setup DB connection explicitly for the script context if needed by db-client
// (db-client creates its own pool, but needs env vars)
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

async function main() {
    try {
        console.log('Fetching fresh EOD data from SCSTrade for OGDC...');

        // 1. Fetch from SCSTrade
        const data = await fetchPKEquityData('OGDC', '2026-01-14', '2026-01-14');

        if (data && data.length > 0) {
            console.log('Received Data:', JSON.stringify(data, null, 2));

            // 2. Insert into DB
            console.log('Updating Database...');
            // Need to map the data to HistoricalPriceRecord format expected by insert
            const records = data.map(d => ({
                date: d.date,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
                volume: d.volume,
                adjusted_close: null,
                change_pct: d.change_pct
            }));

            await insertHistoricalData('pk-equity', 'OGDC', records, 'manual-source');
            console.log('Success! Database updated with SCSTrade wicks.');
        } else {
            console.error('No data returned from SCSTrade for today.');
        }

    } catch (err) {
        console.error('Error:', err);
    }
}

main();
