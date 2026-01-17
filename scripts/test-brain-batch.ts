
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PersonalityService } from '../lib/ai/personality-service';
import { AIContextService } from '../lib/ai/ai-context-service';
import * as dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

interface TestCase {
    name: string;
    symbol: string;
    notes: string;
    expectedBehavior: string;
}

const testCases: TestCase[] = [
    {
        name: "News-Heavy (Sufficient)",
        symbol: "MARI",
        notes: `🟢 MARI: MARI Launches Cloud & AI Platform, Eyeing Digital Evolution
(OIL & GAS EXPLORATION COMPANIES)
The announcement suggests MARI is diversifying into technology, potentially boosting investor confidence.
Sky47, launches Cloud & AI infrastructure platform. Platform located at Islamabad.`,
        expectedBehavior: "SKIP TOOLS - News is sufficient"
    },
    {
        name: "Data Request (Explicit)",
        symbol: "LUCK",
        notes: "What is the PE and price right now?",
        expectedBehavior: "USE TOOLS - Explicit request for quantitative data"
    },
    {
        name: "Vague Request",
        symbol: "SYS",
        notes: "Write a standard tweet.",
        expectedBehavior: "USE TOOLS - No context provided, fallback to Price/PE"
    },
    {
        name: "Style/Humor (No Data Needed)",
        symbol: "LUCK",
        notes: "Write a funny tweet about how the cement sector is moving as slow as actual wet cement.",
        expectedBehavior: "SKIP TOOLS - Purely stylistic/humor focused"
    },
    {
        name: "Mixed (News + Data Question)",
        symbol: "MARI",
        notes: "MARI announced a tech pivot. This is huge. But how does its P/E look compared to the oil sector now?",
        expectedBehavior: "USE TOOLS - Requires P/E comparison data"
    },
    {
        name: "Macro Analysis (No Symbol)",
        symbol: "N/A",
        notes: "Meezab Group is General Sales Agent (GSA) in Pakistan for FitsAir. FitsAir is planning to operate twice-a-week flights between Colombo and Lahore with Airbus A320.",
        expectedBehavior: "SKIP TOOLS (or use Search) - Focus on macro commentary, no ticker forced"
    },
    {
        name: "Length & Flow Check (Canada/China)",
        symbol: "N/A",
        notes: "Canada agrees to cut 100% tariff on Chinese EVs in exchange for lower tariffs on Canadian farm products. My thought: US/Canada relations deteriorating. Better relation between Canada China because of that",
        expectedBehavior: "STRICTLY UNDER 280 CHARS - No headers, natural flow"
    },
    {
        name: "Subject Continuity Check (China Research)",
        symbol: "N/A",
        notes: "JUST IN: Chinese Universities now dominate global research rankings, taking seven of the top 10 spots. Add a supporting argument or example other than university rankings.",
        expectedBehavior: "MAINTAIN SUBJECT - Additional info must relate to China R&D/Tech dominance, NOT unrelated tech."
    },
    {
        name: "Explicit Data Override (MARI)",
        symbol: "MARI",
        notes: "MARI Launches Cloud & AI Platform. Explain how it is good. Do use Mari's figures e.g. PE and other factors etc please incorporating in ur thesis.",
        expectedBehavior: "CALL TOOLS - Explicitly asks for PE and figures, must override 'news is enough' rule."
    }
];

// Replicate the tool calling logic from TwitterAgentService
async function callFunction(name: string, args: any) {
    switch (name) {
        case 'getCompanyProfile': return await AIContextService.getCompanyProfile(args.symbol);
        case 'getPriceHistoryMetrics': return await AIContextService.getPriceHistoryMetrics(args.symbol);
        case 'getQuarterlyEarnings': return await AIContextService.getQuarterlyEarnings(args.symbol);
        case 'getAnnualEarnings': return await AIContextService.getAnnualEarnings(args.symbol);
        case 'getDividendInfo': return await AIContextService.getDividendInfo(args.symbol);
        case 'googleSearch': return { text: "Search results indicating strong growth in China R&D and patent dominance." };
        default: throw new Error(`Unknown tool: ${name}`);
    }
}

