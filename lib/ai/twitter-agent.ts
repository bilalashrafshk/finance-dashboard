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
                },
                {
                    name: 'getMarketSummary',
                    description: 'Fetch daily market index (KSE-100) status and top movers heatmap. Supports filtering.',
                    parameters: {
                        type: 'object',
                        properties: {
                            date: { type: 'string', description: 'Date in YYYY-MM-DD format (optional)' },
                            detailed: { type: 'boolean', description: 'Set to true for full market report (all sectors).' },
                            filter_sector: { type: 'string', description: 'Filter by sector name (e.g., "Cement"). Returns detailed sector data.' },
                            filter_symbols: { type: 'string', description: 'Filter by stock symbols (comma separated, e.g. "LUCK, DGKC").' },
                            timeframe: { type: 'string', description: 'Timeframe for change calculation: "1D", "1W", "1M", "YTD", or custom like "3Y", "6M". Defaults to "1D".' }
                        },
                        required: []
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
            case 'getMarketSummary': return await AIContextService.getMarketSummary(args.date, args.detailed, args.filter_sector, args.filter_symbols, args.timeframe);
            default: throw new Error(`Unknown tool: ${name}`);
        }
    }

    static async generate(
        symbol: string,
        userNotes: string = '',
        mode: 'tweet' | 'reply' = 'tweet',
        targetTweet: string = '',
        postFormat: 'short' | 'long' | 'briefing' = 'short'
    ): Promise<{ draft: string; reasoningLog: any[]; trace?: any }> {
        const apiKey = process.env.GEMINI_API_KEY || '';
        if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

        // 1. Fetch Brand Personality
        const personality = await PersonalityService.getPersonality('bilal-ashraf');
        if (!personality) throw new Error('Brand personality not found');

        // --- MODE CONFIG RESOLUTION ---
        let configCoordinator = personality.coordinator_instructions;
        let configDrafter = personality.instructions;
        let configHumanizer = personality.humanizer_instructions;
        let configTools = personality.enabled_tools;

        if (postFormat === 'briefing') {
            configCoordinator = personality.briefing_coordinator_prompt || configCoordinator;
            configDrafter = personality.briefing_instructions || configDrafter;
            configHumanizer = personality.briefing_humanizer_prompt || ''; // Briefing often skips humanizer
            configTools = personality.briefing_tools || configTools;
        } else if (mode === 'reply') {
            configCoordinator = personality.reply_coordinator_prompt || configCoordinator;
            configDrafter = personality.reply_drafter_prompt || configDrafter;
            configHumanizer = personality.reply_humanizer_prompt || configHumanizer;
            configTools = personality.reply_tools || configTools;
        } else {
            // New Tweet / Broadcast
            configCoordinator = personality.tweet_coordinator_prompt || configCoordinator;
            configDrafter = personality.tweet_drafter_prompt || configDrafter;
            configHumanizer = personality.tweet_humanizer_prompt || configHumanizer;
            configTools = personality.tweet_tools || configTools;
        }

        const ai = initAI(apiKey);
        const reasoningLog: any[] = [];
        const history: any[] = [];

        // Filter examples based on format (fallback to short if briefing has no examples)
        const relevantExamples = personality.examples
            .filter(ex => ex.type === (postFormat === 'briefing' ? 'long' : postFormat))
            .map(ex => ex.text);

        // Heuristic: Only use Google Search if the user explicitly asks for it in their notes
        const notesLower = userNotes.toLowerCase();
        const userAskedForSearch = notesLower.includes('search') || notesLower.includes('google') || notesLower.includes('latest news') || notesLower.includes('find on web');

        // Stage 2 Instructions: Focus on Factual Assembly and Structural Logic
        let stage2SystemDoc = configDrafter || '';

        // Append Runtime Context (Standardized)
        stage2SystemDoc += `
        
        INPUT CONTEXT:
        User Note: ${userNotes}
        Symbol: ${symbol}
        Mode: ${mode === 'reply' ? 'REPLY' : 'BROADCAST'}
        ${targetTweet ? `TARGET TWEET: ${targetTweet}` : ''}
        Desired Format: ${postFormat}
        `;

        // --- STAGE 1: THE BRAIN (Thinking ENABLED, Tools DISABLED) ---
        // This stage captures the AI's internal reasoning and data plan.
        const defaultCoordinatorPrompt = `You are the COORDINATOR of an investment agent. 
        Analyze the user's input and current context carefully. 
        Determine if existing info is sufficient or if tools are needed. 
        DO NOT write the final tweet/reply yet.`;

        const brainModel = ai.getGenerativeModel({
            model: personality.brain_model || personality.default_model || 'gemini-2.0-flash',
            systemInstruction: `
                ${configCoordinator || defaultCoordinatorPrompt}
                
                ${userAskedForSearch ? 'The user has requested a web search. Include planning for Google Search.' : 'Do NOT plan for web search unless it is explicitly requested by the user or absolutely essential for current macro context.'}
            `
        });

        const brainPrompt = `Request: Write a ${mode === 'reply' ? 'reply' : 'tweet'} for symbol ${symbol}. ${userNotes ? `User Note: ${userNotes}` : ''}. 
        ${symbol.toUpperCase() === 'N/A' ? 'This is a MACRO/GENERAL request. PRIORITIZE using "getMarketSummary" to check the overall market or relevant sectors. Do not force a single stock symbol.' : ''}
        
        ${mode === 'reply' && targetTweet ? `TARGET TWEET TO REPLY TO:
        ---
        ${targetTweet}
        ---
        ` : ''}

        TASK:
        1. EXTRACT ALL QUANTITATIVE DATA: List every number, price, P/E ratio, percentage, and date mentioned in the User Note and Target Tweet.
        2. VERIFY vs HALLUCINATION: If the User Note contains specific figures (e.g. "P/E of 7.64"), you MUST use them. Never invent or "estimate" figures like "3.5x" if they are not present.
        3. DATA PLAN: Determine if tools are needed. 
           - If user asks about a SECTOR (e.g. "Cement"), plan to use 'getMarketSummary' with 'filter_sector'.
           - If user asks about TIME (e.g. "Year to Date", "last 3 years"), plan to use 'getMarketSummary' with 'timeframe'.
           - If user asks about the MARKET/INDEX, plan to use 'getMarketSummary'.
           - If the User Note is already fact-rich, prioritize those facts. If search is needed, make it entity-specific.
        
        TARGET FORMAT: ${postFormat === 'short' ? 'Standard Tweet (STRICTLY UNDER 280 characters)' : postFormat === 'briefing' ? 'Structured News Briefing' : 'Long Post / Thread'}
        
        OUTPUT FORMAT:
        - FACT SHEET: [List extracted numbers here]
        - DATA PLAN: [Tool plan or "No tools needed, user context is sufficient"]
        
        DO NOT provide the final draft. Provide only the Fact Sheet and Data Plan.`;

        // @ts-ignore
        const brainResult = await brainModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: brainPrompt }] }],
            generationConfig: {
                // @ts-ignore
                ...((personality.brain_model || personality.default_model)?.includes('thinking') ? {
                    thinkingConfig: {
                        includeThoughts: true,
                        thinkingBudget: 1024
                    }
                } : {})
            } as any
        });

        const brainParts = (brainResult.response.candidates?.[0]?.content?.parts || []) as any[];
        const internalThoughts = brainParts.find((p: any) => p.thought)?.thought;
        const planText = brainResult.response.text();
        const planLower = planText.toLowerCase();

        if (internalThoughts) {
            reasoningLog.push({ type: 'thought', content: internalThoughts, isRawThinking: true });
        }
        reasoningLog.push({ type: 'thought', content: `PLAN: ${planText}` });

        // --- STAGE 2: THE HAND (Thinking DISABLED, Tools ENABLED) ---
        // We now execute the plan.

        const enabledCustomTools: any[] = this.tools.filter(t =>
            configTools[t.functionDeclarations![0].name] !== false
        );

        // Enable Google Search if user asked OR if Brain planned it
        const planMentionsSearch = planLower.includes('google search') || planLower.includes('web search') || planLower.includes('search the web');
        const shouldEnableSearch = (userAskedForSearch || planMentionsSearch) && configTools.googleSearch !== false;

        let handTools: any[] = [];
        const is25Flash = personality.default_model?.includes('2.5-flash');

        if (shouldEnableSearch) {
            // Priority 1: Google Search
            handTools = [{ googleSearch: {} }];
            // Note: On gemini-2.5-flash, mixing googleSearch with functionDeclarations is currently unsupported.
            // If it's NOT 2.5-flash, we can potentially merge them, but for reliability we prioritize the search
            // as per the "Search-First" directive.
            if (!is25Flash) {
                // For 2.0 or other models, we could theoretically add custom tools here:
                // handTools.push(...enabledCustomTools);
                // But for now, to follow the "Search-First" directive strictly and stay safe, 
                // we keep it search-only if search is requested.
            }
        } else {
            // Priority 2: Custom Tools
            handTools = enabledCustomTools;
        }

        const handModel = ai.getGenerativeModel({
            model: personality.hand_model || personality.default_model || 'gemini-2.0-flash',
            tools: handTools.length > 0 ? handTools : undefined,
            systemInstruction: stage2SystemDoc
        });

        // Use thinkingBudget: 0 to avoid Tool conflict
        const chat = handModel.startChat({
            history: [],
            generationConfig: {
                // @ts-ignore
                ...((personality.hand_model || personality.default_model)?.includes('thinking') ? {
                    thinkingConfig: {
                        includeThoughts: true,
                        thinkingBudget: 0
                    }
                } : {})
            } as any
        });

        let currentPrompt = `Execute this analysis plan: ${planText}`;

        // HEATMAP CONTEXT INJECTION (If enabled in settings)
        try {
            const pool = (await import('@/lib/db')).getPool();
            const configRes = await pool.query("SELECT value FROM alert_configs WHERE key = 'include_heatmap_context'");
            const heatmapEnabled = configRes.rows.length > 0 && configRes.rows[0].value === 'true';

            if (heatmapEnabled) {
                // Fetch Heatmap Data (Top 100/All based on default service behavior, or specific?)
                // We'll ask for 'detailed=false' to keep it concise, just context.
                const marketData = await AIContextService.getMarketSummary(undefined, false);
                currentPrompt += `\n\n[SYSTEM INJECTED CONTEXT - MARKET HEATMAP]\n${JSON.stringify(marketData, null, 2)}`;
                reasoningLog.push({ type: 'thought', content: "System: Injected Market Heatmap Context (Settings Enabled)" });
            }
        } catch (err) {
            console.error('Failed to inject heatmap context:', err);
        }

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

            const functionCallPart = content.parts.find(Part => Part.functionCall);

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
                finalDraft = content.parts.find(Part => Part.text)?.text || '';
                break;
            }
        }

        // --- STAGE 3: THE HUMANIZER (Final Refinement) ---
        // This stage applies precise stylistic rules (lowercase, imperfect grammar, etc).
        // Runs if configHumanizer is present (Briefing defaults to empty, but can be enabled).
        if (finalDraft && configHumanizer) {
            let humanizerPrompt = configHumanizer
                .replace('{{tweet}}', finalDraft)
                .replace('{{mode}}', mode === 'reply' ? 'REPLY' : 'BROADCAST')
                .replace('{{target_tweet}}', targetTweet || 'N/A');

            const humanizerSystemInstruction = `
                You are a professional humanizer/editor for Bilal Ashraf, a calm, analytical investor.
                Your goal is to take a "Technical Draft" and refine it into Bilal's signature voice.
                
                BILAL'S BRAND EXAMPLES (${postFormat}):
                ${relevantExamples.length > 0 ? relevantExamples.join('\n---\n') : 'No specific examples provided. Follow general style rules.'}
                
                HUMANIZATION RULES:
                - Use the "I" rule for opinions/feelings.
                - Avoid "robot words" (notable, crucial, delve, etc).
                - Keep the facts from the draft, but change the "voice".
                - ${postFormat === 'short' ? 'STRICT CONSTRAINT: The final output MUST be under 280 characters.' : 'This is a Long Post/Thread format.'}
                - Follow the precise instructions provided in the prompt.
                - DO NOT ALTER NUMBERS: You must preserve every specific number, percentage, or price mentioned in the Technical Draft. Do not round them or change them for "style".
            `;

            const humanizerModel = ai.getGenerativeModel({
                model: personality.humanizer_model || personality.default_model || 'gemini-2.0-flash',
                systemInstruction: humanizerSystemInstruction
            });

            reasoningLog.push({ type: 'thought', content: "--- STAGE 3: HUMANIZING ---" });
            const humanRes = await humanizerModel.generateContent({
                contents: [{ role: 'user', parts: [{ text: humanizerPrompt }] }],
                generationConfig: {
                    // @ts-ignore
                    ...((personality.humanizer_model || personality.default_model)?.includes('thinking') ? {
                        thinkingConfig: {
                            includeThoughts: true,
                            thinkingBudget: 1024
                        }
                    } : {})
                } as any
            });
            const humanText = humanRes.response.text();

            if (humanText) {
                reasoningLog.push({ type: 'thought', content: `REFINED DRAFT: ${humanText}` });
                finalDraft = humanText;
            }
        }

        return {
            draft: finalDraft,
            reasoningLog,
            trace: {
                systemInstruction: stage2SystemDoc,
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
