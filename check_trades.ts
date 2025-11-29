
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL)?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function checkTrades() {
    const client = await pool.connect();
    try {
        // Get trades for user 1 (assuming user 1 is the active user)
        const res = await client.query(`
      SELECT id, trade_date, asset_type, symbol, quantity, price, total_amount, created_at 
      FROM user_trades 
      WHERE user_id = 1 
      ORDER BY trade_date ASC 
      LIMIT 10
    `);

        console.log('First 10 trades:');
        res.rows.forEach(row => {
            console.log(`${row.trade_date.toISOString().split('T')[0]} - ${row.asset_type} ${row.symbol}: ${row.quantity} @ ${row.price} (Created: ${row.created_at.toISOString()})`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

checkTrades();
