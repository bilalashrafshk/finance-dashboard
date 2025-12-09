
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

const pool = new Pool({
    connectionString,
    ssl: connectionString?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function checkSchema() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name IN ('user_trades', 'user_holdings')
      ORDER BY table_name, column_name;
    `);

        console.log('Schema Information:');
        res.rows.forEach(row => {
            console.log(`${row.table_name}.${row.column_name}: ${row.data_type}`);
        });
    } catch (err) {
        console.error('Error checking schema:', err);
    } finally {
        client.release();
        pool.end();
    }
}

checkSchema();
