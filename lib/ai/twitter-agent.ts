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
    static async generateTweetDraft(symbol: string, userNotes: string = ''): Promise<string> {
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
            // Continue without context if symbol not found
        }

        // 3. Build Prompt
        const systemInstruction = `
            You are drafting a tweet for Bilal Ashraf. 
            
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
            INPUT TOPIC/DATA: ${userNotes}
            
            APP CONTEXT FOR ${symbol}:
            ${contextData ? JSON.stringify(contextData, null, 2) : 'No specific app data found for this symbol.'}
            
            TASK: 
            Generate a tweet based on the input and app context that matches the brand guidelines. 
            Provide only the tweet text. No preamble, no quotes.
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
            return response.text().trim().replace(/^"|"$/g, ''); // Remove wrapping quotes if AI adds them
        } catch (error) {
            console.error('Error generating tweet draft:', error);
            throw error;
        }
    }
}
