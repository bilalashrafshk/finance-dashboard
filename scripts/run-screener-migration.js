const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function runMigration() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
        ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });

    try {
        const client = await pool.connect();
        console.log('Connected to database...');

        const sqlPath = path.join(__dirname, 'expand-screener-metrics.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running migration...');
        await client.query(sql);
        console.log('Migration completed successfully!');

        client.release();
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

runMigration();
