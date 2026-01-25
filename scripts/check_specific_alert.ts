
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

async function checkSpecificAlerts() {
    const client = await pool.connect();
    try {
        const symbols = ['TCORP', 'KPUS'];
        console.log(`Checking alerts for: ${symbols.join(', ')}...`);

        // 1. Fetch Configs for Context
        const configRes = await client.query("SELECT key, value FROM alert_configs");
        const configs = configRes.rows.reduce((acc: any, row: any) => {
            acc[row.key] = row.value;
            return acc;
        }, {});

        const PRIORITY_KEYWORDS: string[] = configs.priority_keywords || [];
        const PRIORITY_WHITELIST: string[] = configs.priority_whitelist || [];
        const MC_THRESHOLD_RANK = configs.fundamental_mc_threshold_rank || 100;
        const GLOBAL_MULTIMODAL = configs.enable_multimodal_analysis;

        console.log('\n--- CONFIGS ---');
        console.log(`Multimodal Enabled: ${GLOBAL_MULTIMODAL}`);
        console.log(`MC Threshold: ${MC_THRESHOLD_RANK}`);
        console.log(`Some Keywords: ${PRIORITY_KEYWORDS.slice(0, 3)}...`);


        for (const symbol of symbols) {
            console.log(`\n\n=== ${symbol} ANALYSIS ===`);

            // A. Check Priority Status
            const profileRes = await client.query("SELECT market_cap FROM company_profiles WHERE symbol = $1", [symbol]);
            const mktCap = profileRes.rows[0]?.market_cap || 0;

            // Rank?
            const rankRes = await client.query(`
                SELECT count(*) as rank FROM company_profiles WHERE market_cap > $1
            `, [mktCap]);
            const rank = parseInt(rankRes.rows[0].rank) + 1;

            const isWhitelisted = PRIORITY_WHITELIST.includes(symbol);

            console.log(`Market Cap Rank: ${rank} (Threshold: ${MC_THRESHOLD_RANK})`);
            console.log(`Whitelisted: ${isWhitelisted}`);

            // B. Find Recent Event
            const eventRes = await client.query(`
                SELECT id, headline, metadata, created_at
                FROM notable_events 
                WHERE symbol = $1 
                AND event_type = 'fundamental_alert'
                ORDER BY created_at DESC 
                LIMIT 1
            `, [symbol]);

            if (eventRes.rows.length === 0) {
                console.log('No recent events found.');
                continue;
            }

            const event = eventRes.rows[0];
            const meta = event.metadata;
            const aiAnalysis = meta.ai_analysis || {};

            console.log(`\nEvent Found: "${event.headline}"`);
            console.log(`Time: ${event.created_at}`);
            console.log(`\n--- METADATA ---`);
            console.log(`Is Raw Alert? ${aiAnalysis.is_raw_alert}`);
            console.log(`Files Attached? ${aiAnalysis.debugMetadata?.attachedFiles?.length || 0}`);

            // Keyword check on actual headline
            const matchedKw = PRIORITY_KEYWORDS.find(k => event.headline.toLowerCase().includes(k.toLowerCase()));
            console.log(`Keyword Match? ${matchedKw ? `Yes (${matchedKw})` : 'No'}`);

            // Logic Re-evaluation
            const isPriority = rank <= MC_THRESHOLD_RANK || isWhitelisted || !!matchedKw;
            console.log(`\n> Should be Multimodal? ${GLOBAL_MULTIMODAL && isPriority}`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

checkSpecificAlerts();
