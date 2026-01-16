import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import axios from 'axios';
import * as cheerio from 'cheerio';

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
        const MC_THRESHOLD_RANK = configs.mc_threshold_rank || 100;

        // 2. Fetch Top X Companies
        const topCompaniesRes = await client.query(
            "SELECT symbol FROM company_profiles WHERE market_cap IS NOT NULL ORDER BY market_cap DESC LIMIT $1",
            [MC_THRESHOLD_RANK]
        );
        const topSymbols = topCompaniesRes.rows.map((r: any) => r.symbol);

        // 3. Scrape Announcements
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
        const tasks: any[] = [];

        for (let i = 0; i < rows.length; i++) {
            const cols = $(rows[i]).find('td');
            if (cols.length === 0) continue;

            const symbol = $(cols[2]).text().trim();
            const title = $(cols[4]).text().trim();
            const titleLower = title.toLowerCase();

            // Filter Logic
            let passed = false;
            const CRITICAL_KEYWORDS = ["Material Information"];

            if (CRITICAL_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) {
                passed = true;
            } else if (IGNORE_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) {
                continue;
            } else if (PRIORITY_KEYWORDS.some(k => titleLower.includes(k.toLowerCase()))) {
                passed = true;
            } else if (titleLower.includes("disclosure of interest") && topSymbols.includes(symbol)) {
                passed = true;
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
                attachments
            });
        }

        // 4. Queue Tasks
        let newlyQueuedCount = 0;
        let skippedCount = 0;

        for (const task of tasks) {
            // Deduplication
            const existing = await client.query(
                `SELECT id FROM notable_events WHERE symbol = $1 AND metadata->>'psx_title' = $2
                 UNION
                 SELECT id FROM event_queue WHERE symbol = $1 AND metadata->>'psx_title' = $2`,
                [task.symbol, task.title]
            );

            if (existing.rows.length === 0) {
                await client.query(
                    `INSERT INTO event_queue (symbol, event_type, trigger_value, previous_value, metadata, status)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [task.symbol, 'fundamental_alert', 0, 0, JSON.stringify(task), 'PENDING']
                );
                newlyQueuedCount++;
            } else {
                skippedCount++;
            }
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
