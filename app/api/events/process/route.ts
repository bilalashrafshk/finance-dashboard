
import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getEventHeadlinePrompt } from '@/lib/ai-prompts';
import { generateHeadline } from '@/lib/ai-service';

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
        const pendingRes = await client.query(`
            SELECT id, symbol, event_type, trigger_value, previous_value 
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

        for (const event of pendingRes.rows) {
            try {
                // A. Double-check duplicate in notable_events (safe fallback)
                const existing = await client.query(`
                    SELECT id FROM notable_events 
                    WHERE symbol = $1 AND event_type = $2 AND created_at::date = CURRENT_DATE
                `, [event.symbol, event.event_type === 'ATH' ? 'ATH' : '52W_HIGH']);

                if (existing.rowCount > 0) {
                    // Already logged, just mark queue as processed or skipped
                    await client.query(`UPDATE event_queue SET status = 'SKIPPED', processed_at = NOW() WHERE id = $1`, [event.id]);
                    continue;
                }

                // B. Generate Headline (AI)
                const eventTypeLabel = event.event_type === 'ATH' ? 'ATH' : '52W_HIGH';
                const prompt = getEventHeadlinePrompt(event.symbol, eventTypeLabel, parseFloat(event.trigger_value), parseFloat(event.previous_value));

                let headline = `${event.symbol} hits new ${event.event_type} of ${event.trigger_value}`;
                try {
                    headline = await generateHeadline(prompt);
                } catch (e) {
                    console.error(`AI Gen failed for ${event.symbol}, using default.`);
                }

                // C. Log to Notable Events
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

                // D. Mark Processed
                await client.query(`UPDATE event_queue SET status = 'PROCESSED', processed_at = NOW() WHERE id = $1`, [event.id]);
                processedCount++;

            } catch (itemErr) {
                console.error(`Failed to process event ${event.id}:`, itemErr);
                await client.query(`UPDATE event_queue SET status = 'FAILED', processed_at = NOW() WHERE id = $1`, [event.id]);
            }
        }

        return NextResponse.json({ success: true, count: processedCount });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    } finally {
        client.release();
    }
}
