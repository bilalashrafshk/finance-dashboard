
import { TwitterAgentService } from '../lib/ai/twitter-agent';
import { PersonalityService } from '../lib/ai/personality-service';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function test() {
    console.log('--- REPRO FORCED STATS ---');
    try {
        const symbol = 'MARI';
        const notes = `🟢 MARI: MARI Launches Cloud & AI Platform, Eyeing Digital Evolution
(OIL & GAS EXPLORATION COMPANIES)

The announcement suggests MARI is diversifying into technology, potentially boosting investor confidence. Expect an initial positive reaction, though sustained gains depend on successful execution and market adoption.

The Intelligence Scoop
• MARI subsidiary, Sky47, launches Cloud & AI infrastructure platform.

• Platform located at Silicon Valley of Capital Smart City near Islamabad.

• Aims to provide secure, scalable, and sovereign digital infrastructure.

Valuation Insight
"Sector P/E is significantly lower than MARI's which might lead to further analysis of MARI's valuation in the sector"

Momentum Pulse
"The move into the technology sector could attract new investors leading to increased volatility."`;

        console.log('\nCalling TwitterAgentService.generate with News notes...');
        const result = await TwitterAgentService.generate(symbol, notes);

        console.log('\n✅ SUCCESS!');
        console.log('\n--- Plan ---');
        const plan = result.reasoningLog.find(r => typeof r.content === 'string' && r.content.startsWith('PLAN:'))?.content;
        console.log(plan || 'No PLAN: prefix found in log.');

        console.log('\n--- Full Reasoning Log ---');
        result.reasoningLog.forEach((r, i) => {
            console.log(`[${i}] ${r.type}: ${r.content}`);
            if (r.args) console.log(`    Args: ${JSON.stringify(r.args)}`);
            if (r.result) console.log(`    Result: ${JSON.stringify(r.result).substring(0, 100)}...`);
        });

        console.log('\nDraft:', result.draft);
    } catch (error: any) {
        console.error('\n❌ FAILED:');
        console.error(error.message);
    }
}

test();
