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

/**
 * Helper to parse AI JSON response
 */
function parseAIResponse(rawText: string) {
    try {
        // Try to find JSON block if AI wrapped it in markdown
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : rawText;
        return JSON.parse(jsonStr);
    } catch (e) {
        console.warn("⚠️ Failed to parse AI JSON, falling back to raw text.");
        return {
            sentiment: "Neutral",
            headline: "New Announcement",
            scoop: [rawText.substring(0, 300)],
            verdict: "Parse failed.",
            market_context: { valuation: "N/A", momentum: "N/A", price: "N/A" }
        };
    }
}

async function sendToDiscord(task: any, aiResult: any, context: any) {
    const webhookUrl = process.env.DISCORD_FUNDAMENTAL_WEBHOOK;
    if (!webhookUrl) return;

    const sector = context?.meta?.sector || 'General';
    const sentimentEmoji = aiResult.sentiment === 'Bullish' ? '🟢' : (aiResult.sentiment === 'Bearish' ? '🔴' : '⚪');

    // Format the Scoop bullets
    const scoopText = Array.isArray(aiResult.scoop)
        ? aiResult.scoop.map((item: string) => `> ${item}`).join('\n')
        : `> ${aiResult.scoop}`;

    const content = `
**${sentimentEmoji} ${task.symbol}: ${aiResult.headline.replace(/^[^\w\s]+/, '').trim()}**
*(${sector})*

> **EVENT BRIEF**
${scoopText}

**📝 ANALYST NOTE**
${aiResult.verdict}

**📊 MARKET CONTEXT**
• **Valuation:** ${aiResult.market_context?.valuation || 'N/A'}
• **Momentum:** ${aiResult.market_context?.momentum || 'N/A'}
• **Price:** ${aiResult.market_context?.price || 'N/A'}

${task.attachments.length > 0 ? `[📄 Open Document](${task.attachments[0]})` : ''}
`;

    try {
        await axios.post(webhookUrl, { content });
    } catch (err: any) {
        console.error(`❌ Discord Error (${task.symbol}):`, err.message);
    }
}

// Execution
const args = process.argv.slice(2);
const isQueueMode = args.includes('--queue');
const dateArg = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));

runAnalysis(dateArg, isQueueMode);

