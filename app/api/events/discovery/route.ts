import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import axios from 'axios';
import * as cheerio from 'cheerio';

import { triageAnnouncement } from '@/lib/ai-service';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

const API_URL = 'https://dps.psx.com.pk/announcements';
const BASE_URL = 'https://dps.psx.com.pk';

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // Optional: return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await pool.connect();

    try {
        // --- NIGHT MODE CHECK ---
        // Skip scraping for announcements between 11 PM and 6 AM PKT to save resources.
        const pktTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" });
        const pktHour = new Date(pktTime).getHours();
        if (pktHour >= 23 || pktHour < 6) {
            return NextResponse.json({
                success: true,
                skipped: true,
                message: 'Night mode: Skipping announcement scrape (11PM-6AM PKT).'
            });
        }

        // --- CLEANUP STEP ---
        // Clean up event_queue to prevent bloat. Keep only pending items.
        // Delete PROCESSED or SKIPPED items older than 2 days.
        const cleanupRes = await client.query(`
            DELETE FROM event_queue 
            WHERE status IN ('PROCESSED', 'SKIPPED') 
            AND processed_at < NOW() - INTERVAL '48 hours'
        `);
        if (cleanupRes.rowCount && cleanupRes.rowCount > 0) {
            console.log(`[Discovery] Cleaned up ${cleanupRes.rowCount} stale records from event_queue.`);
        }

        // 1. Fetch Dynamic Configs
        const configRes = await client.query("SELECT key, value FROM alert_configs");
        const configs = configRes.rows.reduce((acc: any, row: any) => {
            acc[row.key] = row.value;
            return acc;
        }, {});

        const PRIORITY_KEYWORDS: string[] = configs.priority_keywords || [];
        const IGNORE_KEYWORDS: string[] = configs.ignore_keywords || [];
        const MC_THRESHOLD_RANK = configs.fundamental_mc_threshold_rank || 100;
        const AI_TRIAGE_MID_SMALL = configs.ai_triage_mid_small_caps === true || configs.ai_triage_mid_small_caps === 'true';
        const modelName = configs.fundamental_alert_model;

        // 2. Fetch Top X Companies
        const topCompaniesRes = await client.query(
            "SELECT symbol FROM company_profiles WHERE market_cap IS NOT NULL ORDER BY market_cap DESC LIMIT $1",
            [MC_THRESHOLD_RANK]
        );
        const topSymbols = topCompaniesRes.rows.map((r: any) => r.symbol);

        // 3. Scrape Announcements
        // 3. Scrape Announcements (Extract raw data first)
        const payload = new URLSearchParams({
            type: 'C',
            symbol: '',
            query: '',
            count: '50',
            offset: '0',
            date_from: '',
            date_to: '',
            page: 'annc'
        });

        const response = await axios.post(API_URL, payload, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'Mozilla/5.0'
            },
            timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const rows = $('tr');
        const candidates: any[] = [];

        // 3a. First Pass: Extract Raw Data
        for (let i = 0; i < rows.length; i++) {
            const cols = $(rows[i]).find('td');
            if (cols.length === 0) continue;

            const symbol = $(cols[2]).text().trim();
            const title = $(cols[4]).text().trim();
            const date = $(cols[0]).text().trim();
            const time = $(cols[1]).text().trim();
            const company = $(cols[3]).text().trim();

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

            candidates.push({ symbol, title, date, time, company, attachments });
        }

        // 3b. Batch Deduplication: Check who is already in DB
        // We can't query tuple IN (...) easily in some PG versions, so we fetch existing sigs
        // Or we iterate and query? Batch is better.
        // Let's filter in memory after fetching relevant recent ones or just loop-check (DB is fast, AI is slow/expensive).
        // Given 50 items, a loop of 50 fast SELECTs is negligible compared to AI.
        // Or better:
        const candidateSigs = candidates.map(c => `('${c.symbol}', '${c.title.replace(/'/g, "''")}')`).join(',');

        let existingMap = new Set<string>();
        if (candidates.length > 0) {
            const existRes = await client.query(`
                SELECT symbol, metadata->>'psx_title' as title FROM notable_events 
                WHERE (symbol, metadata->>'psx_title') IN (VALUES ${candidateSigs})
                UNION
                SELECT symbol, metadata->>'psx_title' as title FROM event_queue
                WHERE (symbol, metadata->>'psx_title') IN (VALUES ${candidateSigs})
            `);
            existRes.rows.forEach((row: any) => existingMap.add(`${row.symbol}|${row.title}`));
        }

        const priorityWhitelistRes = await client.query('SELECT value FROM alert_configs WHERE key = $1', ['priority_whitelist']);
        let PRIORITY_WHITELIST: string[] = [];
        if (priorityWhitelistRes.rows.length > 0) {
            PRIORITY_WHITELIST = Array.isArray(priorityWhitelistRes.rows[0].value)
                ? priorityWhitelistRes.rows[0].value
                : JSON.parse(priorityWhitelistRes.rows[0].value);
        }

        const tasks: any[] = [];
        let newlyQueuedCount = 0;
        let skippedCount = 0;

        // 3c. Filter & Triage
        for (const cand of candidates) {
            const sig = `${cand.symbol}|${cand.title}`;
            if (existingMap.has(sig)) {
                skippedCount++;
                continue;
            }

            // It's NEW! Now we check if we care about it.
            const titleLower = cand.title.toLowerCase();
            let passed = false;

            // LOCAL DETERMINISTIC FILTERS (Free)
            // 1. Explicit Ignore List (From DB) - Takes PRECEDENCE
            const isIgnored = IGNORE_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()));

            if (isIgnored) {
                // console.log(`🚫 Skipped (Ignored): ${cand.title}`);
                await client.query(
                    `INSERT INTO event_queue (symbol, event_type, trigger_value, previous_value, metadata, status, processed_at)
                     VALUES ($1, $2, $3, $4, $5, 'SKIPPED', NOW())`,
                    [cand.symbol, 'fundamental_alert', 0, 0, JSON.stringify(cand)]
                );
                continue;
            }

            // 2. Priority/Critical Keywords (From DB) - Bypass all checks
            const isPrioritized = PRIORITY_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()));

            // 3. Triage & Rank Logic
            const isWhitelisted = PRIORITY_WHITELIST.includes(cand.symbol);
            let isPrioritySymbol = topSymbols.includes(cand.symbol) || isWhitelisted;

            if (isPrioritized) {
                passed = true;
            } else if (titleLower.includes("disclosure of interest") && isPrioritySymbol) {
                passed = true;
            } else {
                // If it's a small/mid cap and NOT a priority keyword match and NOT whitelisted, skip triage to save cost
                if (!isPrioritySymbol && !AI_TRIAGE_MID_SMALL) {
                    // console.log(`💰 Skipped (Cost Saving): ${cand.symbol}`);
                    await client.query(
                        `INSERT INTO event_queue (symbol, event_type, trigger_value, previous_value, metadata, status, processed_at)
                         VALUES ($1, $2, $3, $4, $5, 'SKIPPED', NOW())`,
                        [cand.symbol, 'fundamental_alert', 0, 0, JSON.stringify(cand)]
                    );
                    continue;
                }

                // Tier 3: AI Triage for the "Grey Area"
                // ONLY if the symbol is priority OR user enabled mid/small cap triage
                if (isPrioritySymbol || AI_TRIAGE_MID_SMALL) {
                    const isSignificant = await triageAnnouncement(cand.title, modelName);
                    passed = isSignificant;
                }
            }

            if (!passed) {
                // We should record it as "seen/skipped" so we don't re-triage it? 
                // Currently `event_queue` stores "processed" or "pending". 
                // If we don't store "skipped" items, we will re-triage them next run.
                // CRITICAL FIX: We must store "SKIPPED" items too, or we'll pay for them forever.
                await client.query(
                    `INSERT INTO event_queue (symbol, event_type, trigger_value, previous_value, metadata, status, processed_at)
                     VALUES ($1, $2, $3, $4, $5, 'SKIPPED', NOW())`,
                    [cand.symbol, 'fundamental_alert', 0, 0, JSON.stringify(cand)]
                );
                continue;
            }

            // Valid & New -> Queue it
            await client.query(
                `INSERT INTO event_queue (symbol, event_type, trigger_value, previous_value, metadata, status)
                 VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
                [cand.symbol, 'fundamental_alert', 0, 0, JSON.stringify(cand)]
            );
            tasks.push(cand);
            newlyQueuedCount++;
        }

        console.log(`[Discovery] Results: ${newlyQueuedCount} Newly Queued, ${skippedCount} Already Exists.`);

        return NextResponse.json({
            success: true,
            scraped: tasks.length,
            newlyQueued: newlyQueuedCount,
            skipped: skippedCount
        });

    } catch (error: any) {
        console.error('[Discovery] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    } finally {
        client.release();
    }
}
