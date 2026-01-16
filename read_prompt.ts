import { getPool } from './lib/db';
require('dotenv').config({ path: '.env.local' });

async function readPrompt() {
    const pool = getPool();
    try {
        const res = await pool.query("SELECT slug, content FROM ai_prompts LIMIT 1");
        console.log('Prompt:', res.rows[0]);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

readPrompt();
