
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

async function debugDINT() {
    const client = await pool.connect();
    try {
        console.log('🔍 Analyzing DINT Alert...');

        // 1. Fetch Event
        const res = await client.query(`
            SELECT id, headline, metadata, created_at
            FROM notable_events 
            WHERE symbol = 'DINT'
            ORDER BY created_at DESC
            LIMIT 1
        `);

        if (res.rows.length === 0) {
            console.log('No recent DINT event found.');
            return;
        }

        const event = res.rows[0];
        console.log(`\nHeadline: "${event.headline}"`);
        console.log(`Created At: ${event.created_at}`);

        // 2. Fetch Configs
        const configRes = await client.query("SELECT key, value FROM alert_configs WHERE key IN ('priority_keywords', 'priority_whitelist')");
        const configs = configRes.rows.reduce((acc: any, row: any) => {
            acc[row.key] = row.value;
            return acc;
        }, {});

        const priorityKeywords = Array.isArray(configs.priority_keywords) ? configs.priority_keywords : JSON.parse(configs.priority_keywords || '[]');
        const whitelist = Array.isArray(configs.priority_whitelist) ? configs.priority_whitelist : JSON.parse(configs.priority_whitelist || '[]');

        // Check Trigger
        console.log('\n--- TRIGGER ANALYSIS ---');
        console.log(`Whitelist includes DINT? ${whitelist.includes('DINT')}`);

        const matchedKw = priorityKeywords.find((k: string) => event.headline.toLowerCase().includes(k.toLowerCase()));
        console.log(`Keyword Match? ${matchedKw ? `YES (${matchedKw})` : 'NO'}`);

        // Note: The PSX Title might be different from "headline" (which is AI generated).
        // Let's check metadata for original title.
        const meta = event.metadata;
        const rawTitle = (meta as any)?.title || (meta as any)?.psx_title || 'Unknown';
        console.log(`Raw PSX Title: "${rawTitle}"`);

        const matchedKwRaw = priorityKeywords.find((k: string) => rawTitle.toLowerCase().includes(k.toLowerCase()));
        console.log(`Raw Title Keyword Match? ${matchedKwRaw ? `YES (${matchedKwRaw})` : 'NO'}`);


    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

debugDINT();
