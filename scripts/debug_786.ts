
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

async function debug786() {
    const client = await pool.connect();
    try {
        console.log('🔍 Analyzing 786 Investments Alert...');

        // 1. Fetch Event
        // Searching for 786 in the last few hours
        const res = await client.query(`
            SELECT id, headline, metadata, created_at
            FROM notable_events 
            WHERE symbol LIKE '%786%' OR headline LIKE '%786%'
            ORDER BY created_at DESC
            LIMIT 1
        `);

        if (res.rows.length === 0) {
            console.log('No recent 786 event found.');
            return;
        }

        const event = res.rows[0];
        console.log(`\nHeadline: "${event.headline}"`);
        console.log(`Created At: ${event.created_at}`);

        // 2. Fetch Configs (Ignore Keywords)
        const configRes = await client.query("SELECT value FROM alert_configs WHERE key = 'ignore_keywords'");
        const ignoreList = Array.isArray(configRes.rows[0].value) ? configRes.rows[0].value : JSON.parse(configRes.rows[0].value || '[]');

        console.log('\nIgnore List contains "Credit of"?', ignoreList.includes('Credit of'));

        // 3. Test Match
        const titleLower = event.headline.toLowerCase();
        const matched = ignoreList.find((k: string) => titleLower.includes(k.toLowerCase()));

        console.log(`\nDoes headline match Ignore List? ${matched ? `YES (${matched})` : 'NO'}`);

        if (matched) {
            console.log('⚠️  This SHOULD have been ignored. Why wasn\'t it?');
            console.log('Checking event_queue for this item to see skipped_reason if any...');

            // Check queue for duplicate attempt?
            // Or maybe the scraper title was different?
            // In notable_events, 'headline' might be the AI generated one.
            // We need the RAW PSX Title from metadata.
            const rawTitle = event.metadata?.id ? '?' : (event.metadata as any)?.title || (event.metadata as any)?.psx_title; // Accessing metadata assuming it mirrors structure
            // Actually metadata in notable_events is usually { ai_analysis: ..., link: ..., sector: ... }
            // The raw title isn't always preserved in top-level metadata unless we check queue.

            // Let's check the logic with the HEADLINE provided.
            // If AI rewrote the headline, the ORIGINAL title might not have had "Credit of"? 
            // "Credit of Right Shares" sounds like the original title.
        }

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

debug786();
