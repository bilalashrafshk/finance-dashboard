const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

async function check() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT h.symbol, s.updated_at
      FROM historical_price_data h
      LEFT JOIN screener_metrics s ON h.symbol = s.symbol AND s.asset_type = 'pk-equity'
      WHERE h.asset_type = 'pk-equity'
      GROUP BY h.symbol, s.updated_at
      ORDER BY s.updated_at ASC NULLS FIRST, h.symbol ASC
      LIMIT 30
    `);
    console.table(res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
