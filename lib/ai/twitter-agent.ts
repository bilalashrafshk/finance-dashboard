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
    static async generate(
        symbol: string,
        userNotes: string = '',
        mode: 'tweet' | 'reply' = 'tweet',
        targetTweet: string = ''
    ): Promise<{ draft: string; contextData: any }> {
        const apiKey = process.env.GEMINI_API_KEY || '';
        if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

        // 1. Fetch Brand Personality
        const personality = await PersonalityService.getPersonality('bilal-ashraf');
        if (!personality) throw new Error('Brand personality not found');

        // 2. Fetch App Context (Price, RSI, Earnings, etc.)
        let contextData = null;
        try {
            contextData = await AIContextService.getContext(symbol);
        } catch (e) {
            console.warn(`Context fetch failed for ${symbol}:`, e);
        }

        // 3. Build Prompt
        const systemInstruction = `
            You are drafting a ${mode === 'reply' ? 'reply to a tweet' : 'new tweet'} for Bilal Ashraf. 
            
            BRAND GUIDELINES:
            ${personality.instructions}
            
            EXAMPLES OF HIS STYLE:
            ${personality.examples.map(ex => `- ${ex}`).join('\n')}
            
            CORE RULES:
            - No emojis.
            - No hashtags.
            - No exclamation marks.
            - Short/medium sentences.
            - Calm, analytical, professional analytical tone.
            - Focus on macro, liquidity, and long-term context.
        `;

        const prompt = `
            ${mode === 'reply' ? `TARGET TWEET TO REPLY TO: ${targetTweet}` : ''}
            
            USER'S ADDITIONAL NOTES/CONTEXT: ${userNotes}
            
            APP CONTEXT FOR ${symbol}:
            ${contextData ? JSON.stringify(contextData, null, 2) : 'No specific app data found for this symbol.'}
            
            TASK: 
            Generate a ${mode === 'reply' ? 'reply' : 'tweet'} based on the above that matches Bilal's brand guidelines. 
            ${mode === 'reply' ? 'The reply should be thoughtful, adding value or a specialized perspective based on the data.' : 'The tweet should be a sharp, analytical observation.'}
            Provide only the text. No preamble, no quotes.
        `;

        // 4. Call Gemini
        const ai = initAI(apiKey);
        const model = ai.getGenerativeModel({ model: personality.default_model });

        try {
            const result = await model.generateContent([
                { text: systemInstruction },
                { text: prompt }
            ]);
            const response = await result.response;
            const draft = response.text().trim().replace(/^"|"$/g, '');
            return { draft, contextData };
        } catch (error) {
            console.error('Error in TwitterAgentService:', error);
            throw error;
        }
    }

    // Keep the old method for backward compatibility (e.g. Discord integration)
    static async generateTweetDraft(symbol: string, userNotes: string = ''): Promise<string> {
        const { draft } = await this.generate(symbol, userNotes, 'tweet');
        return draft;
    }
}
