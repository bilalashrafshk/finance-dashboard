import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getEventHeadlinePrompt } from '@/lib/ai-prompts';
import { generateHeadline, analyzeAnnouncement, parseAIResponse, sendToFundamentalDiscord } from '@/lib/ai-service';
import { sendMarketEventAlert, sendDiscordNotification } from '@/lib/notifications/discord';
import { getPromptSlugByTitle } from '@/lib/ai/prompt-router';
import { AIContextService } from '@/lib/ai/ai-context-service';
import { RoutineReportService } from '@/lib/market/routine-report-service';
import { getPool } from '@/lib/db';
import { TwitterAgentService } from '@/lib/ai/twitter-agent';
import { TwitterPublisher } from '@/lib/services/twitter-publisher';

// Use same pool logic
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

export const maxDuration = 60; // Max 60s for Vercel Hobby

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await pool.connect();

    try {
        // 1. Fetch Pending Events
        // Limit to 10 technical OR 1 fundamental (to prevent timeout)
        const pendingRes = await client.query(`
            SELECT id, symbol, event_type, trigger_value, previous_value, close_price, metadata
            FROM event_queue 
            WHERE status = 'PENDING' 
            ORDER BY created_at ASC 
            LIMIT 10
        `);

        if (pendingRes.rows.length === 0) {
            // Check for Daily Recap even if queue is empty
            await handleDailyRecap(client);
            return NextResponse.json({ success: true, count: 0, message: 'Queue empty' });
        }

        console.log(`[Event Queue] Processing ${pendingRes.rows.length} events...`);

        // Check for Daily Recap
        await handleDailyRecap(client);

        let processedCount = 0;
        let fundamentalProcessedCount = 0;

        for (const event of pendingRes.rows) {
            // Safety: Only process ONE fundamental alert per run due to high latency
            if (event.event_type === 'fundamental_alert' && fundamentalProcessedCount >= 1) {
                console.log(`[Event Queue] Skipping extra fundamental alert ${event.id} for next run.`);
                continue;
            }

            try {
                if (event.event_type === 'fundamental_alert') {
                    // ---- FUNDAMENTAL ALERT FLOW ----
                    const task = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : event.metadata;

                    // A. Deduplication (Search notably_events)
                    const existing = await client.query(
                        "SELECT id FROM notable_events WHERE symbol = $1 AND metadata->>'psx_title' = $2",
                        [event.symbol, task.title]
                    );
                    if (existing.rows.length > 0) {
                        await client.query(`UPDATE event_queue SET status = 'SKIPPED', processed_at = NOW() WHERE id = $1`, [event.id]);
                        continue;
                    }

                    // B. Get Prompt & Context
                    const configRes = await client.query("SELECT key, value FROM alert_configs");
                    const configs = configRes.rows.reduce((acc: any, row: any) => {
                        acc[row.key] = row.value;
                        return acc;
                    }, {});

                    const MC_THRESHOLD_RANK = configs.fundamental_mc_threshold_rank || 100;
                    const GLOBAL_MULTIMODAL = configs.enable_multimodal_analysis === true || configs.enable_multimodal_analysis === 'true';
                    const ENABLE_FUNDAMENTAL = configs.enable_fundamental_alerts === undefined ? true : (configs.enable_fundamental_alerts === true || configs.enable_fundamental_alerts === 'true');
                    const modelName = configs.fundamental_alert_model;

                    if (!ENABLE_FUNDAMENTAL) {
                        console.log(`[Event Queue] 🛑 Fundamental Alerts Disabled via Admin. Skipping ${event.symbol}`);
                        // Mark as skipped but use a unique status if you want to retry later, or just SKIPPED
                        // For temporary pause, we might want to leave them PENDING? 
                        // But user said "turn them off", implying ignoring new ones. 
                        // If we want "pause", we should just return. 
                        // If we mark as SKIPPED, they are gone forever.
                        // User asked: "turn them off temporarily and then check the issue"
                        // Safer to just CONTINUE loop without marking processed, essentially "ignoring" them for now?
                        // BUT if we don't mark processed, they clog the queue.
                        // Let's mark as SKIPPED for now to clean queue.
                        await client.query(`UPDATE event_queue SET status = 'SKIPPED', processed_at = NOW(), metadata = jsonb_set(metadata, '{skipped_reason}', '"Disabled in Admin"') WHERE id = $1`, [event.id]);
                        continue;
                    }

                    const topCompaniesRes = await client.query(
                        "SELECT symbol FROM company_profiles WHERE market_cap IS NOT NULL ORDER BY market_cap DESC LIMIT $1",
                        [MC_THRESHOLD_RANK]
                    );
                    const topSymbols = topCompaniesRes.rows.map((r: any) => r.symbol);

                    const priorityKeywordsRes = await client.query('SELECT value FROM alert_configs WHERE key = $1', ['priority_keywords']);
                    let PRIORITY_KEYWORDS: string[] = [];
                    if (priorityKeywordsRes.rows.length > 0) {
                        PRIORITY_KEYWORDS = Array.isArray(priorityKeywordsRes.rows[0].value)
                            ? priorityKeywordsRes.rows[0].value
                            : JSON.parse(priorityKeywordsRes.rows[0].value);
                    }

                    const priorityWhitelistRes = await client.query('SELECT value FROM alert_configs WHERE key = $1', ['priority_whitelist']);
                    let PRIORITY_WHITELIST: string[] = [];
                    if (priorityWhitelistRes.rows.length > 0) {
                        PRIORITY_WHITELIST = Array.isArray(priorityWhitelistRes.rows[0].value)
                            ? priorityWhitelistRes.rows[0].value
                            : JSON.parse(priorityWhitelistRes.rows[0].value);
                    }

                    // Define Critical Keywords (Hardcoded as they are in Discovery)
                    // These are keywords that are so important they make a stock "Priority" even if small cap
                    // UPDATED: User explicitly requested NOT to do multimodal for these on small caps.
                    // const CRITICAL_KEYWORDS = ["Material Information", "Discovery", "Production", "Financial Results", "Board Meeting", "Dividend"];

                    // Check if symbol is a "Priority Symbol" (Top N market cap OR Whitelisted OR Priority Keyword)
                    // REMOVED CRITICAL_KEYWORDS from this check.
                    const isWhitelisted = PRIORITY_WHITELIST.includes(event.symbol);
                    const isKeywordMatch = PRIORITY_KEYWORDS.some(k => task.title?.toLowerCase().includes(k.toLowerCase()));

                    const isPrioritySymbol = topSymbols.includes(event.symbol) ||
                        isWhitelisted ||
                        isKeywordMatch;

                    const promptSlug = getPromptSlugByTitle(task.title);
                    const promptRes = await client.query("SELECT content FROM ai_prompts WHERE slug = $1", [promptSlug]);
                    const systemPrompt = promptRes.rows[0]?.content || "Analyze this financial announcement.";

                    let context = {};
                    try {
                        context = await AIContextService.getContext(event.symbol);
                    } catch (e) {
                        console.warn(`[Event Queue] No context for ${event.symbol}`);
                    }

                    let aiResult: any;
                    let finalHeadline = task.title;

                    // C. AI Synthesis Logic (Strict: Full Multimodal OR Raw Alert. No Text-Only.)
                    // 1. Check Eligibility: Must be Priority Symbol AND Global Multimodal must be ON.
                    //    (Priority Symbol = Top 100 OR Whitelist OR Priority/Critical Keyword)

                    if (GLOBAL_MULTIMODAL && isPrioritySymbol) {
                        // --- FULL AI ANALYSIS (Multimodal) ---
                        // Strict: We try Multimodal. If it fails (e.g. no PDF), lib/ai-service might still do text.
                        // But user wants: "either do multimodal or raw. no text analysis"
                        // So we pass 'disableMultimodal: false' (meaning enable it). 
                        // If analyzeAnnouncement internally falls back to text, we need to change THAT or handle it here.
                        // Actually, user's request is: If multimodal is OFF, do raw.
                        // Here: GLOBAL_MULTIMODAL is checked. 

                        const { text: rawAiResult, debugMetadata } = await analyzeAnnouncement(
                            systemPrompt,
                            context,
                            task,
                            {
                                disableMultimodal: false,
                                modelName
                            }
                        );

                        // Check if it actually did multimodal or fell back
                        // debugMetadata?.attachedFiles?.length tells us if files were used.
                        // If no files attached, it likely did text-only analysis of the title.
                        // User says: "no text analysis". 
                        // So if NO files were attached, we should discard AI result and go RAW?
                        // "if multimodal is off, it must do raw alert" -> processed in ELSE block below.
                        // "If PDF download fails ... It falls back ... [User says NO]"

                        const hasAttachments = debugMetadata?.attachedFiles && debugMetadata.attachedFiles.length > 0;

                        if (!hasAttachments) {
                            console.log(`[Event Process] ⚠️ AI performed text-only analysis (no attachments). Reverting to RAW as per strict policy.`);
                            aiResult = {
                                headline: task.title,
                                verdict: "See attached filing for details.",
                                sentiment: "Neutral",
                                is_raw_alert: true,
                                scoop: "Raw Alert: AI analysis skipped (Missing attachment or disabled)."
                            };
                        } else {
                            try {
                                aiResult = parseAIResponse(rawAiResult);
                                if (aiResult.headline) finalHeadline = aiResult.headline;
                            } catch (e) {
                                console.error('Failed to parse AI response', e);
                                aiResult = {
                                    headline: task.title,
                                    verdict: "AI parsing failed. See filing.",
                                    sentiment: "Neutral",
                                    is_raw_alert: true,
                                    scoop: "AI parsing failed. Please check the official document."
                                };
                            }
                        }

                    } else {
                        // --- RAW ALERT (Global Multimodal OFF OR Not Priority) ---
                        console.log(`⚡ Optimization: Raw Alert for ${event.symbol} (Priority: ${isPrioritySymbol}, Multimodal: ${GLOBAL_MULTIMODAL})`);

                        aiResult = {
                            headline: task.title,
                            verdict: "See attached filing for details.",
                            sentiment: "Neutral",
                            is_raw_alert: true,
                            scoop: "Raw Alert: Detailed AI analysis skipped for this event."
                        };
                    }

                    // D. Push to Notable Events & Discord
                    const sector = (context as any)?.meta?.sector || 'General';

                    // Allow Generic/Other sector for now
                    const sectorSlug = sector === 'General' ? 'general' : sector;

                    await client.query(`
                        INSERT INTO notable_events (symbol, event_type, headline, summary, metadata, created_at)
                        VALUES ($1, $2, $3, $4, $5, NOW())
                        ON CONFLICT (id) DO UPDATE SET headline = $3, summary = $4, metadata = $5
                    `, [
                        event.symbol,
                        'fundamental_alert',
                        finalHeadline,
                        aiResult.verdict,
                        JSON.stringify({
                            ai_analysis: aiResult,
                            link: task.link,
                            sector: sectorSlug
                        })
                    ]);

                    // Send Discord Notification
                    // Send Discord Notification via Shared Helper (Ensures consistent formatting)
                    await sendToFundamentalDiscord(
                        {
                            symbol: event.symbol,
                            link: task.link,
                            attachments: task.attachments || []
                        },
                        aiResult,
                        sectorSlug
                    );

                    // Update Queue Status
                    await client.query(`UPDATE event_queue SET status = 'PROCESSED', processed_at = NOW() WHERE id = $1`, [event.id]);

                    fundamentalProcessedCount++;
                } else {
                    // ---- TECHNICAL ALERT FLOW ----
                    const eventTypeLabel = event.event_type === 'ATH' ? 'ATH' : (event.event_type === 'VOLUME_SURGE' ? 'VOLUME_SURGE' : '52W_HIGH');

                    const existing = await client.query(`
                        SELECT id FROM notable_events 
                        WHERE symbol = $1 AND event_type = $2 AND created_at::date = CURRENT_DATE
                    `, [event.symbol, eventTypeLabel]);

                    if (existing && existing.rowCount && existing.rowCount > 0) {
                        await client.query(`UPDATE event_queue SET status = 'SKIPPED', processed_at = NOW() WHERE id = $1`);
                        continue;
                    }

                    // Fetch Company Name
                    const profileRes = await client.query("SELECT company_name FROM company_profiles WHERE symbol = $1", [event.symbol]);
                    const companyName = profileRes.rows[0]?.company_name || '';
                    const nameSuffix = companyName ? ` (${companyName})` : '';

                    let headline = '';
                    let description = '';
                    let metadata = {};

                    if (eventTypeLabel === 'VOLUME_SURGE') {
                        const currentVol = parseFloat(event.trigger_value);
                        const avgVol = parseFloat(event.previous_value);
                        const surgePct = ((currentVol / avgVol) - 1) * 100;

                        headline = `🚀 Volume Surge: ${event.symbol}${nameSuffix} trading at ${surgePct.toFixed(0)}% above average`;
                        description = `Current volume reached ${currentVol.toLocaleString()}, which is ${(currentVol / avgVol).toFixed(1)}x higher than the 10-day average of ${avgVol.toLocaleString()}`;
                        metadata = { current: currentVol, avg: avgVol, surge_pct: surgePct, queue_id: event.id };
                    } else {
                        if (eventTypeLabel === 'ATH') {
                            headline = `🚀 ALL TIME HIGH: ${event.symbol}${nameSuffix} hits ${event.trigger_value}`;
                        } else if (eventTypeLabel === '52W_HIGH') {
                            headline = `📈 New 52-Week High: ${event.symbol}${nameSuffix} at ${event.trigger_value}`;
                        } else {
                            headline = `${event.symbol}${nameSuffix} hits new ${event.event_type} of ${event.trigger_value}`;
                        }

                        description = `Price reached ${event.trigger_value}, breaking previous ${event.event_type} of ${event.previous_value}`;
                        metadata = { old: event.previous_value, new: event.trigger_value, queue_id: event.id };
                    }

                    await client.query(`
                        INSERT INTO notable_events (symbol, event_type, headline, description, created_at, metadata)
                        VALUES ($1, $2, $3, $4, NOW(), $5)
                    `, [
                        event.symbol,
                        eventTypeLabel,
                        headline,
                        description,
                        JSON.stringify(metadata)
                    ]);

                    // Send to Discord
                    try {
                        await sendMarketEventAlert({
                            symbol: event.symbol,
                            type: eventTypeLabel,
                            headline: headline,
                            price: event.close_price ? parseFloat(event.close_price) : parseFloat(event.trigger_value),
                            prevValue: parseFloat(event.previous_value)
                        });
                    } catch (discordErr) {
                        console.error(`[Event Process] Discord notification failed for ${event.symbol}:`, discordErr);
                    }
                }

                // E. Mark Processed
                await client.query(`UPDATE event_queue SET status = 'PROCESSED', processed_at = NOW() WHERE id = $1`, [event.id]);
                processedCount++;

            } catch (itemErr) {
                console.error(`Failed to process event ${event.id}:`, itemErr);
                await client.query(`UPDATE event_queue SET status = 'FAILED', processed_at = NOW() WHERE id = $1`, [event.id]);
            }
        }

        return NextResponse.json({ success: true, count: processedCount });

    } catch (e: any) {
        console.error('[Event Process] Router Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    } finally {
        client.release();
    }
}

