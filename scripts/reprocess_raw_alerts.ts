
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load envs
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
    console.error('No DATABASE_URL or POSTGRES_URL found in env');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
});

const DRY_RUN = !process.argv.includes('--execute');

async function reprocessRawAlerts() {
    const client = await pool.connect();
    try {
        console.log(`\n🔄 Starting Smart Retry for Raw Alerts ${DRY_RUN ? '(DRY RUN)' : '(EXECUTE)'}...`);

        // 1. Get Priority Criteria
        const configRes = await client.query("SELECT key, value FROM alert_configs WHERE key IN ('priority_keywords', 'priority_whitelist', 'fundamental_mc_threshold_rank', 'enable_multimodal_analysis')");
        const configs = configRes.rows.reduce((acc: any, row: any) => {
            acc[row.key] = row.value;
            return acc;
        }, {});

        const PRIORITY_KEYWORDS: string[] = Array.isArray(configs.priority_keywords) ? configs.priority_keywords : JSON.parse(configs.priority_keywords || '[]');
        const PRIORITY_WHITELIST: string[] = Array.isArray(configs.priority_whitelist) ? configs.priority_whitelist : JSON.parse(configs.priority_whitelist || '[]');
        const MC_THRESHOLD_RANK = configs.fundamental_mc_threshold_rank || 100;
        const GLOBAL_MULTIMODAL = configs.enable_multimodal_analysis === true || configs.enable_multimodal_analysis === 'true';

        console.log(`Global Multimodal: ${GLOBAL_MULTIMODAL}`);

        if (!GLOBAL_MULTIMODAL) {
            console.warn('⚠️  Global Multimodal is DISABLED. Reprocessing won\'t help unless you enable it first.');
        }

        // 2. Find Raw Alerts (is_raw_alert = true OR metadata->'ai_analysis'->>'is_raw_alert' = true)
        // We look for events in 'notable_events' that are 'fundamental_alert'
        const rawEventsRes = await client.query(`
            SELECT id, symbol, headline, metadata, created_at
            FROM notable_events
            WHERE event_type = 'fundamental_alert'
            AND (
                metadata->'ai_analysis'->>'is_raw_alert' = 'true'
                OR
                summary ILIKE '%See attached filing%'
                OR 
                summary ILIKE '%AI Skipped%'
            )
            AND created_at > NOW() - INTERVAL '7 days'
            ORDER BY created_at DESC
        `);

        if (rawEventsRes.rows.length === 0) {
            console.log('No raw alerts found in the last 7 days.');
            return;
        }

        console.log(`Found ${rawEventsRes.rows.length} potential raw alerts.`);

        // 3. Filter for Priority Symbols
        // Need Top N Symbols
        const topCompaniesRes = await client.query(
            "SELECT symbol FROM company_profiles WHERE market_cap IS NOT NULL ORDER BY market_cap DESC LIMIT $1",
            [MC_THRESHOLD_RANK]
        );
        const topSymbols = topCompaniesRes.rows.map((r: any) => r.symbol);

        const toReset: any[] = [];

        for (const event of rawEventsRes.rows) {
            const symbol = event.symbol;
            const headline = event.headline;

            // Check Priority
            const isTopCap = topSymbols.includes(symbol);
            const isWhitelisted = PRIORITY_WHITELIST.includes(symbol);
            const isKeywordMatch = PRIORITY_KEYWORDS.some(k => headline.toLowerCase().includes(k.toLowerCase()));

            const isPriority = isTopCap || isWhitelisted || isKeywordMatch;

            if (isPriority) {
                console.log(`✅ [TARGET] ${symbol}: ${headline} (Priority: Cap=${isTopCap}, WL=${isWhitelisted}, KW=${isKeywordMatch})`);
                toReset.push(event);
            } else {
                // console.log(`❌ [SKIP] ${symbol}: ${headline} (Not Priority)`);
            }
        }

        console.log(`\nIdentified ${toReset.length} alerts to reset.`);

        if (toReset.length === 0) return;

        if (DRY_RUN) {
            console.log('\n[DRY RUN] Would delete these notable_events and reset their event_queue status to PENDING.');
            console.log('Run with --execute to perform action.');
        } else {
            console.log('\n[EXECUTE] Resetting alerts...');
            let resetCount = 0;

            for (const event of toReset) {
                try {
                    // A. Delete from notable_events
                    await client.query("DELETE FROM notable_events WHERE id = $1", [event.id]);

                    // B. Find original queue item (approx match by symbol and time)
                    // Or if we stored queue_id in metadata? 
                    // Usually we don't store queue_id in notable_events metadata for fundamental (we do for technical).
                    // We try to match by symbol and recent time window in event_queue

                    // Logic: Find most recent PROCESSED/SKIPPED queue item for this symbol with similar metadata title
                    // metadata->'psx_title' should match roughly headline

                    const queueRes = await client.query(`
                        SELECT id FROM event_queue 
                        WHERE symbol = $1 
                        AND event_type = 'fundamental_alert'
                        AND (metadata->>'psx_title' = $2::text OR metadata->>'title' = $2::text)
                        ORDER BY created_at DESC
                        LIMIT 1
                    `, [event.symbol, event.headline]);

                    if (queueRes.rows.length > 0) {
                        const queueId = queueRes.rows[0].id;
                        await client.query("UPDATE event_queue SET status = 'PENDING', processed_at = NULL WHERE id = $1", [queueId]);
                        console.log(`   Refreshed Queue #${queueId} for ${event.symbol}`);
                        resetCount++;
                    } else {
                        console.warn(`   ⚠️ Could not find original queue item for ${event.symbol}. Manual re-queue needed.`);
                        // Optional: Insert new queue item? No, let's keep it safe.
                    }

                } catch (err: any) {
                    console.error(`   ❌ Failed to reset ${event.symbol}: ${err.message}`);
                }
            }
            console.log(`\nSuccessfully reset ${resetCount} alerts.`);
        }

    } catch (e: any) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

reprocessRawAlerts();
