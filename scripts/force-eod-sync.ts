
import * as dotenv from 'dotenv';
import path from 'path';

// Load env FIRST
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

import { ensureHistoricalData } from '../lib/portfolio/historical-data-service';
import { Pool } from 'pg';

async function main() {
    try {
        console.log('Forcing EOD Gap Fill for OGDC...');

        // This function initiates the "gap check" and should fetch from SCSTrade if data is missing
        const result = await ensureHistoricalData('pk-equity', 'OGDC', 5, true); // true = skipCache to force check

        console.log('Sync Result:', JSON.stringify(result.data.slice(-2), null, 2));
        console.log('Source:', result.source);
        console.log('Latest Date:', result.latestDate);

    } catch (err) {
        console.error('Error:', err);
    }
}

main();