/**
 * Trigger Daily Recap if the time is right (around 4:00 PM PKT)
 */
async function handleDailyRecap(client: any) {
    try {
        // 1. Get current time in PKT
        const now = new Date();
        const pktOffset = 5 * 60; // UTC+5
        const pktTime = new Date(now.getTime() + (pktOffset + now.getTimezoneOffset()) * 60000);

        const day = pktTime.getDay(); // 0 = Sun, 1 = Mon, ... 5 = Fri, 6 = Sat
        const hour = pktTime.getHours();
        const minute = pktTime.getMinutes();
        const todayStr = pktTime.toISOString().split('T')[0];

        // 2. Determine target hour based on day
        // Mon-Thu: 4 PM (16:00), Fri: 5 PM (17:00), Sat/Sun: Skip
        let targetHour = -1;
        if (day >= 1 && day <= 4) targetHour = 16;
        else if (day === 5) targetHour = 17;

        if (targetHour !== -1 && hour === targetHour && minute >= 0 && minute <= 15) {
            // 3. Check if we already sent it today
            const checkRes = await client.query(
                "SELECT value FROM alert_configs WHERE key = 'last_daily_recap_sent_date'"
            );
            const lastSent = checkRes.rows[0]?.value;

            if (lastSent !== todayStr) {
                console.log(`[Daily Recap] Triggering reports for ${todayStr}...`);
                await RoutineReportService.pushDailyReports();

                // 4. Mark as sent
                await client.query(`
                    INSERT INTO alert_configs (key, value) 
                    VALUES ('last_daily_recap_sent_date', $1)
                    ON CONFLICT (key) DO UPDATE SET value = $1
                `, [todayStr]);
            }
        }
    } catch (err) {
        console.error('[Daily Recap] Trigger failed:', err);
    }
}
