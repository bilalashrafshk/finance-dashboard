
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

        console.log(`[Event Processor] Found ${updates.length} potential breakouts.`);

        // 3. Process Updates (Log Event + Update Profile)
        for (const update of updates) {
            // A. Check if event already logged TODAY to avoid spam
            // (e.g. price 304.8 -> 305.0 -> 305.5 in same day)
            // We only want to announce the *first* break, or major milestones.
            // Simplified: One log per type per day.
            const existing = await client.query(`
                SELECT id FROM notable_events 
                WHERE symbol = $1 AND event_type = $2 AND created_at::date = CURRENT_DATE
            `, [update.symbol, update.type === 'ATH' ? 'ATH' : '52W_HIGH']);

            if (existing.rowCount === 0) {
                // B. Generate Headline (Async, but we await to ensure log)
                const eventTypeLabel = update.type === 'ATH' ? 'ATH' : '52W_HIGH';
                const prompt = getEventHeadlinePrompt(update.symbol, eventTypeLabel, update.value, update.old);

                // Fire AI generation optimistically (don't block loop too long if possible, but here we await for safety)
                let headline = `${update.symbol} hits new ${update.type} of ${update.value}`;
                try {
                    headline = await generateHeadline(prompt);
                } catch (e) {
                    console.error('AI Headline failed, using default');
                }

                // C. Insert Event
                await client.query(`
                    INSERT INTO notable_events (symbol, event_type, headline, description, created_at, metadata)
                    VALUES ($1, $2, $3, $4, NOW(), $5)
                `, [
                    update.symbol,
                    eventTypeLabel,
                    headline,
                    `Price reached ${update.value}, breaking previous ${update.type} of ${update.old}`,
                    { old: update.old, new: update.value }
                ]);

                console.log(`[Event Logged] ${update.symbol} ${update.type} ${update.value}`);
            }

            // D. Update Profile (Persistence)
            // Always update the Stats to the new High so subsequent checks are accurate
            // AND so the UI shows the new High immediately.
            if (update.type === 'ATH') {
                await client.query(`
                    UPDATE company_profiles SET all_time_high = $1, fifty_two_week_high = $1, updated_at = NOW()
                    WHERE symbol = $2 AND asset_type = 'pk-equity'
                 `, [update.value, update.symbol]);
            } else {
                await client.query(`
                    UPDATE company_profiles SET fifty_two_week_high = $1, updated_at = NOW()
                    WHERE symbol = $2 AND asset_type = 'pk-equity'
                 `, [update.value, update.symbol]);
            }
        }

    } catch (e) {
        console.error('[Event Processor] Error:', e);
    } finally {
        client.release();
    }
}
