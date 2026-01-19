
import { PersonalityService } from '../lib/ai/personality-service';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function check() {
    const personality = await PersonalityService.getPersonality('bilal-ashraf');
    console.log('--- CURRENT HUMANIZER INSTRUCTIONS ---');
    console.log(personality?.humanizer_instructions);
}

check();
