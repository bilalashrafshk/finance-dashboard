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
        targetTweet: string = ''
    ): Promise<{ draft: string; reasoningLog: any[] }> {
        const apiKey = process.env.GEMINI_API_KEY || '';
        if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

        // 1. Fetch Brand Personality
        const personality = await PersonalityService.getPersonality('bilal-ashraf');
        if (!personality) throw new Error('Brand personality not found');

        const ai = initAI(apiKey);
        const model = ai.getGenerativeModel({
            model: personality.default_model || 'gemini-2.0-flash',
            tools: this.tools as any
        });

        // 2. Start Agentic Chat
        const chat = model.startChat({
            history: [],
        });

        const systemInstruction = `
            You are drafting a ${mode === 'reply' ? 'reply to a tweet' : 'new tweet'} for Bilal Ashraf. 
            
            BRAND GUIDELINES:
            ${personality.instructions}
            
            CORE RULES:
            - No emojis, no hashtags, no exclamation marks.
            - Professional, calm, macro-focused analytical tone.
            - Pick 1-2 key data points. Do NOT dump all data.
            
            YOUR CAPABILITIES:
            - You have tools to fetch real-time database data for ANY symbol.
            - ALWAYS state your internal thought process before calling a tool or drafting.
        `;

        const userPrompt = `
            ASSET: ${symbol}
            CONTEXT/NOTES: ${userNotes}
            ${mode === 'reply' ? `REPLYING TO: ${targetTweet}` : ''}
            
            TASK: 
            1. Use tools to find the most significant data points for ${symbol}.
            2. Be selective. Choose figures that support a sharp, macro-style observation.
            3. Final output must be ONLY the tweet text.
        `;

        const reasoningLog: any[] = [];
        let currentPrompt = `${systemInstruction}\n\n${userPrompt}`;
        let responseDraft = '';

        // 3. Agentic Loop (Max 5 iterations to prevent infinite loops)
        for (let i = 0; i < 5; i++) {
            const result = await chat.sendMessage(currentPrompt);
            const response = result.response;
            const content = response.candidates![0].content;

            // Extract thoughts and text from all parts
            for (const part of content.parts) {
                if (part.text) {
                    reasoningLog.push({ type: 'thought', content: part.text });
                }
                if ((part as any).thought) {
                    reasoningLog.push({ type: 'thought', content: (part as any).thought, isRawThinking: true });
                }
            }

            const functionCalls = content.parts.find(p => p.functionCall);

            if (functionCalls?.functionCall) {
                const { name, args } = functionCalls.functionCall;
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
                // No more tools needed, we have the final answer
                responseDraft = content.parts[0].text || '';
                break;
            }
        }

        return {
            draft: responseDraft.trim().replace(/^"|"$/g, ''),
            reasoningLog
        };
    }

    // Keep the old method for backward compatibility
    static async generateTweetDraft(symbol: string, userNotes: string = ''): Promise<string> {
        const { draft } = await this.generate(symbol, userNotes, 'tweet');
        return draft;
    }
}
