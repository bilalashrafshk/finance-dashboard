
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Applying migration...');
        const sql = fs.readFileSync(path.join(__dirname, '../lib/db/migrations/20260121_add_sentiment_index.sql'), 'utf8');
        await client.query(sql);
        console.log('✅ Migration applied successfully.');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
