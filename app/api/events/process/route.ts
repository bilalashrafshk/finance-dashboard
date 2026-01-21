import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getEventHeadlinePrompt } from '@/lib/ai-prompts';
import { generateHeadline, analyzeAnnouncement, parseAIResponse, sendToFundamentalDiscord } from '@/lib/ai-service';
import { sendMarketEventAlert } from '@/lib/notifications/discord';
import { getPromptSlugByTitle } from '@/lib/ai/prompt-router';
import { AIContextService } from '@/lib/ai/ai-context-service';
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
            return NextResponse.json({ success: true, count: 0, message: 'Queue empty' });
        }

        console.log(`[Event Queue] Processing ${pendingRes.rows.length} events...`);

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
                    const promptSlug = getPromptSlugByTitle(task.title);
                    const promptRes = await client.query("SELECT content FROM ai_prompts WHERE slug = $1", [promptSlug]);
                    const systemPrompt = promptRes.rows[0]?.content || "Analyze this financial announcement.";

                    let context = {};
                    try {
                        context = await AIContextService.getContext(event.symbol);
                    } catch (e) {
                        console.warn(`[Event Queue] No context for ${event.symbol}`);
                    }

                    // C. AI Synthesis (This is the slow part)
                    const { text: rawAiResult } = await analyzeAnnouncement(systemPrompt, context, task);
                    const aiResult = parseAIResponse(rawAiResult);

                    // D. Push to Notable Events & Discord
                    const sector = (context as any)?.meta?.sector || 'General';
                    await sendToFundamentalDiscord(task, aiResult, sector);

                    await client.query(`
                        INSERT INTO notable_events (symbol, event_type, headline, description, created_at, metadata)
                        VALUES ($1, $2, $3, $4, NOW(), $5)
                    `, [
                        event.symbol,
                        'fundamental_alert',
                        aiResult.headline,
                        aiResult.verdict,
                        JSON.stringify({
                            ai_analysis: aiResult,
                            attachments: task.attachments,
                            psx_title: task.title,
                            company: task.company
                        })
                    ]);

                    fundamentalProcessedCount++;
                } else {
                    // ---- TECHNICAL ALERT FLOW ----
                    const eventTypeLabel = event.event_type === 'ATH' ? 'ATH' : (event.event_type === 'VOLUME_SURGE' ? 'VOLUME_SURGE' : '52W_HIGH');

                    const existing = await client.query(`
                        SELECT id FROM notable_events 
                        WHERE symbol = $1 AND event_type = $2 AND created_at::date = CURRENT_DATE
                    `, [event.symbol, eventTypeLabel]);

                    if (existing && existing.rowCount && existing.rowCount > 0) {
                        await client.query(`UPDATE event_queue SET status = 'SKIPPED', processed_at = NOW() WHERE id = $1`, [event.id]);
                        continue;
                    }

                    let headline = '';
                    let description = '';
                    let metadata = {};

                    if (eventTypeLabel === 'VOLUME_SURGE') {
                        const currentVol = parseFloat(event.trigger_value);
                        const avgVol = parseFloat(event.previous_value);
                        const surgePct = ((currentVol / avgVol) - 1) * 100;

                        headline = `🚀 Volume Surge: ${event.symbol} trading at ${surgePct.toFixed(0)}% above average`;
                        description = `Current volume reached ${currentVol.toLocaleString()}, which is ${(currentVol / avgVol).toFixed(1)}x higher than the 10-day average of ${avgVol.toLocaleString()}`;
                        metadata = { current: currentVol, avg: avgVol, surge_pct: surgePct, queue_id: event.id };
                    } else {
                        if (eventTypeLabel === 'ATH') {
                            headline = `🚀 ALL TIME HIGH: ${event.symbol} hits ${event.trigger_value}`;
                        } else if (eventTypeLabel === '52W_HIGH') {
                            headline = `📈 New 52-Week High: ${event.symbol} at ${event.trigger_value}`;
                        } else {
                            headline = `${event.symbol} hits new ${event.event_type} of ${event.trigger_value}`;
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

                        // ---- AUTOMATED TWEET FLOW ----
                        // Use configs to decide behavior
                        const configKeys = ['auto_tweet_ath', 'auto_tweet_52w', 'auto_tweet_vol'];
                        const configRes = await client.query(`SELECT key, value FROM alert_configs WHERE key = ANY($1)`, [configKeys]);
                        // Parse values: assuming stored as JSON strings or raw strings. Robust check.
                        const configs = configRes.rows.reduce((acc, row) => {
                            let val = row.value;
                            try { val = JSON.parse(val); } catch (e) { /* keep as string */ }
                            return { ...acc, [row.key]: val };
                        }, {} as Record<string, any>);

                        let shouldTweet = false;
                        if (eventTypeLabel === 'ATH' && configs.auto_tweet_ath === true) shouldTweet = true;
                        if (eventTypeLabel === '52W_HIGH' && configs.auto_tweet_52w === true) shouldTweet = true;
                        if (eventTypeLabel === 'VOLUME_SURGE' && configs.auto_tweet_vol === true) shouldTweet = true;

                        if (shouldTweet) {
                            try {
                                console.log(`[Event Process] Starting automated tweet for ${event.symbol} ${eventTypeLabel}...`);

                                // 1. Generate Tweet Text
                                const systemNotes = `
                                    Event: ${eventTypeLabel}
                                    Price: ${event.trigger_value}
                                    Previous Record: ${event.previous_value}
                                    Headline context: ${headline}
                                `;
                                const tweetGen = await TwitterAgentService.generate(event.symbol, systemNotes, 'automated_alert');

                                // 2. Post to Twitter
                                if (tweetGen.draft) {
                                    // Re-integrated image generation url via params if needed, but for now text
                                    // The publisher service handles media if we pass it, but generate returns draft text.
                                    // We need to fetch the image URL or buffer if we want to attach it.
                                    // For now, let's post text and rely on Publisher to fetch OG image?
                                    // No, Publisher receives media IDs.
                                    // The previous 'verified flow' implied Publisher handles everything?
                                    // Let's check TwitterPublisher. The previous plan said "Integrate Image Fetching".
                                    // I will add the image fetching logic here too as per "Push" request.

                                    // Fetch Image from OG Route
                                    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
                                    const host = request.headers.get('host') || 'localhost:3000';
                                    const titleParam = eventTypeLabel === 'ATH' ? 'ALL TIME HIGH' : (eventTypeLabel === 'VOLUME_SURGE' ? 'VOLUME SURGE' : '52 WEEK HIGH');
                                    const imageUrl = `${protocol}://${host}/api/og/chart?symbol=${event.symbol}&price=${event.trigger_value}&title=${encodeURIComponent(titleParam)}`;

                                    // Download Image Buffer
                                    const imageRes = await fetch(imageUrl);
                                    if (imageRes.ok) {
                                        const imageBuffer = await imageRes.arrayBuffer();
                                        const tweetUrl = await TwitterPublisher.postTweet(tweetGen.draft, Buffer.from(imageBuffer));
                                        if (tweetUrl) console.log(`[Event Process] Automated Tweet posted: ${tweetUrl}`);
                                    } else {
                                        // Fallback text only
                                        const tweetUrl = await TwitterPublisher.postTweet(tweetGen.draft);
                                        if (tweetUrl) console.log(`[Event Process] Automated Tweet (Text Only) posted: ${tweetUrl}`);
                                    }
                                }
                            } catch (tweetErr) {
                                console.error(`[Event Process] Automated tweet failed for ${event.symbol}:`, tweetErr);
                            }
                        } else {
                            console.log(`[Event Process] Automated tweet skipped (Config Disabled or Missing) for ${eventTypeLabel}`);
                        }

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
