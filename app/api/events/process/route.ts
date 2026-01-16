import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getEventHeadlinePrompt } from '@/lib/ai-prompts';
import { generateHeadline, analyzeAnnouncement, parseAIResponse, sendToFundamentalDiscord } from '@/lib/ai-service';
import { sendMarketEventAlert } from '@/lib/notifications/discord';
import { getPromptSlugByTitle } from '@/lib/ai/prompt-router';
import { AIContextService } from '@/lib/ai/ai-context-service';

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
            // Safety: Only process ONE fundamental alert per run due to 60s timeout
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
                    const eventTypeLabel = event.event_type === 'ATH' ? 'ATH' : '52W_HIGH';

                    const existing = await client.query(`
                        SELECT id FROM notable_events 
                        WHERE symbol = $1 AND event_type = $2 AND created_at::date = CURRENT_DATE
                    `, [event.symbol, eventTypeLabel]);

                    if (existing && existing.rowCount && existing.rowCount > 0) {
                        await client.query(`UPDATE event_queue SET status = 'SKIPPED', processed_at = NOW() WHERE id = $1`, [event.id]);
                        continue;
                    }

                    const prompt = await getEventHeadlinePrompt(
                        event.symbol,
                        eventTypeLabel,
                        parseFloat(event.trigger_value),
                        parseFloat(event.previous_value),
                        event.close_price ? parseFloat(event.close_price) : null
                    );

                    let headline = `${event.symbol} hits new ${event.event_type} of ${event.trigger_value}`;
                    try {
                        headline = await generateHeadline(prompt);
                    } catch (e) {
                        console.error(`AI Gen failed for ${event.symbol}, using default.`);
                    }

                    await client.query(`
                        INSERT INTO notable_events (symbol, event_type, headline, description, created_at, metadata)
                        VALUES ($1, $2, $3, $4, NOW(), $5)
                    `, [
                        event.symbol,
                        eventTypeLabel,
                        headline,
                        `Price reached ${event.trigger_value}, breaking previous ${event.event_type} of ${event.previous_value}`,
                        { old: event.previous_value, new: event.trigger_value, queue_id: event.id }
                    ]);

                    // Send to Discord
                    try {
                        await sendMarketEventAlert({
                            symbol: event.symbol,
                            type: eventTypeLabel,
                            headline: headline,
                            price: parseFloat(event.trigger_value),
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
