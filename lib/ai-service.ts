import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';


import { PersonalityService } from './ai/personality-service';

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

async function getModel(customModelName?: string) {
    const API_KEY = process.env.GEMINI_API_KEY || '';
    if (!API_KEY) return null;

    if (!genAI) {
        genAI = new GoogleGenerativeAI(API_KEY);
    }

    if (customModelName) {
        return genAI.getGenerativeModel({ model: customModelName });
    }

    if (!model) {
        let modelName = process.env.GEMINI_MODEL;
        if (!modelName) {
            const personality = await PersonalityService.getPersonality('bilal-ashraf');
            modelName = personality?.default_model || 'gemini-2.0-flash';
        }
        console.log(`🤖 Initializing default AI model: ${modelName}`);
        model = genAI.getGenerativeModel({ model: modelName });
    }

    return model;
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
export async function generateAISynthesis(prompt: string, modelName?: string): Promise<string> {
    const currentModel = await getModel(modelName);

    if (!currentModel) {
        console.warn('AI model not initialized. Returning fallback.');
        return 'Market Event Detected (AI Unavailable)';
    }

    try {
        const result = await currentModel.generateContent(prompt);
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
    announcement: any,
    options: { disableMultimodal?: boolean, modelName?: string } = {}
): Promise<{ text: string; debugMetadata?: any }> {
    const currentModel = await getModel(options.modelName);
    if (!currentModel) return { text: JSON.stringify({ error: 'AI Unavailable' }) };

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

    if (!options.disableMultimodal) {
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
    } else {
        console.log(`💰 Optimization: Multimodal analysis DISABLED for ${announcement.symbol}`);
    }

    parts.push({ text: "\nOutput strictly in the specified JSON format. Zero conversational padding. No meta-commentary." });

    try {
        const result = await currentModel.generateContent(parts);
        const response = await result.response;
        return {
            text: response.text().trim(),
            debugMetadata: { attachedFiles, textPrompt }
        };
    } catch (error: any) {
        if (error.status === 400 || error.message?.includes('400')) {
            console.error('❌ Gemini 400 Error: Possible payload limit or format issue. Falling back to text-only.');
            const textOnlyResult = await currentModel.generateContent(textPrompt + "\nAnalyze the announcement details provided in text.");
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
export async function triageAnnouncement(title: string, modelName?: string): Promise<boolean> {
    const currentModel = await getModel(modelName);
    if (!currentModel) return false;

    const prompt = `Decide if this PSX title is operationally/financially significant for an investor.
SIGNIFICANT: Discoveries, Production, JVs, Material Info, Expansions, Contracts, Financials, Defaults, Emergent/Special Board Meetings.
NOT SIGNIFICANT: Reports, Share Certs, Registrar, routine AGMs, Corrigendum, minor Shareholding changes, Routine Board Meeting Notices (dates only).
Title: "${title}"
Return ONLY "YES" or "NO".`;

    try {
        const result = await currentModel.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim().toUpperCase();
        console.log(`🤖 AI Triage for "${title}" [${modelName || 'default'}]: ${text}`);
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

    let content = `**${sentimentEmoji} ${twitterHeadline}**
*(${finalSector})*

${twitterPost}
`;

    if (!aiResult.is_raw_alert) {
        content += `
---
**The Intelligence Scoop**
${scoopText}

**Valuation Insight**
"${aiResult.market_context?.valuation || 'N/A'}"

**Momentum Pulse**
"${aiResult.market_context?.momentum || 'N/A'}"
`;
    }

    content += `
${task.attachments?.length > 0 ? `[📄 Open Document](${task.attachments[0]})` : ''}`;

    const postToXLink = `\n\n[Post to X](https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterHeadline + '\n\n' + twitterPost)})`;

    // Check if adding the link exceeds Discord's 2000 char limit
    if (content.length + postToXLink.length <= 2000) {
        content += postToXLink;
    } else {
        console.warn(`⚠️ Discord message length (${content.length} + ${postToXLink.length}) exceeds 2000 chars. Omitting 'Post to X' link.`);
    }


    try {
        await axios.post(webhookUrl, { content });
    } catch (err: any) {
        console.error(`❌ Discord Error (${task.symbol}):`, err.message);
    }
}
