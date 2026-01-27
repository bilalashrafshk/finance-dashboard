
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
        const migrationFile = process.argv[2];
        if (!migrationFile) {
            throw new Error('Please provide migration filename as argument');
        }
        console.log(`Applying migration: ${migrationFile}...`);
        const sql = fs.readFileSync(path.join(__dirname, `../lib/db/migrations/${migrationFile}`), 'utf8');
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
