import { GoogleGenerativeAI } from '@google/generative-ai';


let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

function initAI() {
    const API_KEY = process.env.GEMINI_API_KEY || '';
    if (API_KEY && !genAI) {
        genAI = new GoogleGenerativeAI(API_KEY);
        model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite' });
    }
}


/**
 * Generate a headline for a market event
 * @param prompt - The full prompt containing event details
 * @returns The generated headline
 */
export async function generateHeadline(prompt: string): Promise<string> {
    initAI();

    if (!model) {
        console.warn('AI model not initialized. Returning fallback.');
        return 'Market Event Detected (AI Unavailable)';
    }


    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        return text.trim();
    } catch (error) {
        console.error('Error generating headline:', error);
        return 'Market Event Detected';
    }
}
