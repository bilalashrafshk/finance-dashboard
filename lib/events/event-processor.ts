
import { Pool } from 'pg';
import { getEventHeadlinePrompt } from '../ai-prompts';
import { generateHeadline } from '../ai-service';

// Re-use the db-client pool if possible, or simpler connection
import { getPostgresClient } from '../portfolio/db-client';

interface BreakoutCandidate {
    symbol: string;
    price: number; // Current Last Price
    dayHigh: number; // Intraday High
}

export async function processBreakouts(candidates: BreakoutCandidate[]) {
    if (candidates.length === 0) return;

    const client = await getPostgresClient();
    try {
        // 1. Fetch current stats for all candidates
        const symbols = candidates.map(c => c.symbol);
        const statsRes = await client.query(`
            SELECT symbol, all_time_high, fifty_two_week_high 
            FROM company_profiles 
            WHERE symbol = ANY($1) AND asset_type = 'pk-equity'
        `, [symbols]);

        const statsMap = new Map<string, { ath: number, w52: number }>();
        statsRes.rows.forEach(r => {
            statsMap.set(r.symbol, {
                ath: parseFloat(r.all_time_high) || 0,
                w52: parseFloat(r.fifty_two_week_high) || 0
            });
        });

        // 2. Identify Breakouts
        const updates: { symbol: string, type: 'ATH' | '52W', value: number, old: number }[] = [];

        for (const cand of candidates) {
            const stat = statsMap.get(cand.symbol);
            if (!stat) continue; // Skip if no profile (or handle new stock)

            // Check ATH
            // Logic: Intraday High > Stored ATH
            if (cand.dayHigh > stat.ath && stat.ath > 0) {
                updates.push({ symbol: cand.symbol, type: 'ATH', value: cand.dayHigh, old: stat.ath });
                // If new ATH, it's automatically new 52W High too, but let's log the biggest event
                continue;
            }

            // Check 52W
            if (cand.dayHigh > stat.w52 && stat.w52 > 0) {
                updates.push({ symbol: cand.symbol, type: '52W', value: cand.dayHigh, old: stat.w52 });
            }
        }

        if (updates.length === 0) return;

        console.log(`[Event Processor] Found ${updates.length} potential breakouts. Queuing...`);

        // 3. Queue Updates & Refresh Stats (Transactional or Parallel)
        // We do this quickly. No AI generation here.
        await Promise.all(updates.map(async (update) => {
            try {
                // A. Check persistence (Daily limit check remains relevant to avoid queue spam)
                const existing = await client.query(`
                    SELECT id FROM notable_events 
                    WHERE symbol = $1 AND event_type = $2 AND created_at::date = CURRENT_DATE
                `, [update.symbol, update.type === 'ATH' ? 'ATH' : '52W_HIGH']);

                // Also check if already in queue preventing duplicates there
                const existingQueue = await client.query(`
                    SELECT id FROM event_queue 
                    WHERE symbol = $1 AND event_type = $2 AND status = 'PENDING'
                `, [update.symbol, update.type]);

                if (existing.rowCount === 0 && existingQueue.rowCount === 0) {
                    // B. Insert into Queue
                    await client.query(`
                        INSERT INTO event_queue (symbol, event_type, trigger_value, previous_value, status)
                        VALUES ($1, $2, $3, $4, 'PENDING')
                    `, [update.symbol, update.type, update.value, update.old]);

                    console.log(`[Event Queued] ${update.symbol} ${update.type}`);
                }

                // C. Update Profile (Always update stats immediately)
                // This ensures detection is accurate on next run even if queue processor is slow
                if (update.type === 'ATH') {
                    await client.query(`
                        UPDATE company_profiles SET all_time_high = $1, fifty_two_week_high = $1
                        WHERE symbol = $2 AND asset_type = 'pk-equity'
                     `, [update.value, update.symbol]);
                } else {
                    await client.query(`
                        UPDATE company_profiles SET fifty_two_week_high = $1
                        WHERE symbol = $2 AND asset_type = 'pk-equity'
                     `, [update.value, update.symbol]);
                }
            } catch (err) {
                console.error(`[Event Processor] Failed to queue ${update.symbol}:`, err);
            }
        }));

    } catch (e) {
        console.error('[Event Processor] Error:', e);
    } finally {
        client.release();
    }
}
