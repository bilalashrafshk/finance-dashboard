import { Pool } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { calculateHoldingsFromTransactions } from '../lib/portfolio/transaction-utils';
import { getSBPEconomicData } from '../lib/portfolio/db-client';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function testTodaysChangeFix() {
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
    const userId = 1;
    const currency = 'USD';
    const unified = true;

    console.log('🔍 Testing Today\'s Change Fix...\n');
    console.log(`Currency: ${currency}, Unified: ${unified}\n`);

    // Test 1: Exchange rate fetching (should use latest available)
    console.log('Test 1: Exchange Rate Fetching\n');
    let exchangeRate: number | null = null;
    try {
      const exchangeResult = await getSBPEconomicData('TS_GP_ER_FAERPKR_M.E00220');
      if (exchangeResult && exchangeResult.data && exchangeResult.data.length > 0) {
        const sorted = [...exchangeResult.data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        exchangeRate = sorted[0].value;
        console.log(`✅ Latest exchange rate: ${exchangeRate} PKR/USD (Date: ${sorted[0].date})\n`);
      } else {
        console.log('❌ No exchange rate data\n');
      }
    } catch (error) {
      console.log(`❌ Error fetching exchange rate: ${error}\n`);
    }

    if (!exchangeRate) {
      console.log('⚠️  WARNING: No exchange rate - PKR holdings will be excluded!\n');
    }

    // Test 2: Get trades and calculate portfolio values
    console.log('Test 2: Portfolio Value Calculation\n');
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

    // Get last 5 days of history
    const today = new Date();
    const days = 5;
    const startDate = new Date();
    startDate.setDate(today.getDate() - days);

    // Build price map
    const historicalPriceMap = new Map<string, Map<string, number>>();
    const uniqueAssets = new Map<string, { assetType: string; symbol: string; currency: string }>();
    
    trades.forEach(t => {
      if (t.assetType !== 'cash') {
        const key = `${t.assetType}:${t.symbol.toUpperCase()}:${t.currency}`;
        if (!uniqueAssets.has(key)) {
          uniqueAssets.set(key, {
            assetType: t.assetType,
            symbol: t.symbol.toUpperCase(),
            currency: t.currency || 'USD'
          });
        }
      }
    });

    for (const [assetKey, asset] of uniqueAssets.entries()) {
      const priceMap = new Map<string, number>();
      const result = await client.query(
        `SELECT date, close FROM historical_price_data 
         WHERE asset_type = $1 AND symbol = $2 
         AND date >= $3
         ORDER BY date DESC`,
        [asset.assetType, asset.symbol, startDate.toISOString().split('T')[0]]
      );
      result.rows.forEach(row => {
        priceMap.set(row.date.toISOString().split('T')[0], parseFloat(row.close));
      });
      if (priceMap.size > 0) {
        historicalPriceMap.set(assetKey, priceMap);
      }
    }

    const getPriceForDate = (assetKey: string, dateStr: string, fallbackPrice: number): number => {
      const priceMap = historicalPriceMap.get(assetKey);
      if (!priceMap) return fallbackPrice;
      if (priceMap.has(dateStr)) return priceMap.get(dateStr)!;
      const dates = Array.from(priceMap.keys()).sort().reverse();
      for (const date of dates) {
        if (date <= dateStr) return priceMap.get(date)!;
      }
      return fallbackPrice;
    };

    // Calculate for last 5 days
    const dailyValues: Array<{ date: string; invested: number; cashFlow: number }> = [];
    
    for (let i = 0; i <= days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      const tradesUntilDate = trades.filter(t => t.tradeDate <= dateStr);
      const holdings = calculateHoldingsFromTransactions(tradesUntilDate);

      let bookValue = 0;
      holdings.forEach(h => {
        const holdingCurrency = h.currency || 'USD';
        let shouldInclude = true;
        let valueToAdd = 0;

        if (h.assetType === 'cash') {
          valueToAdd = h.quantity || 0;
          if (unified && holdingCurrency !== 'USD') {
            if (holdingCurrency === 'PKR' && exchangeRate) {
              valueToAdd = valueToAdd / exchangeRate;
            } else if (holdingCurrency === 'PKR' && !exchangeRate) {
              shouldInclude = false;
            }
          }
        } else {
          const assetKey = `${h.assetType}:${h.symbol.toUpperCase()}:${holdingCurrency}`;
          const price = getPriceForDate(assetKey, dateStr, h.purchasePrice || 0);
          valueToAdd = (h.quantity || 0) * price;
          
          if (unified && holdingCurrency !== 'USD') {
            if (holdingCurrency === 'PKR' && exchangeRate) {
              valueToAdd = valueToAdd / exchangeRate;
            } else if (holdingCurrency === 'PKR' && !exchangeRate) {
              shouldInclude = false;
            }
          }
        }

        if (shouldInclude) {
          bookValue += valueToAdd;
        }
      });

      const cashFlows = trades.filter(t => 
        (t.tradeType === 'add' || t.tradeType === 'remove') && 
        t.tradeDate === dateStr
      );
      const cashFlow = cashFlows.reduce((sum, t) => {
        return sum + (t.tradeType === 'add' ? t.totalAmount : -t.totalAmount);
      }, 0);

      dailyValues.push({ date: dateStr, invested: bookValue, cashFlow });
    }

    // Sort by date
    dailyValues.sort((a, b) => a.date.localeCompare(b.date));

    console.log('📊 Portfolio Values (Last 5 Days):\n');
    dailyValues.forEach(d => {
      console.log(`   ${d.date}: ${d.invested.toFixed(2)} USD (cash flow: ${d.cashFlow})`);
    });

    // Test 3: Calculate change using last 2 available days
    console.log('\nTest 3: Today\'s Change Calculation (Using Last 2 Available Days)\n');
    
    if (dailyValues.length < 1) {
      console.log('❌ No data available\n');
      return;
    }

    const latest = dailyValues[dailyValues.length - 1];
    const previous = dailyValues.length >= 2 ? dailyValues[dailyValues.length - 2] : { invested: 0, cashFlow: 0 };

    const change = (latest.invested - previous.invested) - latest.cashFlow;
    const changePercent = previous.invested > 0 ? (change / previous.invested) * 100 : 0;

    console.log(`   Latest date: ${latest.date}`);
    console.log(`   Previous date: ${previous.date}`);
    console.log(`   Latest value: ${latest.invested.toFixed(2)} USD`);
    console.log(`   Previous value: ${previous.invested.toFixed(2)} USD`);
    console.log(`   Cash flow: ${latest.cashFlow}`);
    console.log(`   Change: ${change.toFixed(2)} USD`);
    console.log(`   Change %: ${changePercent.toFixed(2)}%\n`);

    // Test 4: Check if it would show blank
    const isValid = !isNaN(change) && !isNaN(changePercent) && isFinite(change) && isFinite(changePercent);
    
    if (isValid) {
      console.log('✅ Calculation is VALID - should display in UI');
      if (change === 0 && changePercent === 0) {
        console.log('   Note: Change is 0.00% - should show "0.00%" not blank');
      }
    } else {
      console.log('❌ Calculation is INVALID - would show blank');
      console.log(`   - change is NaN: ${isNaN(change)}`);
      console.log(`   - changePercent is NaN: ${isNaN(changePercent)}`);
      console.log(`   - change is Finite: ${isFinite(change)}`);
      console.log(`   - changePercent is Finite: ${isFinite(changePercent)}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

testTodaysChangeFix().catch(console.error);

