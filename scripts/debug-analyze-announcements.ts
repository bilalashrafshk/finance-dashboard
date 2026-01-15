import axios from 'axios';
import * as cheerio from 'cheerio';
import { getPool } from '../lib/db';
import { AIContextService } from '../lib/ai/ai-context-service';
import { getPromptSlugByTitle } from '../lib/ai/prompt-router';
import { analyzeAnnouncement } from '../lib/ai-service';
import fs from 'fs';
import path from 'path';

require('dotenv').config({ path: '.env.local' });

const API_URL = 'https://dps.psx.com.pk/announcements';
const BASE_URL = 'https://dps.psx.com.pk';
const PAYLOADS_FILE = path.join(process.cwd(), 'scripts/data/debug_payloads.json');
const RESPONSES_FILE = path.join(process.cwd(), 'scripts/data/debug_responses.json');

async function runDebugAnalysis(targetDate?: string) {
    const pool = getPool();
    console.log(`\n🔍 Starting AI Debugging Diagnostics ${targetDate ? `for ${targetDate}` : '(Live)'}...`);

    const debugPayloads: any[] = [];
    const debugResponses: any[] = [];

    try {
        // 1. Fetch Configs & Top Symbols
        const configRes = await pool.query("SELECT key, value FROM alert_configs");
        const configs = configRes.rows.reduce((acc: any, row: any) => {
            acc[row.key] = row.value;
            return acc;
        }, {});

        const PRIORITY_KEYWORDS: string[] = configs.priority_keywords || [];
        const IGNORE_KEYWORDS: string[] = configs.ignore_keywords || [];
        const MC_THRESHOLD_RANK = configs.mc_threshold_rank || 100;

        const topRes = await pool.query(
            "SELECT symbol FROM company_profiles WHERE market_cap IS NOT NULL ORDER BY market_cap DESC LIMIT $1",
            [MC_THRESHOLD_RANK]
        );
        const topSymbols = topRes.rows.map((r: any) => r.symbol);

        // 2. Scrape Announcements
        const payload = new URLSearchParams({
            type: 'C',
            symbol: '',
            query: '',
            count: '50',
            offset: '0',
            date_from: targetDate || '',
            date_to: targetDate || '',
            page: 'annc'
        });

        const response = await axios.post(API_URL, payload, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'Mozilla/5.0'
            }
        });

        const $ = cheerio.load(response.data);
        const rows = $('tr');

        for (let i = 0; i < rows.length; i++) {
            const cols = $(rows[i]).find('td');
            if (cols.length === 0) continue;

            const symbol = $(cols[2]).text().trim();
            const title = $(cols[4]).text().trim();
            const titleLower = title.toLowerCase();

            // 3. Filter Logic Tracking
            let status = 'FILTERED_OUT';
            let reason = 'Normal Noise';

            const CRITICAL_KEYWORDS = ["Material Information"];
            if (CRITICAL_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) {
                status = 'PASSED';
                reason = "Critical Info";
            } else if (IGNORE_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) {
                status = 'FILTERED_OUT';
                reason = "Ignore Keyword Match";
            } else if (PRIORITY_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) {
                status = 'PASSED';
                reason = "Priority Keyword Match";
            } else if (titleLower.includes("disclosure of interest") && topSymbols.includes(symbol)) {
                status = 'PASSED';
                reason = "Top 100 Insider Disclosure";
            }

            // Extract attachments
            const attachments: string[] = [];

            // 1. PDF Links
            $(cols[5]).find('a[href$=".pdf"]').each((_, el) => {
                const href = $(el).attr('href');
                if (href) attachments.push(BASE_URL + href);
            });

            // 2. Image/Gif Links
            const imgData = $(cols[5]).find('a[data-images]').attr('data-images');
            if (imgData) {
                attachments.push(`${BASE_URL}/download/image/${imgData}`);
            }

            const announcement = {
                symbol,
                company: $(cols[3]).text().trim(),
                title,
                attachments
            };

            if (status === 'PASSED') {
                console.log(`🧠 Processing ${symbol}: ${title}...`);

                // Get Intelligence Context
                const promptSlug = getPromptSlugByTitle(title);
                const promptRes = await pool.query("SELECT content FROM ai_prompts WHERE slug = $1", [promptSlug]);
                const systemPrompt = promptRes.rows[0]?.content || "";

                let context = {};
                try {
                    context = await AIContextService.getContext(symbol);
                } catch (e) { }

                // Construct exact payload sent to AI (mirrors analyze-announcements.ts)
                const exactPayload = `
${systemPrompt}

**CONTEXT DATA:**
${JSON.stringify(context, null, 2)}

**ANNOUNCEMENT:**
Title: ${announcement.title}
Company: ${announcement.company} (${announcement.symbol})
Attachments: ${announcement.attachments.join(', ')}

Analyze the above and provide the output in the format requested in the system instruction.
`;

                debugPayloads.push({
                    symbol,
                    title,
                    status,
                    reason,
                    prompt_slug: promptSlug,
                    exact_ai_payload: exactPayload
                });

                // AI Response
                try {
                    const aiResult = await analyzeAnnouncement(systemPrompt, context, announcement);
                    debugResponses.push({
                        symbol,
                        title,
                        raw_ai_response: aiResult
                    });
                    console.log(`✨ AI Response Captured.`);
                } catch (err: any) {
                    console.error(`❌ AI Error:`, err.message);
                }
            } else {
                debugPayloads.push({
                    symbol,
                    title,
                    status,
                    reason
                });
            }
        }

        // 5. Save Debug Files
        const dir = path.dirname(PAYLOADS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(PAYLOADS_FILE, JSON.stringify(debugPayloads, null, 2));
        fs.writeFileSync(RESPONSES_FILE, JSON.stringify(debugResponses, null, 2));

        console.log(`\n🏁 Diagnostics Complete!`);
        console.log(`📁 Filtering & Payloads: ${PAYLOADS_FILE}`);
        console.log(`📁 Raw AI Responses: ${RESPONSES_FILE}`);

    } catch (error: any) {
        console.error("Debug Pipeline Error:", error.message);
    }
}

// Execution
const dateArg = process.argv[2];
runDebugAnalysis(dateArg);
