
import { Pool } from 'pg';
import { calculateHoldingsFromTransactions } from './lib/portfolio/transaction-utils';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL)?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function syncHoldings() {
    const client = await pool.connect();
    try {
        console.log('Starting holdings sync...');

        // Get all users
        const usersRes = await client.query('SELECT id FROM users');
        const users = usersRes.rows;
        console.log(`Found ${users.length} users.`);

        for (const user of users) {
            const userId = user.id;
            console.log(`Syncing for User ID: ${userId}`);

            // 1. Get all trades
            const tradesRes = await client.query(`
            SELECT * FROM user_trades WHERE user_id = $1 ORDER BY trade_date ASC, created_at ASC
        `, [userId]);

            if (tradesRes.rows.length === 0) {
                console.log(`- No trades for user ${userId}, skipping.`);
                continue;
            }

            const trades = tradesRes.rows.map(row => ({
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
                tradeDate: row.trade_date.toISOString(),
                notes: row.notes,
                createdAt: row.created_at.toISOString(),
            }));

            // 2. Calculate correct holdings
            const calculatedHoldings = calculateHoldingsFromTransactions(trades);
            console.log(`- Calculated ${calculatedHoldings.length} holdings.`);

            // 3. Update DB
            await client.query('BEGIN');

            // Clear existing holdings for this user (except maybe cash if we want to be careful, but calculation includes cash)
            // Actually, let's just delete all and re-insert to be clean.
            await client.query('DELETE FROM user_holdings WHERE user_id = $1', [userId]);

            for (const holding of calculatedHoldings) {
                await client.query(`
                INSERT INTO user_holdings 
                (user_id, asset_type, symbol, name, quantity, purchase_price, purchase_date, current_price, currency, notes, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [
                    userId,
                    holding.assetType,
                    holding.symbol,
                    holding.name,
                    holding.quantity,
                    holding.purchasePrice,
                    holding.purchaseDate,
                    holding.currentPrice, // This will be the avg purchase price initially, which is fine
                    holding.currency,
                    holding.notes,
                    holding.createdAt,
                    holding.updatedAt
                ]);
            }

            await client.query('COMMIT');
            console.log(`- Successfully synced user ${userId}`);
        }

        console.log('Sync completed successfully.');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Sync failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

syncHoldings();
