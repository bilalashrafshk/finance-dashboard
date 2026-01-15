import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';


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
): Promise<{ text: string; debugMetadata?: any }> {
    initAI();
    if (!model) return { text: JSON.stringify({ error: 'AI Unavailable' }) };

    // 1. Prepare text prompt
    const textPrompt = `
${systemPrompt}

**CONTEXT DATA:**
${JSON.stringify(context, null, 2)}

**ANNOUNCEMENT:**
Title: ${announcement.title}
Company: ${announcement.company} (${announcement.symbol})
`;

    // 2. Prepare Multimodal Parts (Images/PDFs)
    const parts: any[] = [{ text: textPrompt }];
    const attachedFiles: any[] = [];

    for (const url of announcement.attachments || []) {
        try {
            console.log(`📥 Downloading attachment: ${url}`);
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });

            // Clean content type (remove charset=utf-8 etc)
            let mimeType = response.headers['content-type']?.split(';')[0]?.trim();
            const dataBase64 = Buffer.from(response.data).toString('base64');
            const sizeInMb = (response.data.byteLength / (1024 * 1024)).toFixed(2);

            console.log(`🔍 Mime: ${mimeType}, Size: ${sizeInMb} MB`);

            // Gemini limitations: 
            // - Images: png, jpeg, webp, heic, heif
            // - Documents: application/pdf
            const supportedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];

            if (supportedTypes.includes(mimeType) || mimeType.startsWith('image/')) {
                parts.push({
                    inlineData: {
                        data: dataBase64,
                        mimeType: mimeType === 'image/gif' ? 'image/png' : mimeType
                    }
                });
                attachedFiles.push({ url, mimeType, size: `${sizeInMb} MB` });
                console.log(`✅ Attached ${mimeType} (${sizeInMb} MB) to AI request.`);
            } else {
                console.warn(`⚠️ Unsupported mime type: ${mimeType} for ${url}`);
            }
        } catch (err: any) {
            console.warn(`❌ Failed to download attachment ${url}:`, err.message);
        }
    }

    parts.push({ text: "\nAnalyze the above (including any attached documents/images) and provide the output in the format requested in the system instruction." });

    try {
        const result = await model.generateContent(parts);
        const response = await result.response;
        return {
            text: response.text().trim(),
            debugMetadata: { attachedFiles, textPrompt }
        };
    } catch (error: any) {
        if (error.status === 400 || error.message?.includes('400')) {
            console.error('❌ Gemini 400 Error: Possible payload limit or format issue. Falling back to text-only.');
            const textOnlyResult = await model.generateContent(textPrompt + "\nAnalyze the announcement details provided in text.");
            const resp = await textOnlyResult.response;
            return {
                text: resp.text().trim(),
                debugMetadata: { attachedFiles: [], textPrompt, error: 'Multimodal failed, fell back to text-only' }
            };
        }
        console.error('Error in multimodal analysis:', error);
        return { text: "Analysis failed due to model error." };
    }
}
