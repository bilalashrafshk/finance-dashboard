
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { TwitterAgentService } from '../lib/ai/twitter-agent';
import { TwitterPublisher } from '../lib/services/twitter-publisher';

// Load env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

async function main() {
    const symbol = 'PSO';
    const price = 496.00;
    const prevHigh = 494.80;
    const eventType = 'ATH';

    console.log(`\n🚀 SIMULATING ${eventType} EVENT FOR ${symbol}`);
    console.log(`   Price: ${price}, Prev: ${prevHigh}`);

    const systemNotes = `
        Event: ${eventType}
        Price: ${price}
        Previous Record: ${prevHigh}
        Headline context: ${symbol} touches intraday all-time high
    `;

    try {
        // 1. Generate Tweet Logic
        console.log('\n1. Generating Tweet Content...');
        const tweetGen = await TwitterAgentService.generate(symbol, systemNotes, 'tweet');
        console.log('   Draft:', tweetGen.draft);

        // 2. Fetch Image (Try Production URL for stability if local fails)
        console.log('\n2. Fetching Chart Image...');
        // Using the Production URL to ensure we get a valid image without needing local server running on specific port
        const chartUrl = `https://www.convictionpays.com/api/og/chart?symbol=${symbol}&price=${price}&title=ALL%20TIME%20HIGH`;

        let imageBuffer: Buffer | undefined;
        try {
            const res = await fetch(chartUrl);
            if (res.ok) {
                const arrayBuffer = await res.arrayBuffer();
                imageBuffer = Buffer.from(arrayBuffer);
                console.log(`   ✅ Image fetched successfully (${imageBuffer.byteLength} bytes)`);
            } else {
                console.warn(`   ⚠️ Status ${res.status}: Could not fetch image. Posting text only.`);
            }
        } catch (e) {
            console.warn('   ⚠️ Fetch failed (Network/DNS). Posting text only.', e);
        }

        // 3. Post to Twitter (TEXT ONLY DEBUG)
        console.log('\n3. Posting to Twitter (Text Only Debug)...');

        // Post text only to verify v2 access
        const tweetUrl = await TwitterPublisher.postTweet(`${tweetGen.draft} #Test`, undefined);

        if (tweetUrl) {
            console.log(`\n✅ SUCCESS! Tweet posted: ${tweetUrl}`);
        } else {
            console.error('\n❌ FAILED to post tweet. Check logs.');
        }

    } catch (e) {
        console.error('❌ Simulation Failed:', e);
    }
}

main();
