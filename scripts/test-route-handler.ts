import { Pool } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/user/portfolio/history/route';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function testRouteHandler() {
  console.log('🔍 Testing Route Handler Directly\n');

  // We need to mock the request with authentication
  // For now, let's test the core logic directly
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error('❌ No DATABASE_URL found');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();

  try {
    // Get first user
    const usersRes = await client.query('SELECT id FROM users LIMIT 1');
    if (usersRes.rows.length === 0) {
      console.error('❌ No users found');
      return;
    }

    const userId = usersRes.rows[0].id;
    console.log(`👤 User ID: ${userId}\n`);

    // Test the exact logic from the route
    const currency = 'USD';
    const unified = true;
    const days = 5;

    console.log(`📊 Testing: Currency=${currency}, Unified=${unified}, Days=${days}\n`);

    // Get exchange rate (exact code from route)
    let exchangeRate: number | null = null;
    if (unified) {
      try {
        const { getSBPEconomicData } = await import('../lib/portfolio/db-client');
        const exchangeResult = await getSBPEconomicData('TS_GP_ER_FAERPKR_M.E00220');
        if (exchangeResult && exchangeResult.data && exchangeResult.data.length > 0) {
          const sorted = [...exchangeResult.data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          exchangeRate = sorted[0].value;
          console.log(`✅ Exchange rate: ${exchangeRate} PKR/USD (Date: ${sorted[0].date})\n`);
        } else {
          console.log(`❌ No exchange rate data\n`);
        }
      } catch (error) {
        console.log(`❌ Error fetching exchange rate: ${error}\n`);
      }
    }

    // Get trades
    const tradesResult = await client.query(
      `SELECT id, user_id, holding_id, trade_type, asset_type, symbol, name, quantity,
              price, total_amount, currency, trade_date, notes, created_at
       FROM user_trades
       WHERE user_id = $1
       ORDER BY trade_date ASC, created_at ASC`,
      [userId]
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

    console.log(`📊 Total trades: ${trades.length}\n`);

    if (trades.length === 0) {
      console.log('❌ No trades found - API would return empty history\n');
      return;
    }

    // Continue with the rest of the route logic...
    // This is getting complex, let me create a simpler test that mimics the exact API response

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

testRouteHandler().catch(console.error);

