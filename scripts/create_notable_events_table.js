
const { Pool } = require('pg');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Creating notable_events table...');

        await client.query(`
      CREATE TABLE IF NOT EXISTS notable_events (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(50) NOT NULL,
        event_type VARCHAR(50) NOT NULL, -- 'ATH', '52W_HIGH', 'VOL_SPIKE'
        headline TEXT NOT NULL,
        summary TEXT,
        description TEXT,
        metadata JSONB, -- store raw prices, old values
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_notable_events_created_at ON notable_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notable_events_symbol ON notable_events(symbol);
    `);

        console.log('Migration successful: notable_events table created.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