async function runAnalysis(targetDate?: string, queueMode: boolean = false) {
    const pool = getPool();
    console.log(`\n🚀 Starting Announcement Pipeline ${targetDate ? `for ${targetDate}` : '(Live)'} [Mode: ${queueMode ? 'QUEUE' : 'ANALYZE'}]...`);

    try {
        // 1. Fetch Configs & Top Symbols
        const configRes = await pool.query("SELECT key, value FROM alert_configs");
        const configs = configRes.rows.reduce((acc: any, row: any) => {
            acc[row.key] = row.value;
            return acc;
        }, {});

        const PRIORITY_KEYWORDS: string[] = configs.priority_keywords || [];
        const IGNORE_KEYWORDS: string[] = configs.ignore_keywords || [];
        const MC_THRESHOLD_RANK = configs.fundamental_mc_threshold_rank || 100;

        let topSymbols: string[] = [];
        if (MC_THRESHOLD_RANK > 0) {
            const topRes = await pool.query(
                "SELECT symbol FROM company_profiles WHERE market_cap IS NOT NULL ORDER BY market_cap DESC LIMIT $1",
                [MC_THRESHOLD_RANK]
            );
            topSymbols = topRes.rows.map((r: any) => r.symbol);
        }

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

            const isTopStock = MC_THRESHOLD_RANK === 0 || topSymbols.includes(symbol);
            const CRITICAL_KEYWORDS = ["Material Information"];

            if (CRITICAL_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) {
                passed = true;
                reason = "Critical Info";
            } else if (IGNORE_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) {
                continue; // Skip noise
            } else if (PRIORITY_KEYWORDS.some(k => titleLower.includes(k.toLowerCase())) && isTopStock) {
                passed = true;
                reason = `Priority (${MC_THRESHOLD_RANK > 0 ? `Top ${MC_THRESHOLD_RANK}` : 'All'})`;
            } else if (titleLower.includes("disclosure of interest") && isTopStock) {
                passed = true;
                reason = `Insider (${MC_THRESHOLD_RANK > 0 ? `Top ${MC_THRESHOLD_RANK}` : 'All'})`;
            } else if (PRIORITY_KEYWORDS.some(k => titleLower.includes(k.toLowerCase())) && !isTopStock) {
                // If its a priority keyword but NOT a top stock, we still let it through 
                // IF it's one of the "Super Priority" ones like Financial Results?
                // For now, let's keep it simple: Priority Keywords pass if they are Top Stocks.
                // UNLESS the user wants them for everyone.
                // Usually Priority includes 'Financial Results', 'Dividend', etc.
                // If it's a micro-cap, do they want it? 
                // User said: "filter by top 100, 200... or show all". 
            }

            if (!passed) continue;

            // Extract attachments
            const attachments: string[] = [];
            $(cols[5]).find('a[href$=".pdf"]').each((_, el) => {
                const href = $(el).attr('href');
                if (href) attachments.push(BASE_URL + href);
            });
            const imgData = $(cols[5]).find('a[data-images]').attr('data-images');
            if (imgData) {
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

        console.log(`✅ Scraped ${tasks.length} priority announcements.`);

        if (queueMode) {
            console.log(`📥 Queuing ${tasks.length} tasks for processing...`);
            for (const task of tasks) {
                try {
                    // Check if already in queue or already processed
                    const existing = await pool.query(
                        `SELECT id FROM notable_events WHERE symbol = $1 AND metadata->>'psx_title' = $2
                         UNION
                         SELECT id FROM event_queue WHERE symbol = $1 AND metadata->>'psx_title' = $2`,
                        [task.symbol, task.title]
                    );

                    if (existing.rows.length > 0) {
                        console.log(`⏩ ${task.symbol}: Already queued/processed.`);
                        continue;
                    }

                    await pool.query(
                        `INSERT INTO event_queue (symbol, event_type, trigger_value, previous_value, metadata, status)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [task.symbol, 'fundamental_alert', 0, 0, JSON.stringify(task), 'PENDING']
                    );
                    console.log(`✅ Queued: ${task.symbol} - ${task.title}`);
                } catch (err: any) {
                    console.error(`❌ Queue Error (${task.symbol}):`, err.message);
                }
            }
            console.log(`\n🏁 Queuing complete.`);
            return;
        }

        // 4. Intelligence Processing (Analyze Mode)
        const finalResults = [];
        for (const task of tasks) {
            console.log(`\n🧠 Analyzing ${task.symbol}: ${task.title}...`);

            // Deduplication
            try {
                const checkRes = await pool.query(
                    "SELECT id FROM notable_events WHERE symbol = $1 AND metadata->>'psx_title' = $2",
                    [task.symbol, task.title]
                );
                if (checkRes.rows.length > 0) {
                    console.log(`⏩ Skipping ${task.symbol}: Already processed.`);
                    continue;
                }
            } catch (err) {
                console.error(`❌ Deduplication check failed for ${task.symbol}:`, err);
            }

            try {
                const promptSlug = getPromptSlugByTitle(task.title);
                const promptRes = await pool.query("SELECT content FROM ai_prompts WHERE slug = $1", [promptSlug]);
                const systemPrompt = promptRes.rows[0]?.content || "Analyze this financial announcement.";
                let context = {};
                try {
                    context = await AIContextService.getContext(task.symbol);
                } catch (e) {
                    console.warn(`⚠️ No context found for ${task.symbol}`);
                }

                const { text: rawAiResult } = await analyzeAnnouncement(systemPrompt, context, task);
                const aiResult = parseAIResponse(rawAiResult);
                await sendToDiscord(task, aiResult, context);

                await pool.query(
                    `INSERT INTO notable_events (symbol, event_type, headline, description, metadata, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        task.symbol,
                        'fundamental_alert',
                        aiResult.headline,
                        aiResult.verdict,
                        JSON.stringify({
                            ai_analysis: aiResult,
                            attachments: task.attachments,
                            psx_title: task.title,
                            company: task.company
                        }),
                        new Date()
                    ]
                );
                console.log(`✅ Event persisted to database.`);

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

        const dir = path.dirname(OUTPUT_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalResults, null, 2));
        console.log(`\n🏁 Done! Final analysis saved to ${OUTPUT_FILE}`);

    } catch (error: any) {
        console.error("Pipeline Error:", error.message);
    } finally {
        await pool.end();
    }
}
