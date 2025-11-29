
import { Pool } from 'pg';
import { calculateHoldingsFromTransactions } from './lib/portfolio/transaction-utils';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL)?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function investigate() {
    const client = await pool.connect();
    try {
        // Get a user ID (assuming single user or first user for now, or hardcode if known)
        // Let's get the user with the most trades
        const userRes = await client.query(`
      SELECT user_id, COUNT(*) as count 
      FROM user_trades 
      GROUP BY user_id 
      ORDER BY count DESC 
      LIMIT 1
    `);

        if (userRes.rows.length === 0) {
            console.log('No trades found in the database.');
            return;
        }

        const userId = userRes.rows[0].user_id;
        console.log(`Investigating for User ID: ${userId}`);

        // 1. Get all trades
        const tradesRes = await client.query(`
      SELECT * FROM user_trades WHERE user_id = $1 ORDER BY trade_date ASC
    `, [userId]);
        console.log(`Found ${tradesRes.rows.length} trades.`);

        // 2. Calculate expected holdings
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

        const expectedHoldings = calculateHoldingsFromTransactions(trades);
        console.log(`Calculated ${expectedHoldings.length} expected holdings from trades.`);
        expectedHoldings.forEach(h => {
            console.log(`- Expected: ${h.symbol} (${h.assetType}): ${h.quantity}`);
        });

        // 3. Get actual holdings from user_holdings table
        const holdingsRes = await client.query(`
      SELECT * FROM user_holdings WHERE user_id = $1
    `, [userId]);
        console.log(`Found ${holdingsRes.rows.length} records in user_holdings table.`);

        holdingsRes.rows.forEach(h => {
            console.log(`- Actual: ${h.symbol} (${h.asset_type}): ${h.quantity}`);
        });

        // 4. Compare
        console.log('\n--- Discrepancies ---');
        let discrepancyFound = false;

        // Check missing in actual
        for (const expected of expectedHoldings) {
            const actual = holdingsRes.rows.find(h =>
                h.asset_type === expected.assetType &&
                h.symbol === expected.symbol &&
                h.currency === expected.currency
            );

            if (!actual) {
                console.log(`MISSING in DB: ${expected.symbol} (${expected.assetType}) - Expected Qty: ${expected.quantity}`);
                discrepancyFound = true;
            } else if (Math.abs(parseFloat(actual.quantity) - expected.quantity) > 0.0001) {
                console.log(`MISMATCH: ${expected.symbol} (${expected.assetType}) - Expected: ${expected.quantity}, Actual: ${actual.quantity}`);
                discrepancyFound = true;
            }
        }

        if (!discrepancyFound) {
            console.log('No discrepancies found for this user.');
        }

    } catch (error) {
        console.error('Investigation failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

investigate();