const toolDefinitions = [
    {
        functionDeclarations: [
            {
                name: 'getCompanyProfile',
                description: 'Fetch basic company profile, sector, and valuation metrics (Price, P/E, etc).',
                parameters: {
                    type: 'object',
                    properties: { symbol: { type: 'string', description: 'The stock symbol to lookup' } },
                    required: ['symbol']
                }
            },
            {
                name: 'getPriceHistoryMetrics',
                description: 'Fetch technical price metrics like the 52-week high.',
                parameters: {
                    type: 'object',
                    properties: { symbol: { type: 'string', description: 'The stock symbol' } },
                    required: ['symbol']
                }
            },
            {
                name: 'getQuarterlyEarnings',
                description: 'Fetch last 8 quarterly EPS and Net Income data.',
                parameters: {
                    type: 'object',
                    properties: { symbol: { type: 'string', description: 'The stock symbol' } },
                    required: ['symbol']
                }
            },
            {
                name: 'getAnnualEarnings',
                description: 'Fetch last 3 annual earnings reports.',
                parameters: {
                    type: 'object',
                    properties: { symbol: { type: 'string', description: 'The stock symbol' } },
                    required: ['symbol']
                }
            },
            {
                name: 'getDividendInfo',
                description: 'Fetch the latest dividend payment and yield details.',
                parameters: {
                    type: 'object',
                    properties: { symbol: { type: 'string', description: 'The stock symbol' } },
                    required: ['symbol']
                }
            }
        ]
    }
];

