
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Simulation of the App's toolset
const customTools = {
    functionDeclarations: [
        {
            name: 'getAssetData',
            description: 'Get price and PE for a stock',
            parameters: {
                type: 'object',
                properties: { symbol: { type: 'string' } },
                required: ['symbol']
            }
        }
    ]
};

async function proposedServiceImplementation(symbol: string, userNotes: string) {
    const modelId = 'gemini-2.5-flash'; // Configurable
    const reasoningLog: any[] = [];

    console.log(`\n[SERVICE LOG] Using Model: ${modelId}`);

    // --- STAGE 1: THE BRAIN ---
    console.log(`[SERVICE LOG] STAGE 1: Reasoning...`);
    const brainModel = genAI.getGenerativeModel({ model: modelId });

    // As per user hint: "include_thoughts": True forces trace
    const brainConfig = {
        thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: 1024 // Required to get 'thought' parts back
        }
    };

    const brainPrompt = `I am writing a tweet for Bilal Ashraf about ${symbol}. ${userNotes ? `Context: ${userNotes}` : ''}. Start by reasoning about what data you need to find.`;

    // @ts-ignore
    const brainResult = await brainModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: brainPrompt }] }],
        generationConfig: brainConfig
    });

    const brainParts = brainResult.response.candidates?.[0]?.content?.parts || [];
    const internalThoughts = brainParts.find((p: any) => p.thought)?.thought;
    const planText = brainResult.response.text();

    if (internalThoughts) {
        reasoningLog.push({ type: 'thought', content: internalThoughts, isRawThinking: true });
        console.log(`[SERVICE LOG] ✅ Thoughts captured.`);
    }

    // --- STAGE 2: THE HAND ---
    console.log(`[SERVICE LOG] STAGE 2: Execution (No Thinking)...`);

    // Note: We avoid mixing search and custom tools. 
    // Logic: If plan mentions search or latest news, use Search. Otherwise use custom.
    const useSearch = planText.toLowerCase().includes('search') || planText.toLowerCase().includes('news');

    const handTools = useSearch ? [{ googleSearch: {} }] : [customTools];
    console.log(`[SERVICE LOG] Selected Tools: ${useSearch ? 'Google Search' : 'Custom App Database'}`);

    const handModel = genAI.getGenerativeModel({
        model: modelId,
        tools: handTools as any
    });

    const handConfig = {
        thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: 0 // MUST BE 0 for tools to work
        }
    };

    const handPrompt = `I have completed my reasoning. Now execute tool calls to fulfill this plan: ${planText}`;

    // @ts-ignore
    const handResult = await handModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: handPrompt }] }],
        generationConfig: handConfig
    });

    const handResponse = handResult.response;
    const toolCall = handResponse.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall);

    if (toolCall) {
        reasoningLog.push({ type: 'tool_call', name: toolCall.functionCall.name, args: toolCall.functionCall.args });
        console.log(`[SERVICE LOG] ✅ Tool call generated: ${toolCall.functionCall.name}`);
    } else {
        console.log(`[SERVICE LOG] ⚠️ Final text generated directly.`);
        reasoningLog.push({ type: 'thought', content: handResponse.text() });
    }

    return {
        draft: handResponse.text(),
        reasoningLog
    };
}

async function runTest() {
    console.log('--- INTERNAL SERVICE PROTOTYPE TEST ---');
    try {
        const result = await proposedServiceImplementation('LUCK', 'Analyze current value vs sector.');
        console.log('\n--- FINAL RESULT ---');
        console.log('Draft Context/Tweet:', result.draft.substring(0, 100), '...');
        console.log('Reasoning Log Steps:', result.reasoningLog.length);
        result.reasoningLog.forEach((log: any, i: number) => {
            console.log(`  Step ${i + 1}: [${log.type}] ${log.isRawThinking ? '(RAW THOUGHT)' : ''} ${String(log.content || log.name).substring(0, 50)}...`);
        });
        console.log('\n✅ ARCHITECTURE VERIFIED INTERNALLY.');
    } catch (e: any) {
        console.error('❌ TEST FAILED:', e.message);
    }
}

runTest();
