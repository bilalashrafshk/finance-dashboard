
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

export interface VolumeCandidate {
    symbol: string;
    volume: number; // Current Daily Volume
    price: number;  // Current Last Price
}

export async function processBreakouts(candidates: BreakoutCandidate[]) {
    if (candidates.length === 0) return;

    const client = await getPostgresClient();
    try {
        // 0. Fetch Market Cap Threshold
        const configRes = await client.query("SELECT value FROM alert_configs WHERE key = 'technical_mc_threshold_rank'");
        const mcThresholdRank = parseInt(configRes.rows[0]?.value || '200');

        // Fetch Top X companies by Market Cap
        const topSymbolsRes = await client.query(`
            SELECT symbol FROM company_profiles 
            WHERE asset_type = 'pk-equity' AND market_cap IS NOT NULL 
            ORDER BY market_cap DESC LIMIT $1
        `, [mcThresholdRank]);
        const topSymbols = new Set(topSymbolsRes.rows.map(r => r.symbol));

        // Filter candidates to only include those in top X
        const filteredCandidates = candidates.filter(c => topSymbols.has(c.symbol));
        if (filteredCandidates.length === 0) return;

        // 1. Fetch current stats for all candidates
        const symbols = filteredCandidates.map(c => c.symbol);
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
        const updates: { symbol: string, type: 'ATH' | '52W', value: number, old: number, close: number }[] = [];

        for (const cand of filteredCandidates) {
            const stat = statsMap.get(cand.symbol);
            if (!stat) continue; // Skip if no profile (or handle new stock)

            // Check ATH
            // Logic: Intraday High > Stored ATH
            if (cand.dayHigh > stat.ath && stat.ath > 0) {
                updates.push({ symbol: cand.symbol, type: 'ATH', value: cand.dayHigh, old: stat.ath, close: cand.price });
                // If new ATH, it's automatically new 52W High too, but let's log the biggest event
                continue;
            }

            // Check 52W
            if (cand.dayHigh > stat.w52 && stat.w52 > 0) {
                updates.push({ symbol: cand.symbol, type: '52W', value: cand.dayHigh, old: stat.w52, close: cand.price });
            }
        }

        if (updates.length === 0) return;

        console.log(`[Event Processor] Found ${updates.length} potential breakouts. Processing in batch...`);

        // 3. Batch Check Persistence & Queue Status
        const updateSymbols = updates.map(u => u.symbol);
        const updateTypes = updates.map(u => u.type === 'ATH' ? 'ATH' : '52W_HIGH');

        // Check notable_events and event_queue in parallel for all symbols
        const [existingEventsRes, existingQueueRes] = await Promise.all([
            client.query(`
                SELECT symbol, event_type FROM notable_events 
                WHERE symbol = ANY($1) AND created_at::date = CURRENT_DATE
            `, [updateSymbols]),
            client.query(`
                SELECT symbol, event_type FROM event_queue 
                WHERE symbol = ANY($1) AND status = 'PENDING'
            `, [updateSymbols])
        ]);

        const existingEventsMap = new Set(existingEventsRes.rows.map(r => `${r.symbol}:${r.event_type}`));
        const existingQueueMap = new Set(existingQueueRes.rows.map(r => `${r.symbol}:${r.event_type}`));

        // 4. Filter and Batch Queue Updates
        const validUpdates = updates.filter(u => {
            const eventKey = `${u.symbol}:${u.type === 'ATH' ? 'ATH' : '52W_HIGH'}`;
            // For queue, it's stored as 'ATH' or '52W'
            const queueKey = `${u.symbol}:${u.type}`;
            return !existingEventsMap.has(eventKey) && !existingQueueMap.has(queueKey);
        });

        if (validUpdates.length > 0) {
            const queueValues = validUpdates.flatMap(u => [u.symbol, u.type, u.value, u.old, u.close]);
            const queuePlaceholders = validUpdates.map((_, i) =>
                `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5}, 'PENDING')`
            ).join(',');

            await client.query(`
                INSERT INTO event_queue (symbol, event_type, trigger_value, previous_value, close_price, status)
                VALUES ${queuePlaceholders}
            `, queueValues);

            validUpdates.forEach(u => console.log(`[Event Queued] ${u.symbol} ${u.type}`));
        }

        // 5. Batch Update Company Profiles (Always update stats immediately)
        // We use a temporary table or a VALUES join for bulk update
        const profileValues = updates.flatMap(u => [u.symbol, u.value]);
        const profilePlaceholders = updates.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::numeric)`).join(',');

        // We need separate logic for ATH vs 52W because ATH updates both
        const athUpdates = updates.filter(u => u.type === 'ATH');
        const w52Updates = updates.filter(u => u.type === '52W');

        if (athUpdates.length > 0) {
            const athVals = athUpdates.flatMap(u => [u.symbol, u.value]);
            const athPlaceholders = athUpdates.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::numeric)`).join(',');
            await client.query(`
                UPDATE company_profiles AS c
                SET 
                    all_time_high = v.val,
                    fifty_two_week_high = v.val
                FROM (VALUES ${athPlaceholders}) AS v(symbol, val)
                WHERE c.symbol = v.symbol AND c.asset_type = 'pk-equity'
            `, athVals);
        }

        if (w52Updates.length > 0) {
            const w52Vals = w52Updates.flatMap(u => [u.symbol, u.value]);
            const w52Placeholders = w52Updates.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::numeric)`).join(',');
            await client.query(`
                UPDATE company_profiles AS c
                SET fifty_two_week_high = v.val
                FROM (VALUES ${w52Placeholders}) AS v(symbol, val)
                WHERE c.symbol = v.symbol AND c.asset_type = 'pk-equity'
            `, w52Vals);
        }

    } catch (e) {
        console.error('[Event Processor] Error:', e);
    } finally {
        client.release();
    }
}

export async function processVolumeSurges(candidates: VolumeCandidate[]) {
    if (candidates.length === 0) return;

    const client = await getPostgresClient();
    try {
        // 0. Fetch Settings from alert_configs
        // Added 'auto_tweet_vol' as a Master Switch to prevent DB writes/processing if disabled
        const configsRes = await client.query("SELECT key, value FROM alert_configs WHERE key IN ('volume_surge_settings', 'technical_mc_threshold_rank', 'auto_tweet_vol')");
        const configs = configsRes.rows.reduce((acc: any, row: any) => {
            acc[row.key] = row.value;
            return acc;
        }, {});

        // MASTER SWITCH CHECK
        // If auto_tweet_vol is NOT explicitly 'true', assume the user wants this feature off entirely to save resources.
        // This stops both DB writes (storage) and calculation overhead.
        if (configs.auto_tweet_vol !== 'true') {
            // console.log('[Event Processor] Volume Surge detection disabled by config (auto_tweet_vol).');
            return;
        }

        const volConfig = configs.volume_surge_settings || { multiplier: 2.0, period: 10, min_volume: 1000 };
        const { multiplier, period, min_volume } = typeof volConfig === 'string' ? JSON.parse(volConfig) : volConfig;

        const mcThresholdRank = parseInt(configs.technical_mc_threshold_rank || '200');

        // Fetch Top X companies by Market Cap
        const topSymbolsRes = await client.query(`
            SELECT symbol FROM company_profiles 
            WHERE asset_type = 'pk-equity' AND market_cap IS NOT NULL 
            ORDER BY market_cap DESC LIMIT $1
        `, [mcThresholdRank]);
        const topSymbols = new Set(topSymbolsRes.rows.map(r => r.symbol));

        // Filter candidates
        const filteredCandidates = candidates.filter(c => topSymbols.has(c.symbol));
        if (filteredCandidates.length === 0) return;

        const symbols = filteredCandidates.map(c => c.symbol);
        const today = new Date().toISOString().split('T')[0];

        // 1. Fetch historical volume (using dynamic period)
        const historyRes = await client.query(`
            SELECT symbol, volume, date
            FROM (
                SELECT symbol, volume, date,
                       ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) as rn
                FROM historical_price_data
                WHERE symbol = ANY($1) 
                  AND asset_type = 'pk-equity'
                  AND date < $2
            ) t
            WHERE rn <= $3
        `, [symbols, today, period]);

        const historyMap = new Map<string, number[]>();
        historyRes.rows.forEach(r => {
            const vols = historyMap.get(r.symbol) || [];
            vols.push(parseFloat(r.volume));
            historyMap.set(r.symbol, vols);
        });

        const surges: { symbol: string, current: number, avg: number, price: number }[] = [];

        for (const cand of filteredCandidates) {
            const vols = historyMap.get(cand.symbol);
            // Need at least 50% of the period for a meaningful average
            if (!vols || vols.length < Math.max(3, Math.floor(period / 2))) continue;

            const avgVolume = vols.reduce((a, b) => a + b, 0) / vols.length;

            // Use dynamic multiplier and min_volume
            if (cand.volume > multiplier * avgVolume && avgVolume > min_volume) {
                surges.push({ symbol: cand.symbol, current: cand.volume, avg: avgVolume, price: cand.price });
            }
        }

        if (surges.length === 0) return;

        console.log(`[Event Processor] Found ${surges.length} potential volume surges.`);

        // 2. Batch Check Persistence & Queue Status
        const surgeSymbols = surges.map(s => s.symbol);

        const [existingEventsRes, existingQueueRes] = await Promise.all([
            client.query(`
                SELECT symbol FROM notable_events 
                WHERE symbol = ANY($1) AND event_type = 'VOLUME_SURGE' AND created_at::date = CURRENT_DATE
            `, [surgeSymbols]),
            client.query(`
                SELECT symbol FROM event_queue 
                WHERE symbol = ANY($1) AND event_type = 'VOLUME_SURGE' AND status = 'PENDING'
            `, [surgeSymbols])
        ]);

        const existingEventsMap = new Set(existingEventsRes.rows.map(r => r.symbol));
        const existingQueueMap = new Set(existingQueueRes.rows.map(r => r.symbol));

        // 3. Filter and Queue
        const validSurges = surges.filter(s => !existingEventsMap.has(s.symbol) && !existingQueueMap.has(s.symbol));

        if (validSurges.length > 0) {
            const queueValues = validSurges.flatMap(s => [s.symbol, 'VOLUME_SURGE', s.current, s.avg, s.price]);
            const queuePlaceholders = validSurges.map((_, i) =>
                `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5}, 'PENDING')`
            ).join(',');

            await client.query(`
                INSERT INTO event_queue (symbol, event_type, trigger_value, previous_value, close_price, status)
                VALUES ${queuePlaceholders}
            `, queueValues);

            validSurges.forEach(s => console.log(`[Event Queued] ${s.symbol} VOLUME_SURGE`));
        }

    } catch (e) {
        console.error('[Event Processor] Volume Surge Error:', e);
    } finally {
        client.release();
    }
}