async function runBatch() {
    console.log(`Starting FULL end-to-end batch test of ${testCases.length} scenarios...`);

    const personality = await PersonalityService.getPersonality('bilal-ashraf');
    if (!personality) throw new Error('Personality not found');
    const results = [];

    const defaultCoordinatorPrompt = `You are the COORDINATOR of an investment agent.
Analyze the user's input and current context carefully.
Your priority is to determine if the existing information is sufficient to create a high-quality post.

- IF the user provides a symbol like "N/A" or "Macro", focus on broader market themes, industry analysis, or general commentary. DO NOT force a ticker request if the topic is macro-economic.
- IF the user provides rich context (like a news announcement), your first instinct should be to use that.
- ONLY plan a tool call if you need specific quantitative data (Price, P/E, etc.) or web context (Google Search) that would significantly enhance the post's signal OR if the user explicitly asks for data.
- DO NOT chase stats for the sake of it. If the news/macro theme is the primary signal, skip the tools.
- DO NOT write the final tweet/reply yet.

Available Tools:
1. Price Metrics: Current price, daily change, high/low. (Use if price action is the focus).
2. P/E & Valuation: P/E vs Sector P/E. (Use if valuation is the core question).
3. Earnings: Recent quarters/annual performance. (Use for deep financial analysis).
4. Dividends: Yield and history. (Use if income is the focus).
5. Google Search: Latest web info. (Use if context is missing, for macro facts, or if explicitly asked).`;

    const coordinatorInstructions = personality.coordinator_instructions || defaultCoordinatorPrompt;

    for (const tc of testCases) {
        process.stdout.write(`Running Stage 1 (Brain): ${tc.name}... `);

        const brainModel = genAI.getGenerativeModel({
            model: personality.default_model || 'gemini-2.0-flash',
            systemInstruction: coordinatorInstructions
        });

        const brainPrompt = `Request: Write a tweet for symbol ${tc.symbol}. ${tc.notes ? `User Note: ${tc.notes}` : ''}.
        Decide which tools (if any) are needed to add VALUE. If the news provided is clear, you can say 'No tools needed'.`;

        // Stage 1: Brain
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

        const planText = brainResult.response.text();
        const planLower = planText.toLowerCase();

        const explicitlySkips = planLower.includes('no tools needed') ||
            planLower.includes('no tools are needed') ||
            planLower.includes('skip the tools');

        const toolCallsPlanned = !explicitlySkips && (
            planLower.includes('tool selection') ||
            planLower.includes('tool call') ||
            planLower.includes('tools needed') ||
            planLower.includes('price metrics') ||
            planLower.includes('p/e')
        );

        console.log(`Done (${toolCallsPlanned ? '🛠️' : '📰'})`);

        // Stage 2: Hand (Execution)
        process.stdout.write(`  Stage 2 (Hand): Generating final tweet... `);

        const stage2SystemDoc = `
            ${personality.instructions}
            Current Mode: New Tweet
            Desired Format: Standard Tweet (under 280 characters)
            Format Constraints:
            - MUST be under 280 characters.
            - Be punchy and concise.
            - No threads.

            CORE MISSION:
            Create a high-signal "Technical Draft" based on the Brain's plan. 
            - Focus on FACTUAL ACCURACY.
            - DO NOT hallucinate prices or sector info if not explicitly provided.
            - Maintain an intelligent, expert tone.
        `;

        const relevantExamples = (personality.examples || [])
            .filter(ex => ex.type === 'short')
            .map(ex => ex.text);

        const planMentionsSearch = planLower.includes('google search') || planLower.includes('web search') || planLower.includes('search the web');
        const shouldEnableSearch = planMentionsSearch && personality.enabled_tools.googleSearch !== false;

        let handTools: any[] | undefined = undefined;
        if (shouldEnableSearch) {
            handTools = [{ googleSearch: {} }];
        } else if (toolCallsPlanned) {
            handTools = toolDefinitions as any[];
        }

        const handModel = genAI.getGenerativeModel({
            model: personality.default_model || 'gemini-2.0-flash',
            // @ts-ignore
            tools: handTools,
            systemInstruction: stage2SystemDoc
        });

        const chat = handModel.startChat({
            history: [],
            generationConfig: {
                // @ts-ignore
                thinkingConfig: { includeThoughts: true, thinkingBudget: 0 }
            }
        });

        let currentPrompt = `Execute this analysis plan: ${planText}`;
        let finalDraft = '';
        const history: any[] = [];
        const traceLog: any[] = [];

        for (let i = 0; i < 5; i++) {
            history.push({ role: 'user', parts: [{ text: currentPrompt }] });
            const result = await chat.sendMessage(currentPrompt);
            const response = result.response;
            const content = response.candidates![0].content;
            history.push({ role: 'model', parts: content.parts });

            for (const part of content.parts) {
                if (part.text) traceLog.push({ type: 'text', content: part.text });
            }

            const functionCallPart = content.parts.find(p => p.functionCall);
            if (functionCallPart?.functionCall) {
                const { name, args } = functionCallPart.functionCall;
                traceLog.push({ type: 'tool_call', name, args });
                const toolResult = await callFunction(name, args);
                traceLog.push({ type: 'tool_response', name, result: toolResult });

                currentPrompt = JSON.stringify({
                    functionResponse: { name, response: { content: toolResult } }
                });
            } else {
                finalDraft = content.parts.find(p => p.text)?.text || '';
                break;
            }
        }

        console.log(`Done.`);

        // Stage 3: Humanizer
        if (finalDraft && personality.humanizer_instructions) {
            process.stdout.write(`  Stage 3 (Human): Refining style... `);
            const humanizerPrompt = personality.humanizer_instructions.replace('{{tweet}}', finalDraft);

            const humanizerSystemInstruction = `
                You are a professional humanizer/editor for Bilal Ashraf.
                Your goal is to take a "Technical Draft" and refine it into Bilal's signature voice.
                
                BILAL'S BRAND EXAMPLES:
                ${relevantExamples.length > 0 ? relevantExamples.join('\n---\n') : 'No specific examples provided.'}
                
                HUMANIZATION RULES:
                - Use lowercase mostly.
                - Use the "I" rule for opinions.
                - Avoid "robot words" (notable, crucial, delve, etc).
            `;

            const humanizerModel = genAI.getGenerativeModel({
                model: personality.default_model || 'gemini-2.0-flash',
                systemInstruction: humanizerSystemInstruction
            });

            const humanRes = await humanizerModel.generateContent(humanizerPrompt);
            const humanText = humanRes.response.text();

            if (humanText) {
                finalDraft = humanText;
                traceLog.push({ type: 'text', content: `--- HUMANIZED ---` });
                traceLog.push({ type: 'text', content: humanText });
            }
            console.log(`Done.`);
        }

        results.push({
            scenario: tc.name,
            input: tc.notes,
            expected: tc.expectedBehavior,
            actualDecision: toolCallsPlanned ? "🛠️ PLANNED TOOLS" : "📰 NO TOOLS (BALANCED)",
            aiPlan: planText,
            finalTweet: finalDraft,
            executionSteps: traceLog
        });
    }

    const outputPath = path.resolve(process.cwd(), 'scripts/test-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

    console.log(`\n=== BATCH SUMMARY ===`);
    results.forEach(r => {
        console.log(`[${r.actualDecision}] ${r.scenario}`);
        console.log(`Draft: ${r.finalTweet}\n`);
    });
    console.log(`Results saved to: ${outputPath}`);
}

runBatch().catch(console.error);
