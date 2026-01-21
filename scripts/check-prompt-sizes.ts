
import { PersonalityService } from '../lib/ai/personality-service';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runCheck() {
    const personality = await PersonalityService.getPersonality('bilal-ashraf');
    if (!personality) {
        console.log('Personality not found');
        return;
    }

    console.log('--- Prompt Sizes (Characters) ---');
    console.log('Instructions (Drafter):', personality.instructions?.length || 0);
    console.log('Coordinator:', personality.coordinator_instructions?.length || 0);
    console.log('Humanizer Instructions:', personality.humanizer_instructions?.length || 0);
    console.log('Briefing Instructions:', personality.briefing_instructions?.length || 0);

    console.log('\n--- Granular Prompts ---');
    console.log('Tweet Coordinator:', personality.tweet_coordinator_prompt?.length || 0);
    console.log('Tweet Drafter:', personality.tweet_drafter_prompt?.length || 0);
    console.log('Tweet Humanizer:', personality.tweet_humanizer_prompt?.length || 0);

    console.log('\nReply Coordinator:', personality.reply_coordinator_prompt?.length || 0);
    console.log('Reply Drafter:', personality.reply_drafter_prompt?.length || 0);
    console.log('Reply Humanizer:', personality.reply_humanizer_prompt?.length || 0);

    console.log('\n--- Examples ---');
    console.log('Total Examples Count:', personality.examples.length);
    const totalExLength = personality.examples.reduce((sum, ex) => sum + ex.text.length, 0);
    console.log('Total Examples Length (chars):', totalExLength);

    personality.examples.forEach((ex, i) => {
        console.log(`Example ${i + 1}: [${ex.mode || 'tweet'}] [${ex.type}] ${ex.text.length} chars`);
    });
}

runCheck().catch(console.error);
