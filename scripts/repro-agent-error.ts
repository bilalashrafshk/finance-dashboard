
import { TwitterAgentService } from '../lib/ai/twitter-agent';
import { PersonalityService } from '../lib/ai/personality-service';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function test() {
    console.log('--- REPRO AGENT ERROR ---');
    try {
        const personality = await PersonalityService.getPersonality('bilal-ashraf');
        console.log('Model in DB:', personality?.default_model);
        console.log('Tools Enabled in DB:', JSON.stringify(personality?.enabled_tools, null, 2));

        const symbol = 'LUCK';
        const notes = 'Test draft';

        console.log('\nCalling TwitterAgentService.generate...');
        const result = await TwitterAgentService.generate(symbol, notes);

        console.log('\n✅ SUCCESS!');
        console.log('Draft:', result.draft);
    } catch (error: any) {
        console.error('\n❌ FAILED:');
        console.error(error.message);
        if (error.response) {
            console.error('API Error details:', JSON.stringify(error.response, null, 2));
        }
    }
}

test();
