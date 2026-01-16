import { GoogleGenerativeAI } from '@google/generative-ai';
import { PersonalityService } from './personality-service';
import { AIContextService } from './ai-context-service';

let genAI: GoogleGenerativeAI | null = null;

function initAI(apiKey: string) {
    if (!genAI) {
        genAI = new GoogleGenerativeAI(apiKey);
    }
    return genAI;
}

export class TwitterAgentService {
    /**
     * The "Tool Definitions" for Gemini 2.0
     */
    private static tools = [
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

    /**
     * Router to map AI tool names to actual code
     */
    private static async callFunction(name: string, args: any) {
        switch (name) {
            case 'getCompanyProfile': return await AIContextService.getCompanyProfile(args.symbol);
            case 'getPriceHistoryMetrics': return await AIContextService.getPriceHistoryMetrics(args.symbol);
            case 'getQuarterlyEarnings': return await AIContextService.getQuarterlyEarnings(args.symbol);
            case 'getAnnualEarnings': return await AIContextService.getAnnualEarnings(args.symbol);
            case 'getDividendInfo': return await AIContextService.getDividendInfo(args.symbol);
            default: throw new Error(`Unknown tool: ${name}`);
        }
    }

    static async generate(
        symbol: string,
        userNotes: string = '',
        mode: 'tweet' | 'reply' = 'tweet',
        targetTweet: string = '',
        postFormat: 'short' | 'long' = 'short'
    ): Promise<{ draft: string; reasoningLog: any[]; trace?: any }> {
        const apiKey = process.env.GEMINI_API_KEY || '';
        if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

        // 1. Fetch Brand Personality
        const personality = await PersonalityService.getPersonality('bilal-ashraf');
        if (!personality) throw new Error('Brand personality not found');

        const ai = initAI(apiKey);
        const reasoningLog: any[] = [];
        const history: any[] = [];

        // Filter examples based on format
        const relevantExamples = personality.examples
            .filter(ex => ex.type === postFormat)
            .map(ex => ex.text);

        // Heuristic: Only use Google Search if the user explicitly asks for it in their notes
        const notesLower = userNotes.toLowerCase();
        const userAskedForSearch = notesLower.includes('search') || notesLower.includes('google') || notesLower.includes('latest news') || notesLower.includes('find on web');

        const systemInstruction = `
            ${personality.instructions}
            
            Current Mode: ${mode === 'reply' ? 'Reply to existing tweet' : 'New Tweet'}
            Target Tweet (if reply): ${targetTweet || 'N/A'}
            Desired Format: ${postFormat === 'short' ? 'Standard Tweet (under 280 characters)' : 'Long Post / Thread (detailed analysis)'}
            
            Format Constraints:
            ${postFormat === 'short'
                ? '- MUST be under 280 characters.\n- Be punchy and concise.\n- No threads.'
                : '- Can be longer than 280 characters.\n- Use structured details.\n- Provide deep technical analysis.'}

            Brand Examples for ${postFormat} format:
            ${relevantExamples.length > 0 ? relevantExamples.join('\n---\n') : 'No specific examples provided for this format. Follow general instructions.'}
        `;

        // --- STAGE 1: THE BRAIN (Thinking ENABLED, Tools DISABLED) ---
        // This stage captures the AI's internal reasoning and data plan.
        const brainModel = ai.getGenerativeModel({
            model: personality.default_model || 'gemini-2.0-flash',
            systemInstruction: `You are the PLANNING brain of an investment agent. 
            Your goal is to decide which internal financial tools (if any) are needed to fulfill the user's request with high-quality, signal-driven data.
            If the request is simple or does not require specific stats, you may proceed without tools.
            DO NOT write the final tweet/reply yet. 
            Available tools include: Price metrics, P/E, Earnings, Dividends, or a Web Search.
            ${userAskedForSearch ? 'The user has requested a web search. Include planning for Google Search.' : 'Do NOT plan for web search unless it is explicitly requested by the user or absolutely essential for current macro context.'}`
        });

        const brainPrompt = `Request: Write a ${mode === 'reply' ? 'reply' : 'tweet'} for symbol ${symbol}. ${userNotes ? `User Note: ${userNotes}` : ''}. 
        Plan the data acquisition. DO NOT provide the final draft.`;

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

        if (internalThoughts) {
            reasoningLog.push({ type: 'thought', content: internalThoughts, isRawThinking: true });
        }
        reasoningLog.push({ type: 'thought', content: `PLAN: ${planText}` });

        // --- STAGE 2: THE HAND (Thinking DISABLED, Tools ENABLED) ---
        // We now execute the plan.

        const enabledCustomTools: any[] = this.tools.filter(t =>
            personality.enabled_tools[t.functionDeclarations![0].name] !== false
        );

        let handTools: any[] = [];
        if (userAskedForSearch && personality.enabled_tools.googleSearch !== false) {
            handTools = [{ googleSearch: {} }];
        } else {
            handTools = enabledCustomTools;
        }

        const handModel = ai.getGenerativeModel({
            model: personality.default_model || 'gemini-2.0-flash',
            tools: handTools.length > 0 ? handTools : undefined,
            systemInstruction: systemInstruction
        });

        // Use thinkingBudget: 0 to avoid Tool conflict
        const chat = handModel.startChat({
            history: [],
            generationConfig: {
                // @ts-ignore
                thinkingConfig: {
                    includeThoughts: true,
                    thinkingBudget: 0
                }
            }
        });

        let currentPrompt = `Execute this analysis plan: ${planText}`;
        let finalDraft = '';

        // 3. Agentic Loop (Max 5 iterations to prevent infinite loops)
        for (let i = 0; i < 5; i++) {
            history.push({ role: 'user', parts: [{ text: currentPrompt }] });
            const result = await chat.sendMessage(currentPrompt);
            const response = result.response;
            const content = response.candidates![0].content;
            history.push({ role: 'model', parts: content.parts });

            for (const part of content.parts) {
                if (part.text) {
                    reasoningLog.push({ type: 'thought', content: part.text });
                }
                if ((part as any).thought) {
                    reasoningLog.push({ type: 'thought', content: (part as any).thought, isRawThinking: true });
                }
            }

            const functionCallPart = content.parts.find(p => p.functionCall);

            if (functionCallPart?.functionCall) {
                const { name, args } = functionCallPart.functionCall;
                reasoningLog.push({ type: 'tool_call', name, args });

                const toolResult = await this.callFunction(name, args);
                reasoningLog.push({ type: 'tool_response', name, result: toolResult });

                // Continue loop with tool result
                currentPrompt = JSON.stringify({
                    functionResponse: {
                        name,
                        response: { content: toolResult }
                    }
                });
            } else {
                // Final answer reached
                finalDraft = content.parts.find(p => p.text)?.text || '';
                break;
            }
        }

        return {
            draft: finalDraft,
            reasoningLog,
            trace: {
                systemInstruction,
                model: personality.default_model,
                toolsSentToModel: handTools,
                history
            }
        };
    }

    // Keep the old method for backward compatibility
    static async generateTweetDraft(symbol: string, userNotes: string = ''): Promise<string> {
        const { draft } = await this.generate(symbol, userNotes, 'tweet');
        return draft;
    }
}
