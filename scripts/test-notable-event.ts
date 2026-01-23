
import { generateHeadline } from '../lib/ai-service';
import { getEventHeadlinePrompt } from '../lib/ai-prompts';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runTest() {
    console.log('🧪 Starting Integration Test for Notable Events...');

    // 1. Test AI Generation
    console.log('🤖 Testing AI Headline Generation...');
    const symbol = 'TEST_TICKER';
    const eventType = 'ATH';
    const price = 500.50;
    const prevRecord = 500.00;

    const prompt = await getEventHeadlinePrompt(symbol, eventType, price, prevRecord, price); // Test with close = high
    const headline = await generateHeadline(prompt);

    console.log('📝 Generated Headline:', headline);

    if (headline.includes('AI Unavailable')) {
        console.error('❌ AI Failed: returned fallback message.');
        process.exit(1);
    }

    // 2. Test DB Insertion
    console.log('💾 Testing Database Insertion...');
    const client = await pool.connect();
    try {
        await client.query(`
      INSERT INTO notable_events (symbol, event_type, headline, summary, description, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
            symbol,
            eventType,
            headline,
            `Test summary`,
            `Test event description`,
            { test: true, time: new Date().toISOString() }
        ]);
        console.log('✅ Event inserted into database.');
    } catch (err) {
        console.error('❌ Database Insert Failed:', err);
        process.exit(1);
    } finally {
        client.release();
    }

    console.log('🎉 Test Completed Successfully!');
    await pool.end();
}

runTest();
