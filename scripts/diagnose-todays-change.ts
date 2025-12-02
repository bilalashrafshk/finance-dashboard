import { Pool } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { calculateHoldingsFromTransactions } from '../lib/portfolio/transaction-utils';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function diagnoseTodaysChange() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error('❌ No DATABASE_URL found in environment');
    process.exit(1);
  }

  console.log('✅ Database URL found');
  console.log('🔍 Starting diagnosis...\n');

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();

  try {
    // Get first user (or you can specify a user ID)
    const usersRes = await client.query('SELECT id FROM users LIMIT 1');
    if (usersRes.rows.length === 0) {
      console.error('❌ No users found in database');
      return;
    }

    const userId = usersRes.rows[0].id;
    console.log(`👤 Using user ID: ${userId}\n`);

    // Get all trades
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

    console.log(`📊 Total trades: ${trades.length}`);
    if (trades.length === 0) {
      console.log('❌ No trades found - this is why Today\'s Change is blank!');
      return;
    }

    // Get today and yesterday dates
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    console.log(`📅 Today: ${todayStr}`);
    console.log(`📅 Yesterday: ${yesterdayStr}\n`);

    // Calculate holdings for today
    const tradesUntilToday = trades.filter(t => t.tradeDate <= todayStr);
    const holdingsToday = calculateHoldingsFromTransactions(tradesUntilToday);

    console.log(`💼 Holdings today: ${holdingsToday.length}`);
    holdingsToday.forEach(h => {
      console.log(`   - ${h.symbol} (${h.assetType}): ${h.quantity} @ ${h.currency}`);
    });

    // Calculate holdings for yesterday
    const tradesUntilYesterday = trades.filter(t => t.tradeDate <= yesterdayStr);
    const holdingsYesterday = calculateHoldingsFromTransactions(tradesUntilYesterday);

    console.log(`\n💼 Holdings yesterday: ${holdingsYesterday.length}`);
    holdingsYesterday.forEach(h => {
      console.log(`   - ${h.symbol} (${h.assetType}): ${h.quantity} @ ${h.currency}`);
    });

    // Check cash flows
    const cashFlows = trades.filter(t => 
      (t.tradeType === 'add' || t.tradeType === 'remove') && 
      t.tradeDate === todayStr
    );
    
    const todayCashFlow = cashFlows.reduce((sum, t) => {
      return sum + (t.tradeType === 'add' ? t.totalAmount : -t.totalAmount);
    }, 0);

    console.log(`\n💰 Today's cash flow: ${todayCashFlow}`);

    // Try to get portfolio values from the API logic
    // For now, let's just check if we can calculate basic values
    console.log('\n🔍 Checking if API endpoint would return data...');
    console.log('   (This requires historical price data which we\'ll check next)');

    // Check for historical price data
    const uniqueAssets = new Set<string>();
    holdingsToday.forEach(h => {
      if (h.assetType !== 'cash') {
        uniqueAssets.add(`${h.assetType}:${h.symbol.toUpperCase()}:${h.currency}`);
      }
    });

    console.log(`\n📈 Unique assets to check: ${uniqueAssets.size}`);
    
    for (const assetKey of uniqueAssets) {
      const [assetType, symbol, currency] = assetKey.split(':');
      console.log(`\n   Checking ${assetKey}:`);
      
      // Check if we have price data for today
      const todayPriceResult = await client.query(
        `SELECT close, date FROM historical_price_data 
         WHERE asset_type = $1 AND symbol = $2 AND date = $3`,
        [assetType, symbol, todayStr]
      );
      
      if (todayPriceResult.rows.length > 0) {
        console.log(`      ✅ Today's price: ${todayPriceResult.rows[0].close}`);
      } else {
        console.log(`      ❌ No price data for today`);
        
        // Check latest available price
        const latestPriceResult = await client.query(
          `SELECT close, date FROM historical_price_data 
           WHERE asset_type = $1 AND symbol = $2 
           ORDER BY date DESC LIMIT 1`,
          [assetType, symbol]
        );
        
        if (latestPriceResult.rows.length > 0) {
          console.log(`      📊 Latest available: ${latestPriceResult.rows[0].date} @ ${latestPriceResult.rows[0].close}`);
        } else {
          console.log(`      ❌ No historical price data at all`);
        }
      }

      // Check if we have price data for yesterday
      const yesterdayPriceResult = await client.query(
        `SELECT close, date FROM historical_price_data 
         WHERE asset_type = $1 AND symbol = $2 AND date = $3`,
        [assetType, symbol, yesterdayStr]
      );
      
      if (yesterdayPriceResult.rows.length > 0) {
        console.log(`      ✅ Yesterday's price: ${yesterdayPriceResult.rows[0].close}`);
      } else {
        console.log(`      ❌ No price data for yesterday`);
      }
    }

    console.log('\n📋 Summary:');
    console.log(`   - Trades: ${trades.length}`);
    console.log(`   - Holdings today: ${holdingsToday.length}`);
    console.log(`   - Holdings yesterday: ${holdingsYesterday.length}`);
    console.log(`   - Today's cash flow: ${todayCashFlow}`);
    console.log(`   - Unique assets: ${uniqueAssets.size}`);
    
    if (holdingsToday.length === 0 && holdingsYesterday.length === 0) {
      console.log('\n❌ ISSUE: No holdings calculated - portfolio might be empty');
    } else if (uniqueAssets.size === 0) {
      console.log('\n❌ ISSUE: Only cash holdings - no assets to calculate return on');
    } else {
      console.log('\n✅ Basic data exists - issue might be in API calculation logic');
    }

  } catch (error) {
    console.error('❌ Error during diagnosis:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

diagnoseTodaysChange().catch(console.error);

