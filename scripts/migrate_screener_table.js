const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running migration to add screener_metrics table...');
    const schemaPath = path.join(__dirname, '../lib/portfolio/db-schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    // Extract just the screener_metrics table creation part to be safe/idempotent
    // or just run the whole file since it uses IF NOT EXISTS
    await client.query(schemaSql);
    
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

