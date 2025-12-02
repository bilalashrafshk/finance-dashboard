
import { Pool } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { calculateHoldingsFromTransactions } from './lib/portfolio/transaction-utils';

// Load environment variables from .env.local first, then .env
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error('No DATABASE_URL provided');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();

  try {
    console.log('Starting holdings sync...');
    
    // Get all users
    const usersRes = await client.query('SELECT id FROM users');
    const users = usersRes.rows;
    console.log(`Found ${users.length} users to sync.`);

    for (const user of users) {
      console.log(`Syncing user ${user.id}...`);
      
      try {
        await client.query('BEGIN');

        // 1. Fetch trades
        const tradesResult = await client.query(
          `SELECT id, user_id, holding_id, trade_type, asset_type, symbol, name, quantity,
                  price, total_amount, currency, trade_date, notes, created_at
           FROM user_trades
           WHERE user_id = $1
           ORDER BY trade_date ASC, created_at ASC`,
          [user.id]
        );

        const trades = tradesResult.rows.map(row => ({
          id: row.id,
          userId: row.user_id,
          holdingId: row.holding_id,
          tradeType: row.trade_type,
          assetType: row.asset_type,
          symbol: row.symbol,
          name: row.name,
          quantity: parseFloat(row.quantity),
          price: parseFloat(row.price),
          totalAmount: parseFloat(row.total_amount),
          currency: row.currency,
          tradeDate: row.trade_date.toISOString().split('T')[0],
          notes: row.notes,
          createdAt: row.created_at.toISOString(),
        }));

        // 2. Calculate holdings
        const calculatedHoldings = calculateHoldingsFromTransactions(trades);

        // 3. Sync DB
        
        // Get existing holdings
        const existingHoldingsResult = await client.query(
          `SELECT id, asset_type, symbol, currency FROM user_holdings WHERE user_id = $1`,
          [user.id]
        );
        
        const existingMap = new Map();
        existingHoldingsResult.rows.forEach(row => {
          const key = `${row.asset_type}:${row.symbol}:${row.currency}`;
          existingMap.set(key, row.id);
        });
        
        const processedIds = new Set();

        for (const holding of calculatedHoldings) {
          const key = `${holding.assetType}:${holding.symbol}:${holding.currency}`;
          const existingId = existingMap.get(key);
          
          if (existingId) {
            await client.query(
              `UPDATE user_holdings 
               SET quantity = $1, purchase_price = $2, purchase_date = $3, updated_at = NOW()
               WHERE id = $4`,
              [holding.quantity, holding.purchasePrice, holding.purchaseDate, existingId]
            );
            processedIds.add(existingId);
          } else {
            if (holding.quantity > 0 || holding.assetType === 'cash') {
              await client.query(
                `INSERT INTO user_holdings 
                 (user_id, asset_type, symbol, name, quantity, purchase_price, purchase_date, current_price, currency, notes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                  user.id, 
                  holding.assetType, 
                  holding.symbol, 
                  holding.name, 
                  holding.quantity, 
                  holding.purchasePrice, 
                  holding.purchaseDate, 
                  holding.currentPrice || holding.purchasePrice, 
                  holding.currency, 
                  holding.notes || null
                ]
              );
            }
          }
        }

        // Delete removed
        for (const [key, id] of existingMap.entries()) {
          if (!processedIds.has(id)) {
             await client.query(`DELETE FROM user_holdings WHERE id = $1`, [id]);
          }
        }

        await client.query('COMMIT');
        console.log(`User ${user.id} synced successfully.`);
        
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error syncing user ${user.id}:`, err);
      }
    }
    
    console.log('Sync completed.');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

