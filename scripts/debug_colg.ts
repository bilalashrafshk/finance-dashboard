
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function debugCOLG() {
    const client = await pool.connect();
    try {
        console.log('🔍 Analyzing COLG Alert...');

        // 1. Fetch Event
        const res = await client.query(`
            SELECT id, metadata, created_at
            FROM event_queue 
            WHERE symbol = 'COLG'
            AND status = 'PROCESSED'
            ORDER BY created_at DESC
            LIMIT 1
        `);

        if (res.rows.length === 0) {
            console.log('No recent COLG event found in history.');
            return;
        }

        const task = typeof res.rows[0].metadata === 'string'
            ? JSON.parse(res.rows[0].metadata)
            : res.rows[0].metadata;

        console.log(`\nRaw Title: "${task.title}"`);

        // 2. Check Rank
        const profileRes = await client.query("SELECT market_cap FROM company_profiles WHERE symbol = 'COLG'");
        const mktCap = profileRes.rows[0]?.market_cap || 0;
        const rankRes = await client.query(`SELECT count(*) as rank FROM company_profiles WHERE market_cap > $1`, [mktCap]);
        const rank = parseInt(rankRes.rows[0].rank) + 1;
        console.log(`Rank: ${rank}`);

        // 3. Check Configs
        const configRes = await client.query("SELECT value FROM alert_configs WHERE key = 'priority_keywords'");
        const priorityKeywords = Array.isArray(configRes.rows[0].value) ? configRes.rows[0].value : JSON.parse(configRes.rows[0].value || '[]');
        const thresholdRes = await client.query("SELECT value FROM alert_configs WHERE key = 'fundamental_mc_threshold_rank'");
        const threshold = parseInt(thresholdRes.rows[0].value || '100');

        console.log(`Threshold: ${threshold}`);

        // 4. Analysis
        const matchedKw = priorityKeywords.find((k: string) => task.title.toLowerCase().includes(k.toLowerCase()));
        console.log(`Keyword Match? ${matchedKw ? `YES (${matchedKw})` : 'NO'}`);
        console.log(`Is Priority (Top ${threshold})? ${rank <= threshold}`);

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

debugCOLG();
