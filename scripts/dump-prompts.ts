
import { PersonalityService } from '../lib/ai/personality-service';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runDump() {
    const personality = await PersonalityService.getPersonality('bilal-ashraf');
    if (!personality) return;

    console.log('--- tweet_humanizer_prompt ---');
    console.log(personality.tweet_humanizer_prompt);
    console.log('\n--- humanizer_instructions ---');
    console.log(personality.humanizer_instructions);
}

runDump().catch(console.error);
