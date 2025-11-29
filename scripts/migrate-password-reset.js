require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (!connectionString) {
    throw new Error('No database connection string found in .env.local (DATABASE_URL or POSTGRES_URL)');
  }

  const client = new Client({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    await client.connect();

    const schemaPath = path.join(__dirname, '../lib/auth/password-reset-schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    await client.query(schemaSql);
  } catch (err) {
    throw err;
  } finally {
    await client.end();
  }
}

migrate().catch((error) => {
  process.exit(1);
});

