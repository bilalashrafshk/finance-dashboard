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
            $(cols[5]).find('a[href$=".pdf"]').each((_, el) => {
                const href = $(el).attr('href');
                if (href) attachments.push(BASE_URL + href);
            });
            const imgData = $(cols[5]).find('a[data-images]').attr('data-images');
            if (imgData) attachments.push(`${BASE_URL}/download/document/${imgData}`);

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
                const aiResult = await analyzeAnnouncement(systemPrompt, context, task);

                finalResults.push({
                    ...task,
                    ai_analysis: aiResult,
                    processed_at: new Date().toISOString()
                });

                console.log(`✨ AI Output Generated.`);
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
