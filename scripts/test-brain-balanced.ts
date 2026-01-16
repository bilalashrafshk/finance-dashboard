
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PersonalityService } from '../lib/ai/personality-service';
import { AIContextService } from '../lib/ai/ai-context-service';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

async function runTest(testName: string, symbol: string, userNotes: string) {
    console.log(`\n=== TEST: ${testName} ===`);
    console.log(`Symbol: ${symbol}`);
    console.log(`Notes: ${userNotes.substring(0, 100)}...`);

    const personality = await PersonalityService.getPersonality('bilal-ashraf');
    if (!personality) throw new Error('Personality not found');

    const mode = 'tweet';
    const postFormat = 'short';
    const targetTweet = '';

    // Filter examples
    const relevantExamples = personality.examples
        .filter(ex => ex.type === postFormat)
        .map(ex => ex.text);

    const notesLower = userNotes.toLowerCase();
    const userAskedForSearch = notesLower.includes('search') || notesLower.includes('google') || notesLower.includes('latest news');

    // --- EXPERIMENTAL BALANCED BRAIN PROMPT ---
    const balancedBrainInstruction = `You are the COORDINATOR of an investment agent.
Analyze the user's input and current context carefully.
Your priority is to determine if the existing information is sufficient to create a high-quality post.

- IF the user provides rich context (like a news announcement), your first instinct should be to use that.
- ONLY plan a tool call if you need specific quantitative data (Price, P/E, etc.) that would significantly enhance the post's signal OR if the user explicitly asks for data.
- DO NOT chase stats for the sake of it. If the news is the primary signal, skip the tools.
- DO NOT write the final tweet/reply yet.

Available Tools:
1. Price Metrics: Current price, daily change, high/low. (Use if price action is the focus).
2. P/E & Valuation: P/E vs Sector P/E. (Use if valuation is the core question).
3. Earnings: Recent quarters/annual performance. (Use for deep financial analysis).
4. Dividends: Yield and history. (Use if income is the focus).
5. Google Search: Latest web info. (Use ONLY if explicitly asked or for missing macro news).

${userAskedForSearch ? 'The user has requested a web search. Include planning for Google Search.' : 'Do NOT plan for web search unless explicitly requested.'}`;

    const brainModel = genAI.getGenerativeModel({
        model: personality.default_model || 'gemini-2.0-flash',
        systemInstruction: balancedBrainInstruction
    });

    const brainPrompt = `Request: Write a ${mode as string === 'reply' ? 'reply' : 'tweet'} for symbol ${symbol}. ${userNotes ? `User Note: ${userNotes}` : ''}.
    Decide which tools (if any) are needed to add VALUE. If the news provided is clear, you can say 'No tools needed'.`;

    // @ts-ignore
    const brainResult = await brainModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: brainPrompt }] }],
        generationConfig: {
            // @ts-ignore
            thinkingConfig: {
                includeThoughts: true,
                thinkingBudget: 1024
            }
        }
    });

    const brainParts = (brainResult.response.candidates?.[0]?.content?.parts || []) as any[];
    const internalThoughts = brainParts.find((p: any) => p.thought)?.thought;
    const planText = brainResult.response.text();

    console.log('\n--- BRAIN OUTPUT ---');
    console.log('PLAN:', planText);
    if (internalThoughts) {
        const thoughtStr = typeof internalThoughts === 'string' ? internalThoughts : JSON.stringify(internalThoughts);
        console.log('REASONING:', thoughtStr.substring(0, 300) + '...');
    }

    const toolCallsDetected = planText.toLowerCase().includes('getcompanyprofile') ||
        planText.toLowerCase().includes('pe') ||
        planText.toLowerCase().includes('price') ||
        planText.toLowerCase().includes('earnings');

    console.log('\nRESULT: ' + (toolCallsDetected ? '⚠️ TOOLS PLANNED' : '✅ NO TOOLS NEEDED (NEWS-HEAVY)'));
}

async function main() {
    // Current Problem Case
    const mariNews = `🟢 MARI: MARI Launches Cloud & AI Platform, Eyeing Digital Evolution
(OIL & GAS EXPLORATION COMPANIES)
The announcement suggests MARI is diversifying into technology, potentially boosting investor confidence.
Sky47, launches Cloud & AI infrastructure platform. Platform located at Silicon Valley of Capital Smart City near Islamabad.`;

    await runTest("MARI NEWS (Expect No Tools)", "MARI", mariNews);

    // Baseline Case
    await runTest("BLANK INPUT (Expect Tools)", "LUCK", "Write a standard tweet.");

    // Explicit Case
    await runTest("EXPLICIT DATA REQUEST (Expect Tools)", "LUCK", "What is the PE and price right now?");
}

main().catch(console.error);
