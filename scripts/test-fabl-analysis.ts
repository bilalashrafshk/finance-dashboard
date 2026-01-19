
import { getPool } from '../lib/db';
import { AIContextService } from '../lib/ai/ai-context-service';
import { analyzeAnnouncement } from '../lib/ai-service';
import { getPromptSlugByTitle } from '../lib/ai/prompt-router';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    const symbol = 'FABL';
    const announcement = {
        symbol,
        company: 'Faysal Bank Ltd',
        title: 'Injection of PKR 200 million Faysal Bank Ltd in its subsidiary Faysal Islami Currency Exchange Company (Pvt) Ltd by way of Right Shares',
        attachments: ['https://dps.psx.com.pk/download/document/268852.pdf']
    };

    console.log(`\n🚀 Starting Analysis for ${symbol}...\n`);

    try {
        const pool = getPool();

        // 1. Fetch Context
        console.log('📊 Fetching Context Data...');
        const context = await AIContextService.getContext(symbol);
        console.log('\n--- CONTEXT DATA ---');
        console.log(JSON.stringify(context, null, 2));
        console.log('--------------------\n');

        // 2. Prepare AI Prompt
        const promptSlug = getPromptSlugByTitle(announcement.title);
        const promptRes = await pool.query("SELECT content FROM ai_prompts WHERE slug = $1", [promptSlug]);
        const systemPrompt = promptRes.rows[0]?.content || "Analyze this financial announcement.";

        // 3. Run Analysis
        console.log('🧠 Running AI Analysis (this may take a few seconds)...');
        const { text: rawAiResult } = await analyzeAnnouncement(systemPrompt, context, announcement);

        console.log('\n--- AI FINAL OUTPUT ---');
        console.log(rawAiResult);
        console.log('-----------------------\n');

    } catch (err: any) {
        console.error('❌ Error during analysis:', err.message);
        if (err.stack) console.error(err.stack);
    } finally {
        const pool = getPool();
        await pool.end();
    }
}

main().catch(err => console.error(err));
