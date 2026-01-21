
import * as dotenv from 'dotenv';
import path from 'path';
import { TwitterAgentService } from '../lib/ai/twitter-agent';

// Load env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

async function main() {
    console.log('--- TESTING GOLD LOGIC (DATE: JAN 2026) ---');

    const symbol = 'GOLD';
    const userNotes = "Gold just hit a new all-time high of $4,875 for the first time in history. In the last 2 years, gold has added $19 trillion to its market cap.";

    // Simulating stale research from 2024 that the AI might find or be given
    const providedResearch = `
    [SOURCE: CNBC]
    Gold hits new record high as Fed rate cut bets firm up
    Gold prices reached an all-time high of $2,195.23 per ounce on March 8, 2024.
    `;

    console.log('INPUTS:');
    console.log('User Note:', userNotes);
    console.log('Provided Research (Stale):', providedResearch);

    try {
        const result = await TwitterAgentService.generate(
            symbol,
            userNotes,
            'tweet',
            '',
            'short',
            providedResearch
        );

        console.log('\n--- REASONING LOG ---');
        result.reasoningLog.forEach(log => {
            if (log.type === 'thought') {
                console.log(`[AI]: ${log.content}`);
            }
        });

        console.log('\n--- FINAL DRAFT ---');
        console.log(result.draft);

    } catch (e) {
        console.error('Error:', e);
    }
}

main();
