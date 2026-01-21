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
            case 'googleSearch':
                // This is a safety handler for when the model hallucinates a search call in Stage 2.2
                return "NOTE: Google Search is NOT available in this stage. Use the provided [SEARCH GROUNDING CONTEXT] already included in the prompt.";
            default: throw new Error(`Unknown tool: ${name}`);
        }
    }

    private static getAvailableToolsDescription(enabledTools: Record<string, boolean>): string {
        const declaredTools = this.tools[0].functionDeclarations || [];
        const lines = ['Available Tools:'];
        let idx = 1;

        for (const t of declaredTools) {
            if (enabledTools[t.name] !== false) {
                lines.push(`${idx++}. ${t.name}: ${t.description}`);
            }
        }


        if (enabledTools.googleSearch !== false) {
            lines.push(`\nCAPABILITY: Google Search Grounding is available. NOTE: This is a NATIVE capability handled in a separate research turn. It is NOT a callable function for the Hand stage.`);
        }
        return lines.join('\n');
    }

    static async generate(
        symbol: string,
        userNotes: string = '',
        mode: 'tweet' | 'reply' | 'briefing' | 'automated_alert' = 'tweet',
        targetTweet: string = '',
        postFormat: 'short' | 'long' = 'short',
        providedResearch: string = ''
    ): Promise<{
        draft: string;
        reasoningLog: any[];
        trace?: any;
        status?: 'SUCCESS' | 'NEEDS_RESEARCH' | 'ERROR';
        researchQueries?: string[];
    }> {
        const apiKey = process.env.GEMINI_API_KEY || '';
        if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

        // Current Date Injection
        const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // 1. Fetch Brand Personality
        const personality = await PersonalityService.getPersonality('bilal-ashraf');
        if (!personality) throw new Error('Brand personality not found');

        // --- MODE CONFIG RESOLUTION ---
        let configCoordinator = personality.coordinator_instructions;
        let configDrafter = personality.instructions;
        let configHumanizer = personality.humanizer_instructions;
        let configTools = personality.enabled_tools;

        if (mode === 'reply') {
            configCoordinator = personality.reply_coordinator_prompt || configCoordinator;
            configDrafter = personality.reply_drafter_prompt || configDrafter;
            configHumanizer = personality.reply_humanizer_prompt || configHumanizer;
            configTools = personality.reply_tools || configTools;
        } else if (mode === 'briefing') {
            configCoordinator = personality.briefing_coordinator_prompt || configCoordinator;
            configDrafter = personality.briefing_instructions || configDrafter;
            configHumanizer = personality.briefing_humanizer_prompt || '';
            configTools = personality.briefing_tools || configTools;
        } else if (mode === 'automated_alert') {
            // SPECIAL MODE: Automated Alert (High-Velocity / Technical)
            // We overrides prompts here directly or could add them to personality DB later.
            configCoordinator = `You are a high-signal automated trading bot for Bilal Ashraf. 
            Goal: Confirm the technical breakout data (Price, ATH, etc) and prepare a punchy, factual tweet.
            Do not over-analyze. Focus on the numbers provided in the 'userNotes'.`;

            configDrafter = `You are writing an automated technical alert tweet.
            Style: Factual, Punchy, Authoritative.
            Tone: High-Energy but Professional.
            Structure:
            1. Headline (e.g. 🚀 NEW ATH ALERT: $SYMBOL)
            2. The Data (Current Price, Breakout Level)
            3. Context (Why it matters, e.g. "Price Discovery Mode")
            4. Hashtags (#PSX #KSE100 #$SYMBOL)
            
            Constraint: Under 280 characters.
            NEVER apologize. NEVER say "Here is a draft". Just output the tweet text.`;

            configHumanizer = ''; // Skip humanizer for speed/directness in auto-mode
            configTools = { ...personality.tweet_tools, googleSearch: false }; // Disable search for speed
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

        // Filter examples based on format and mode (Tweet/Reply/Briefing + Short/Long)
        const relevantExamples = personality.examples
            .filter(ex => {
                const exMode = ex.mode || 'tweet';
                if (exMode !== mode) return false;
                return ex.type === postFormat;
            })
            .map(ex => ex.text);


        // Heuristic: Only use Google Search if the user explicitly asks for it in their notes
        const notesLower = userNotes.toLowerCase();
        const userAskedForSearch = notesLower.includes('search') || notesLower.includes('google') || notesLower.includes('latest news') || notesLower.includes('find on web');

        // Stage 2 Instructions: Focus on Factual Assembly and Structural Logic
        let stage2SystemDoc = configDrafter || '';

        // Append Runtime Context (Standardized)
        stage2SystemDoc += `
        
        INPUT CONTEXT:
        Current Date: ${currentDate}
        User Note: ${userNotes}
        Symbol: ${symbol}
        Mode: ${mode}
        ${targetTweet ? `TARGET TWEET: ${targetTweet}` : ''}
        Desired Format: ${postFormat}
        
        [STYLING INSTRUCTIONS] 
        - Target: ${mode === 'briefing' ? 'Structured news briefing with headers' : 'Engaging social media post'}
        - Length: ${postFormat === 'short' ? 'STRICTLY UNDER 280 characters' : 'Detailed/Long-form'}
        ${mode === 'reply' ? '- Context: This is a REPLY to a specific user. Maintain conversation flow.' : ''}
        ${mode === 'briefing' ? '- Note: Use factual, informative headers like ### The Intelligence Scoop' : ''}
        - PROHIBITION: DO NOT mention "Google Search", "context", or "data provided". Report findings as your own.
        `;

        // --- STAGE 1: THE BRAIN (Thinking ENABLED, Tools DISABLED) ---
        // This stage captures the AI's internal reasoning and data plan.
        const defaultCoordinatorPrompt = `You are the COORDINATOR of an investment agent. 
        Current Date: ${currentDate}
        Analyze the user's input and current context carefully. 
        Determine if existing info is sufficient or if tools are needed. 
        DO NOT write the final tweet/reply yet.`;

        const toolListCtx = this.getAvailableToolsDescription(configTools);

        const brainModel = ai.getGenerativeModel({
            model: personality.brain_model || personality.default_model || 'gemini-2.0-flash',
            systemInstruction: `
                ${configCoordinator || defaultCoordinatorPrompt}

                ${toolListCtx}
                
                ${userAskedForSearch ? 'The user has requested a web search. Include planning for "WEB_SEARCH_NEEDED".' : ''}
            `
        });

        const brainPrompt = `Request: Write a ${mode === 'reply' ? 'reply' : 'tweet'} for symbol ${symbol}. ${userNotes ? `User Note: ${userNotes}` : ''}. 
        Current Date: ${currentDate}
        ${symbol.toUpperCase() === 'N/A' ? 'This is a MACRO/GENERAL request. PRIORITIZE using "getMarketSummary" to check the overall market or relevant sectors. Do not force a single stock symbol.' : ''}
        
        ${mode === 'reply' && targetTweet ? `TARGET TWEET TO REPLY TO:
        ---
        ${targetTweet}
        ---
        ` : ''}

        TASK:
        1. DATA EXTRACTION:
           - Extract claims from the TARGET TWEET (if any) into a "TARGET CLAIMS" list.
           - Extract claims/facts from the USER NOTE into a "USER FACTS" list.
           - Compare them. If they conflict, note the conflict.
        2. VERIFY vs HALLUCINATION: If the User Note contains specific figures (e.g. "P/E of 7.64"), you MUST use them as your signal.
        3. DATA PLAN: Determine if tools are needed. 
           - If user asks about a SECTOR (e.g. "Cement"), plan to use 'getMarketSummary' with 'filter_sector'.
           - If user asks about TIME (e.g. "Year to Date", "last 3 years"), plan to use 'getMarketSummary' with 'timeframe'.
           - If user asks about the MARKET/INDEX, plan to use 'getMarketSummary'.
           - [CRITICAL] PSYCHOLOGY FILTER: If the User Note or Target Tweet is strictly about PSYCHOLOGY, PRINCIPLES, or PHILOSOPHY (e.g. "patience", "disagreement", "buying stocks is hard") and does NOT explicitly ask for market data -> DO NOT CALL 'getMarketSummary'. Select "No tools needed".
           - PROACTIVE TOOL USE: Review the 'Available Tools' list. If a valid stock symbol is present, you are ENCOURAGED to use relevant tools (Earnings, Dividends, Price History) to verify claims or enrich content, even if not explicitly requested.
           - If the User Note is already fact-rich, prioritize those facts. If search is needed, make it entity-specific.
           - If user asks about latest NEWS or "Search for X" and it is NOT in the user note, you MUST request "WEB_SEARCH_NEEDED".
        
        TARGET FORMAT: ${mode === 'briefing' ? 'Structured News Briefing' : 'Social Media Post'} (${postFormat === 'short' ? 'STRICTLY UNDER 280 characters' : 'Long Post / Thread'})
        
        OUTPUT FORMAT:
        - DATA EXTRACTION:
          - TARGET CLAIMS: [List claims from the tweet we are replying to]
          - USER FACTS: [List numbers/facts provided by the user]
        - DATA PLAN: [Tool plan or "No tools needed, user context is sufficient"]
        - SEARCH_NEEDED: [YES/NO] - Do you strictly require external web search for recent news?
        - SEARCH_QUERIES: [List 3 specific google queries if YES] - *IMPORTANT: Include Month/Year (${currentDate}) to avoid stale results.*
        
        DO NOT provide the final draft. Provide only the Extraction and Data Plan.`;

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

        // --- HITL CHECK ---
        // Does the brain want search?
        const brainRequestsSearch = planText.includes("SEARCH_NEEDED: YES") || planText.includes("WEB_SEARCH_NEEDED");
        const needsResearch = (userAskedForSearch || brainRequestsSearch);

        // If Research IS needed AND it is NOT provided yet -> Halt and Ask User
        if (needsResearch && !providedResearch && configTools.googleSearch !== false) {
            // Extract recommended queries from plan
            const queriesMatch = planText.match(/SEARCH_QUERIES:([\s\S]*?)$/i);
            const rawQueries = queriesMatch ? queriesMatch[1].trim() : '';
            const queries = rawQueries.split('\n').map(q => q.replace(/^- /, '').trim()).filter(q => q.length > 0);

            // Fallback queries if parsing fails
            const finalQueries = queries.length > 0 ? queries : [`${symbol} stock news`, `${symbol} limited recent announcements`];

            return {
                draft: '',
                reasoningLog,
                status: 'NEEDS_RESEARCH',
                researchQueries: finalQueries
            };
        }

        // --- STAGE 2: THE HAND (Thinking DISABLED, Tools ENABLED) ---
        // We now execute the plan.

        const enabledCustomTools: any[] = this.tools.filter(t =>
            configTools[t.functionDeclarations![0].name] !== false
        );

        // Research Injection (if provided)
        let researchContext = providedResearch || '';

        if (researchContext) {
            reasoningLog.push({ type: 'thought', content: `Using Provided Research Context: ${researchContext.substring(0, 100)}...` });
        }

        // NATIVE GOOGLE SEARCH REMOVED to save cost. 
        // We rely on providedResearch (HITL) or just proceed if none.

        // --- STAGE 2.2: THE DATA HAND (Custom Tools only) ---
        const handTools: any[] = [...enabledCustomTools];

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

        let currentPrompt = `Execute this analysis plan: ${planText}\n\n`;
        if (researchContext) {
            currentPrompt += `\n\n[USER PROVIDED RESEARCH / NEWS context]\n${researchContext}\n\n[AUTHORITY INSTRUCTION]\nThe above '[USER PROVIDED RESEARCH]' is a powerful data source, but YOU are the judge.
            Current Date: ${currentDate}
            
            CONFLICT RESOLUTION RULES:
            1. CHECK DATES: Compare the date of the [USER PROVIDED RESEARCH] vs the [USER NOTE] (if implicit) vs the Current Date.
            2. STALE RESEARCH SQUASHING: 
               - If the Research is > 6 months old (e.g. from 2024 when now is 2026) AND the User Note contains specific, fresh claims (e.g. "Gold hit 4000"), **TRUST THE USER NOTE**.
               - Assume the user has "breaking news" that the old research missed.
            3. "FORECAST != FACT" FILTER:
               - If a research snippet says "forecast", "predicted", "projected", "seen rising to", or "outlook", DO NOT treat that number as the *current* price. It is a guess.
               - ONLY use numbers labeled as "is currently", "trading at", "hit", or "reached" as current facts.
               - NOTE: You MAY cite forecasts as *future predictions* (e.g. "Analysts see Gold hitting $3000 next year"), just don't confuse them with today's price.
            4. DEBUNKING: If the [TARGET CLAIMS] (from Stage 1) conflict with your best data (User Note OR Research), explicitly DEBUNK them. (e.g. "Actually, data shows X, not Y").
            5. ANTI-ECHO FILTER (CRITICAL):
               - If Research CONFIRMS the [TARGET CLAIMS] (e.g. they said "Inflation 5.6%" and research says "5.6%"), DO NOT repeat the number in your output.
               - Instead, say something like "Data confirms your point on inflation" or "Agreed on the 5.6% figure".
               - NEVER present the Target Tweet's own stats as if they are a new discovery.
            6. If dates are similar, treat Research as ground truth.
            
            Refine the draft using the fresher signal.`;
        }

        // HEATMAP CONTEXT INJECTION (If enabled in settings)
        // HEATMAP CONTEXT INJECTION DISABLED (User Request - 2026-01-21)
        // We now force the AI to explicitly call 'getMarketSummary' if it needs this data.
        /*
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
        */

        let finalDraft = '';
        let currentInput: string | any = currentPrompt;

        // 3. Agentic Loop (Max 5 iterations to prevent infinite loops)
        for (let i = 0; i < 5; i++) {
            const result = await chat.sendMessage(currentInput);
            const response = result.response;

            if (!response.candidates || response.candidates.length === 0) {
                reasoningLog.push({ type: 'thought', content: "Error: No response candidates received from AI." });
                break;
            }

            const candidate = response.candidates[0];
            if (candidate.finishReason === 'SAFETY') {
                reasoningLog.push({ type: 'thought', content: "Error: Safety filter blocked the AI response." });
                finalDraft = "Conflict: The AI response was filtered due to safety constraints. Rephrase the request if this persists.";
                break;
            }

            const content = candidate.content;
            if (!content || !content.parts) {
                break;
            }

            // Log for tracing
            history.push({ role: 'model', parts: content.parts });

            for (const part of content.parts) {
                if (part.text) {
                    reasoningLog.push({ type: 'thought', content: part.text });
                }
                if ((part as any).thought) {
                    reasoningLog.push({ type: 'thought', content: (part as any).thought, isRawThinking: true });
                }
            }

            const functionCallParts = content.parts.filter(Part => Part.functionCall);

            if (functionCallParts.length > 0) {
                // Execute ALL tools in parallel
                const functionResponses = await Promise.all(functionCallParts.map(async (part) => {
                    const { name, args } = part.functionCall!;
                    reasoningLog.push({ type: 'tool_call', name, args });

                    try {
                        const toolResult = await this.callFunction(name, args);
                        reasoningLog.push({ type: 'tool_response', name, result: toolResult });

                        return {
                            functionResponse: {
                                name,
                                response: { content: toolResult }
                            }
                        };
                    } catch (error: any) {
                        const errorMsg = `Error: ${error.message}`;
                        reasoningLog.push({ type: 'tool_response', name, result: errorMsg, isError: true });
                        return {
                            functionResponse: {
                                name,
                                response: { content: errorMsg }
                            }
                        };
                    }
                }));

                // Continue loop with ALL responses
                currentInput = functionResponses;
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
                
                BILAL'S BRAND EXAMPLES (${mode}, ${postFormat}):
                ${relevantExamples.length > 0 ? relevantExamples.join('\n---\n') : 'No specific examples provided. Follow general style rules.'}
                
                HUMANIZATION RULES:
                - Use the "I" rule for opinions/feelings.
                - Avoid "robot words" (notable, crucial, delve, etc).
                - Keep the facts from the draft, but change the "voice".
                - ${postFormat === 'short' ? 'STRICT CONSTRAINT: The final output MUST be under 280 characters.' : 'This is a Long Post/Thread format.'}
                - Follow the precise instructions provided in the prompt.
                - DATA PRESERVATION: You are an Editor, not a Summarizer. 
                - DO NOT REMOVE details like specific timestamps (e.g. "30 mins ago"), specific amounts (e.g. "$475m"), or key context (e.g. "M-6 Motorway"). 
                - Your job is to improve the FLOW and TONE, not to delete information. Keep the tweet rich and dense.
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
            },
            status: 'SUCCESS'
        };
    }

    // Keep the old method for backward compatibility
    static async generateTweetDraft(symbol: string, userNotes: string = ''): Promise<string> {
        const { draft } = await this.generate(symbol, userNotes, 'tweet');
        return draft;
    }
}
