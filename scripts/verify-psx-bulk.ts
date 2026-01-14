import * as dotenv from 'dotenv';
import path from 'path';
import { syncAllPSXLivePrices } from '../lib/portfolio/psx-bulk-service';

// Load .env.local from the project root
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function verify() {
    console.log('Starting PSX Bulk Sync Verification...');
    console.log('DB URL:', process.env.DATABASE_URL ? 'Loaded' : 'NOT LOADED');

    try {
        const count = await syncAllPSXLivePrices();
        console.log(`Successfully processed ${count} stocks.`);
    } catch (e) {
        console.error('Verification failed:', e);
    }
}

verify();
