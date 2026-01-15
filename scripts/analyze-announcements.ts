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
const OUTPUT_FILE = path.join(process.cwd(), 'scripts/data/final_analysis.json');

async function sendToDiscord(task: any, aiResult: string) {
    const webhookUrl = process.env.DISCORD_FUNDAMENTAL_WEBHOOK;
    if (!webhookUrl) return;

    // Extract Headline from AI Result (usually the first line)
    const lines = aiResult.split('\n');
    let headline = lines[0].replace('**HEADLINE:**', '').replace('HEADLINE:', '').trim();
    if (!headline) headline = `New Announcement: ${task.symbol}`;

    const content = `
**${headline}**
> **Company:** ${task.company} (${task.symbol})
> **Title:** ${task.title}
> **Time:** ${task.date} @ ${task.time}

${aiResult.split('\n').slice(1).join('\n').trim().substring(0, 1500)}

**Sources:**
${task.attachments.length > 0 ? task.attachments.join('\n') : 'No PDF Attachments'}
`;

    try {
        await axios.post(webhookUrl, { content });
    } catch (err: any) {
        console.error(`❌ Discord Error (${task.symbol}):`, err.message);
    }
}

async function runAnalysis(targetDate?: string) {
    const pool = getPool();
    console.log(`\n🚀 Starting End-to-End Analysis ${targetDate ? `for ${targetDate}` : '(Live)'}...`);

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
        const tasks: any[] = [];

        for (let i = 0; i < rows.length; i++) {
            const cols = $(rows[i]).find('td');
            if (cols.length === 0) continue;

            const symbol = $(cols[2]).text().trim();
            const title = $(cols[4]).text().trim();
            const titleLower = title.toLowerCase();

            // 3. Filter Logic
            let passed = false;
            let reason = '';

            const CRITICAL_KEYWORDS = ["Material Information"];
            if (CRITICAL_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) {
                passed = true;
                reason = "Critical Info";
            } else if (IGNORE_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) {
                continue; // Skip noise
            } else if (PRIORITY_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) {
                passed = true;
                reason = "Priority Keyword";
            } else if (titleLower.includes("disclosure of interest") && topSymbols.includes(symbol)) {
                passed = true;
                reason = "Top 100 Insider";
            }

            if (!passed) continue;

            // Extract attachments
            const attachments: string[] = [];

            // 1. PDF Links
            $(cols[5]).find('a[href$=".pdf"]').each((_, el) => {
                const href = $(el).attr('href');
                if (href) attachments.push(BASE_URL + href);
            });

            // 2. Image/Gif Links (from data-images attribute)
            const imgData = $(cols[5]).find('a[data-images]').attr('data-images');
            if (imgData) {
                // If the link text or data indicates an image, use /download/image/
                // Most GIFs/PNGs on PSX use the -1.gif suffix in the data-images attribute
                attachments.push(`${BASE_URL}/download/image/${imgData}`);
            }

            tasks.push({
                symbol,
                company: $(cols[3]).text().trim(),
                title,
                date: $(cols[0]).text().trim(),
                time: $(cols[1]).text().trim(),
                attachments,
                filterReason: reason
            });
        }

        console.log(`✅ Filtered down to ${tasks.length} actionable announcements.`);

        // 4. Intelligence Processing
        const finalResults = [];
        for (const task of tasks) {
            console.log(`\n🧠 Analyzing ${task.symbol}: ${task.title}...`);

            try {
                // Get Prompt
                const promptSlug = getPromptSlugByTitle(task.title);
                const promptRes = await pool.query("SELECT content FROM ai_prompts WHERE slug = $1", [promptSlug]);
                const systemPrompt = promptRes.rows[0]?.content || "Analyze this financial announcement.";

                // Get Context
                let context = {};
                try {
                    context = await AIContextService.getContext(task.symbol);
                } catch (e) {
                    console.warn(`⚠️ No context found for ${task.symbol}`);
                }

                // AI Synthesis
                const { text: aiResult } = await analyzeAnnouncement(systemPrompt, context, task);

                // Send Discord Alert
                await sendToDiscord(task, aiResult);

                finalResults.push({
                    ...task,
                    ai_analysis: aiResult,
                    processed_at: new Date().toISOString()
                });

                console.log(`✨ AI Output Generated & Alert Sent.`);
            } catch (err: any) {
                console.error(`❌ Error analyzing ${task.symbol}:`, err.message);
            }
        }

        // 5. Save Output
        const dir = path.dirname(OUTPUT_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalResults, null, 2));

        console.log(`\n🏁 Done! Final analysis saved to ${OUTPUT_FILE}`);

    } catch (error: any) {
        console.error("Pipeline Error:", error.message);
    }
}

// Execution
const dateArg = process.argv[2]; // Optional: YYYY-MM-DD
runAnalysis(dateArg);
