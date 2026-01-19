import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';


import { PersonalityService } from './ai/personality-service';

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

async function initAI() {
    const API_KEY = process.env.GEMINI_API_KEY || '';
    if (API_KEY && !genAI) {
        genAI = new GoogleGenerativeAI(API_KEY);

        let modelName = process.env.GEMINI_MODEL;
        if (!modelName) {
            const personality = await PersonalityService.getPersonality('bilal-ashraf');
            modelName = personality?.default_model || 'gemini-2.0-flash';
        }

        console.log(`🤖 Initializing AI with model: ${modelName}`);
        model = genAI.getGenerativeModel({ model: modelName });
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
    await initAI();

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
    await initAI();
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

    parts.push({ text: "\nOutput strictly in the specified JSON format. Zero conversational padding. No meta-commentary." });

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

/**
 * Real-time triage to determine if an announcement title is significant.
 * Gemini handles this semantic check in <1s.
 */
export async function triageAnnouncement(title: string): Promise<boolean> {
    await initAI();
    if (!model) return false;

    const prompt = `
Analyze the following PSX announcement title and decide if it is operationally or financially significant for a stock investor. 

SIGNIFICANT (RETURN "YES"):
- Discoveries (oil, gas, minerals)
- Production updates or start of operations
- Joint Ventures or Strategic Partnerships
- Material Information or Legal Settlements
- Capacity expansions or new facilities
- Contracts, orders, or renewals
- Financial Results/Board Meetings
- Defaults, bankruptcies, or major risks

NOT SIGNIFICANT (RETURN "NO"):
- Routine transmission of annual/quarterly reports
- Loss of share certificates
- Change of share registrar
- Routine notices of AGM/EOGM
- Corrigendum for minor clerical errors
- Routine notifications of shareholding changes (unless major buyback)

Title: "${title}"

Return ONLY "YES" or "NO".
`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim().toUpperCase();
        console.log(`🤖 AI Triage for "${title}": ${text}`);
        return text.includes('YES');
    } catch (error) {
        console.error('Error in AI triage:', error);
        return false; // Fail safe to skip
    }
}

/**
 * Helper to parse AI JSON response
 */
export function parseAIResponse(rawText: string) {
    try {
        // 1. Strip Markdown Code Blocks (```json ... ``` or just ``` ... ```)
        let cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

        // 2. Find the first '{' and last '}' to extract the JSON object
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        }

        const parsed = JSON.parse(cleaned);

        // Map flexible field names to expected keys
        return {
            sentiment: parsed.sentiment || parsed.verdict || "Neutral",
            headline: parsed.headline || "New Announcement",
            scoop: parsed.scoop || parsed.the_scoop || [],
            verdict: parsed.post || parsed.the_post || parsed.summary || parsed.verdict || "Analysis unavailable.",
            sector: parsed.sector || "Unknown",
            market_context: parsed.market_context || { valuation: "N/A", momentum: "N/A", price: "N/A" }
        };
    } catch (e) {
        console.warn("⚠️ Failed to parse AI JSON, falling back to raw text.", e);
        return {
            sentiment: "Neutral",
            headline: "Possible Parse Error",
            scoop: [rawText.substring(0, 300)],
            verdict: "Parse failed - Raw text available in scoop.",
            sector: "Unknown",
            market_context: { valuation: "N/A", momentum: "N/A", price: "N/A" }
        };
    }
}

import { getWebhookFromDB } from './notifications/discord';

/**
 * Send fundamental alert to Discord
 */
export async function sendToFundamentalDiscord(task: any, aiResult: any, sector: string) {
    let webhookUrl = await getWebhookFromDB('fundamental_webhook_url');

    if (!webhookUrl || webhookUrl === '""') {
        webhookUrl = process.env.DISCORD_FUNDAMENTAL_WEBHOOK || null;
    }

    if (!webhookUrl) return;

    // Use AI-identified sector if the database one is "Unknown"
    const finalSector = (sector === 'Unknown' || !sector) ? (aiResult.sector || sector || 'General') : sector;

    const sentimentEmoji = (aiResult.sentiment || '').includes('Bullish') ? '🟢' : ((aiResult.sentiment || '').includes('Bearish') ? '🔴' : '⚪');

    // Format the Scoop bullets
    const scoopText = Array.isArray(aiResult.scoop)
        ? aiResult.scoop.map((item: string) => `• ${item}`).join('\n\n')
        : `• ${aiResult.scoop}`;

    // Twitter-Ready Block (Headline + Summary)
    const twitterHeadline = aiResult.headline.replace(/^[^\w\s]+/, '').trim();
    const twitterPost = aiResult.verdict || '';

    const content = `**${sentimentEmoji} ${twitterHeadline}**
*(${finalSector})*

${twitterPost}

---
**The Intelligence Scoop**
${scoopText}

**Valuation Insight**
"${aiResult.market_context?.valuation || 'N/A'}"

**Momentum Pulse**
"${aiResult.market_context?.momentum || 'N/A'}"

${task.attachments?.length > 0 ? `[📄 Open Document](${task.attachments[0]})` : ''}
`;

    try {
        await axios.post(webhookUrl, { content });
    } catch (err: any) {
        console.error(`❌ Discord Error (${task.symbol}):`, err.message);
    }
}
