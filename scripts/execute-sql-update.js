const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    const pool = new Pool({
        connectionString,
        ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });

    const sqlPath = path.resolve(process.cwd(), 'scripts/update_twitter_ready_prompts.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('🚀 Executing SQL update for Twitter-ready prompts...');

    try {
        await pool.query(sql);
        console.log('✅ AI Prompts updated successfully.');
    } catch (error) {
        console.error('❌ Failed to update AI Prompts:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

run();
