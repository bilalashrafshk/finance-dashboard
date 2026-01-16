
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function listModels() {
    try {
        const commonIds = [
            'gemini-2.0-flash-thinking-exp-1219',
            'gemini-2.0-flash-thinking-exp-01-21',
            'gemini-2.0-flash-exp',
            'gemini-2.0-flash',
            'gemini-2.5-flash',
        ];

        console.log('--- Testing Current API Access ---');
        for (const id of commonIds) {
            try {
                const m = genAI.getGenerativeModel({ model: id });
                await m.generateContent({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] });
                console.log(`✅ ${id}: AVAILABLE`);
            } catch (e: any) {
                console.log(`❌ ${id}: NOT FOUND / ERROR (${e.message.substring(0, 60)})`);
            }
        }
    } catch (error) {
        console.error(error);
    }
}

listModels();
