
import * as dotenv from 'dotenv';
import path from 'path';
import { TwitterAgentService } from '../lib/ai/twitter-agent';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    const symbol = 'OGDC';

    // Test 1: Ask for news (Should Halt)
    console.log(`\n\n--- TEST 1: Requesting News for ${symbol} (Expected: Halt) ---`);
    console.log("User Note: Find latest news regarding circular debt.");

    try {
        const result1 = await TwitterAgentService.generate(symbol, "Find latest news regarding circular debt payment rumors.", "tweet");

        if (result1.status === 'NEEDS_RESEARCH') {
            console.log("✅ SUCCESS: Agent halted and requested research.");
            console.log("🔍 Queries:", result1.researchQueries);
        } else {
            console.log("❌ FAIL: Agent did not halt. Status:", result1.status);
            console.log("Draft:", result1.draft);
        }
    } catch (e) {
        console.error("Error Test 1:", e);
    }

    // Test 2: Resume with Research
    console.log(`\n\n--- TEST 2: Resuming with Research (Expected: Success) ---`);
    const mockResearch = `
    [SOURCE: Dawn News - 2 hours ago]
    Headline: Gov releases Rs 50bn for circular debt payment to OGDC/PPL.
    Summary: The Ministry of Finance has authorized a partial release of funds.
    `;

    try {
        const result2 = await TwitterAgentService.generate(
            symbol,
            "Find latest news regarding circular debt payment rumors.",
            "tweet",
            "",
            "short",
            mockResearch // <--- Providing Research Here
        );

        if (result2.status === 'SUCCESS') {
            console.log("✅ SUCCESS: Agent generated tweet using provided research.");
            console.log("🐦 Tweet:", result2.draft);
        } else {
            console.log("❌ FAIL: Agent halted again or failed. Status:", result2.status);
        }
    } catch (e) {
        console.error("Error Test 2:", e);
    }
}

main();
