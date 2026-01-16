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
    ): Promise<{ draft: string; reasoningLog: any[]; trace?: any }> {
        const apiKey = process.env.GEMINI_API_KEY || '';
        if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

        // 1. Fetch Brand Personality
        const personality = await PersonalityService.getPersonality('bilal-ashraf');
        if (!personality) throw new Error('Brand personality not found');

        // 2. Filter Tools based on settings
        const enabledTools: any[] = this.tools.filter(t =>
            personality.enabled_tools[t.functionDeclarations![0].name] !== false
        );

        // Add Google Search Grounding if enabled
        if (personality.enabled_tools.googleSearch !== false) {
            enabledTools.push({
                googleSearchRetrieval: {
                    dynamicRetrievalConfig: {
                        mode: "DYNAMIC",
                        dynamicThreshold: 0.3,
                    },
                },
            });
        }

        const ai = initAI(apiKey);
        const systemInstruction = `
            ${personality.instructions}
            
            Current Mode: ${mode === 'reply' ? 'Reply to existing tweet' : 'New Tweet'}
            Target Tweet (if reply): ${targetTweet || 'N/A'}
            
            Brand Examples:
            ${personality.examples.join('\n---\n')}
        `;

        const model = ai.getGenerativeModel({
            model: personality.default_model || 'gemini-2.0-flash',
            tools: enabledTools.length > 0 ? enabledTools : undefined,
            systemInstruction
        });

        // 2. Start Agentic Chat
        const chat = model.startChat({
            history: [],
        });

        const reasoningLog: any[] = [];
        let currentPrompt = `Write a ${mode === 'reply' ? 'reply' : 'tweet'} for symbol ${symbol}. ${userNotes ? `User Note: ${userNotes}` : ''}. Start your thought process by identifying what data you need.`;
        const history: any[] = [];

        // 3. Agentic Loop (Max 5 iterations to prevent infinite loops)
        for (let i = 0; i < 5; i++) {
            history.push({ role: 'user', parts: [{ text: currentPrompt }] });
            const result = await chat.sendMessage(currentPrompt);
            const response = result.response;
            const content = response.candidates![0].content;
            history.push({ role: 'model', parts: content.parts });

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
                // Final answer reached
                const draft = content.parts.find(p => p.text)?.text || '';
                return {
                    draft,
                    reasoningLog,
                    trace: {
                        systemInstruction,
                        model: personality.default_model,
                        toolsSentToModel: enabledTools,
                        history
                    }
                };
            }
        }

        // If loop finishes without a final answer
        return {
            draft: '',
            reasoningLog,
            trace: {
                systemInstruction,
                model: personality.default_model,
                toolsSentToModel: enabledTools,
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
