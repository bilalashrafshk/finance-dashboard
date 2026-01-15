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
    const result = await generateAISynthesis(prompt);
    return result.split('\n')[0].trim();
}

/**
 * General purpose AI synthesis
 */
export async function generateAISynthesis(prompt: string): Promise<string> {
    initAI();

    if (!model) {
        console.warn('AI model not initialized. Returning fallback.');
        return 'Market Event Detected (AI Unavailable)';
    }

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim();
    } catch (error) {
        console.error('Error generating AI synthesis:', error);
        return 'Market Event Detected';
    }
}

/**
 * Specifically for analyzing PSX Announcements with context
 */
export async function analyzeAnnouncement(
    systemPrompt: string,
    context: any,
    announcement: any
): Promise<string> {
    initAI();
    if (!model) return JSON.stringify({ error: 'AI Unavailable' });

    const fullPrompt = `
${systemPrompt}

**CONTEXT DATA:**
${JSON.stringify(context, null, 2)}

**ANNOUNCEMENT:**
Title: ${announcement.title}
Company: ${announcement.company} (${announcement.symbol})
Attachments: ${announcement.attachments.join(', ')}

Analyze the above and provide the output in the format requested in the system instruction.
`;

    return generateAISynthesis(fullPrompt);
}
