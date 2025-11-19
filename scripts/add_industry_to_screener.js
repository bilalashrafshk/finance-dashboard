const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

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
    console.log('Adding industry columns to screener_metrics table...');
    
    // Add industry column if it doesn't exist
    await client.query(`
      ALTER TABLE screener_metrics 
      ADD COLUMN IF NOT EXISTS industry VARCHAR(100)
    `);
    
    // Add industry_pe column if it doesn't exist
    await client.query(`
      ALTER TABLE screener_metrics 
      ADD COLUMN IF NOT EXISTS industry_pe DECIMAL(10, 2)
    `);
    
    // Add relative_pe_industry column if it doesn't exist
    await client.query(`
      ALTER TABLE screener_metrics 
      ADD COLUMN IF NOT EXISTS relative_pe_industry DECIMAL(10, 2)
    `);
    
    // Add index for industry
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_screener_industry ON screener_metrics(industry)
    `);
    
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);

