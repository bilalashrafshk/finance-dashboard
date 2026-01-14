
import { fetchPKEquityData } from '../lib/portfolio/pk-equity-api';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

async function main() {
    try {
        console.log('Testing SCSTrade Fetch for OGDC...');
        const data = await fetchPKEquityData('OGDC', '2026-01-13', '2026-01-15');
        console.log('SCSTrade Data:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error:', err);
    }
}

main();
