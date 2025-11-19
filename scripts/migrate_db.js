require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (!connectionString) {
    console.error('❌ No database connection string found in .env.local (DATABASE_URL or POSTGRES_URL)');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected.');

    // Read the schema file
    const schemaPath = path.join(__dirname, '../lib/portfolio/financial-schema.sql');
    console.log(`📖 Reading schema from: ${schemaPath}`);
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // Execute the SQL
    console.log('🚀 Executing migration...');
    await client.query(schemaSql);
    console.log('✅ Migration completed successfully!');

  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await client.end();
  }
}

migrate();

