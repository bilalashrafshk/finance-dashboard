
import { PersonalityService } from '../lib/ai/personality-service';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function check() {
    try {
        const personality = await PersonalityService.getPersonality('bilal-ashraf');
        console.log('--- DB Personality Check ---');
        console.log('Model:', personality?.default_model);
        console.log('Enabled Tools:', JSON.stringify(personality?.enabled_tools, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
