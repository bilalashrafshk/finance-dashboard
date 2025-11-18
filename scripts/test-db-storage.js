require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function test() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL not found');
    process.exit(1);
  }
  
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });
  
  try {
    const client = await pool.connect();
    console.log('✅ Connected to database\n');
    
    // Check for BTCUSDT data
    const btcResult = await client.query(
      'SELECT COUNT(*) as count FROM historical_price_data WHERE asset_type = $1 AND symbol = $2',
      ['crypto', 'BTCUSDT']
    );
    console.log(`📊 BTCUSDT records in DB: ${btcResult.rows[0].count}`);
    
    // Check metadata
    const btcMeta = await client.query(
      'SELECT * FROM historical_data_metadata WHERE asset_type = $1 AND symbol = $2',
      ['crypto', 'BTCUSDT']
    );
    if (btcMeta.rows[0]) {
      console.log(`📋 BTCUSDT metadata:`, {
        last_stored_date: btcMeta.rows[0].last_stored_date,
        total_records: btcMeta.rows[0].total_records,
        source: btcMeta.rows[0].source
      });
    } else {
      console.log('📋 BTCUSDT metadata: none');
    }
    
    // Check for PTC data
    const ptcResult = await client.query(
      'SELECT COUNT(*) as count FROM historical_price_data WHERE asset_type = $1 AND symbol = $2',
      ['pk-equity', 'PTC']
    );
    console.log(`\n📊 PTC records in DB: ${ptcResult.rows[0].count}`);
    
    const ptcMeta = await client.query(
      'SELECT * FROM historical_data_metadata WHERE asset_type = $1 AND symbol = $2',
      ['pk-equity', 'PTC']
    );
    if (ptcMeta.rows[0]) {
      console.log(`📋 PTC metadata:`, {
        last_stored_date: ptcMeta.rows[0].last_stored_date,
        total_records: ptcMeta.rows[0].total_records,
        source: ptcMeta.rows[0].source
      });
    } else {
      console.log('📋 PTC metadata: none');
    }
    
    // Show sample records
    const sample = await client.query(
      'SELECT date, close FROM historical_price_data WHERE asset_type = $1 AND symbol = $2 ORDER BY date DESC LIMIT 5',
      ['crypto', 'BTCUSDT']
    );
    if (sample.rows.length > 0) {
      console.log('\n📅 Sample BTCUSDT records (latest 5):');
      sample.rows.forEach(row => {
        console.log(`   ${row.date}: ${row.close}`);
      });
    }
    
    client.release();
    await pool.end();
    console.log('\n✅ Test complete');
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

test();




