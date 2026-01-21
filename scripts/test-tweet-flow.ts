
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load env before imports that might use it
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

import { TwitterAgentService } from '../lib/ai/twitter-agent';

async function main() {
    const symbol = 'LUCK';
    const price = 850.5;
    const prevAth = 820.0;

    console.log(`--- TESTING AUTOMATED TWEET FLOW FOR ${symbol} (OG VERSION) ---`);

    // 1. Generate Tweet
    console.log('\n1. Generating Tweet Text...');
    try {
        const systemNotes = `
            Event: ATH
            Price: ${price}
            Previous Record: ${prevAth}
            Headline context: LUCK hits new All Time High of ${price}
        `;
        const tweetRes = await TwitterAgentService.generate(symbol, systemNotes, 'tweet');
        console.log('✅ DRAFT RECEIVED:');
        console.log(tweetRes.draft);
    } catch (e) {
        console.error('❌ AI Generation Failed:', e);
    }

    // 2. Fetch OG Image
    console.log('\n2. Fetching Vercel OG Image...');
    try {
        // NOTE: Server must be running on localhost:3000 (or port defined in env)
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const url = `${baseUrl}/api/og/chart?symbol=${symbol}&price=${price}`;
        console.log(`   Fetching ${url}...`);

        const res = await fetch(url);
        if (res.ok) {
            const buffer = await res.arrayBuffer();
            fs.writeFileSync('test-og-chart.png', Buffer.from(buffer));
            console.log(`✅ Image saved to test-og-chart.png (${buffer.byteLength} bytes)`);
        } else {
            console.error(`❌ Fetch failed: ${res.status} ${res.statusText}`);
            console.log('Ensure local server is running (npm run dev).');
        }
    } catch (e) {
        console.error('❌ Fetch Error:', e);
        console.log('Likely connection refused. Is the server running?');
    }

    console.log('\nNOTE: Twitter publishing is disabled in this test.');
    process.exit(0);
}

main();
