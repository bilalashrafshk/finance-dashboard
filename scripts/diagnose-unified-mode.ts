import { Pool } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { calculateHoldingsFromTransactions } from '../lib/portfolio/transaction-utils';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function diagnoseUnifiedMode() {
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
    const unified = true; // This is the key - unified mode

    console.log('🔍 Testing UNIFIED mode calculation...\n');
    console.log(`Currency: ${currency}, Unified: ${unified}\n`);

    // Check exchange rate
    const { getSBPEconomicData } = await import('../lib/portfolio/db-client');
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    let exchangeRate: number | null = null;
    try {
      const exchangeResult = await getSBPEconomicData(
        'TS_GP_ER_FAERPKR_M.E00220',
        oneMonthAgo.toISOString().split('T')[0],
        new Date().toISOString().split('T')[0]
      );
      if (exchangeResult && exchangeResult.data && exchangeResult.data.length > 0) {
        const sorted = [...exchangeResult.data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        exchangeRate = sorted[0].value;
        console.log(`✅ Exchange rate: ${exchangeRate} PKR/USD\n`);
      } else {
        console.log(`❌ No exchange rate found - PKR holdings will be EXCLUDED in unified mode!\n`);
      }
    } catch (error) {
      console.log(`❌ Error fetching exchange rate: ${error}\n`);
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

    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
         ORDER BY date DESC LIMIT 30`,
        [asset.assetType, asset.symbol]
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

    // Calculate TODAY in unified mode
    console.log(`💰 Calculating TODAY (${todayStr}) in UNIFIED mode:\n`);
    const tradesUntilToday = trades.filter(t => t.tradeDate <= todayStr);
    const holdingsToday = calculateHoldingsFromTransactions(tradesUntilToday);
    
    let todayValue = 0;
    let excludedCount = 0;

    holdingsToday.forEach(h => {
      const holdingCurrency = h.currency || 'USD';
      let shouldInclude = true;
      let valueToAdd = 0;

      if (h.assetType === 'cash') {
        valueToAdd = h.quantity || 0;
        if (holdingCurrency !== 'USD') {
          if (holdingCurrency === 'PKR' && exchangeRate) {
            valueToAdd = valueToAdd / exchangeRate;
            console.log(`   ✅ Cash (${holdingCurrency}): ${h.quantity} → ${valueToAdd.toFixed(2)} USD`);
          } else if (holdingCurrency === 'PKR' && !exchangeRate) {
            console.log(`   ❌ EXCLUDED: Cash (${holdingCurrency}) - no exchange rate`);
            shouldInclude = false;
            excludedCount++;
          }
        } else {
          console.log(`   ✅ Cash (USD): ${valueToAdd}`);
        }
      } else {
        const assetKey = `${h.assetType}:${h.symbol.toUpperCase()}:${holdingCurrency}`;
        const price = getPriceForDate(assetKey, todayStr, h.purchasePrice || 0);
        valueToAdd = (h.quantity || 0) * price;
        
        if (holdingCurrency !== 'USD') {
          if (holdingCurrency === 'PKR' && exchangeRate) {
            valueToAdd = valueToAdd / exchangeRate;
            console.log(`   ✅ ${h.symbol} (${holdingCurrency}): ${h.quantity} × ${price} = ${(h.quantity * price).toFixed(2)} PKR → ${valueToAdd.toFixed(2)} USD`);
          } else if (holdingCurrency === 'PKR' && !exchangeRate) {
            console.log(`   ❌ EXCLUDED: ${h.symbol} (${holdingCurrency}) - no exchange rate`);
            shouldInclude = false;
            excludedCount++;
          }
        } else {
          console.log(`   ✅ ${h.symbol} (USD): ${h.quantity} × ${price} = ${valueToAdd.toFixed(2)} USD`);
        }
      }

      if (shouldInclude) {
        todayValue += valueToAdd;
      }
    });

    // Calculate YESTERDAY
    console.log(`\n💰 Calculating YESTERDAY (${yesterdayStr}) in UNIFIED mode:\n`);
    const tradesUntilYesterday = trades.filter(t => t.tradeDate <= yesterdayStr);
    const holdingsYesterday = calculateHoldingsFromTransactions(tradesUntilYesterday);
    
    let yesterdayValue = 0;

    holdingsYesterday.forEach(h => {
      const holdingCurrency = h.currency || 'USD';
      let shouldInclude = true;
      let valueToAdd = 0;

      if (h.assetType === 'cash') {
        valueToAdd = h.quantity || 0;
        if (holdingCurrency !== 'USD') {
          if (holdingCurrency === 'PKR' && exchangeRate) {
            valueToAdd = valueToAdd / exchangeRate;
          } else if (holdingCurrency === 'PKR' && !exchangeRate) {
            shouldInclude = false;
          }
        }
      } else {
        const assetKey = `${h.assetType}:${h.symbol.toUpperCase()}:${holdingCurrency}`;
        const price = getPriceForDate(assetKey, yesterdayStr, h.purchasePrice || 0);
        valueToAdd = (h.quantity || 0) * price;
        
        if (holdingCurrency !== 'USD') {
          if (holdingCurrency === 'PKR' && exchangeRate) {
            valueToAdd = valueToAdd / exchangeRate;
          } else if (holdingCurrency === 'PKR' && !exchangeRate) {
            shouldInclude = false;
          }
        }
      }

      if (shouldInclude) {
        yesterdayValue += valueToAdd;
      }
    });

    const cashFlows = trades.filter(t => 
      (t.tradeType === 'add' || t.tradeType === 'remove') && 
      t.tradeDate === todayStr
    );
    const todayCashFlow = cashFlows.reduce((sum, t) => {
      return sum + (t.tradeType === 'add' ? t.totalAmount : -t.totalAmount);
    }, 0);

    const change = (todayValue - yesterdayValue) - todayCashFlow;
    const changePercent = yesterdayValue > 0 ? (change / yesterdayValue) * 100 : 0;

    console.log(`\n📊 FINAL RESULTS:\n`);
    console.log(`   Today's value: ${todayValue.toFixed(2)} USD`);
    console.log(`   Yesterday's value: ${yesterdayValue.toFixed(2)} USD`);
    console.log(`   Today's cash flow: ${todayCashFlow}`);
    console.log(`   Change: ${change.toFixed(2)} USD`);
    console.log(`   Change %: ${changePercent.toFixed(2)}%`);
    console.log(`   Excluded assets: ${excludedCount}\n`);

    if (!exchangeRate) {
      console.log('❌ CRITICAL ISSUE: No exchange rate available!');
      console.log('   All PKR holdings are being EXCLUDED in unified mode.');
      console.log('   This means todayValue and yesterdayValue might both be 0 or very small.');
      console.log('   This is likely why Today\'s Change is blank!\n');
    }

    if (todayValue === 0 && yesterdayValue === 0) {
      console.log('❌ Both values are 0 - portfolio is empty or all excluded!');
    } else if (isNaN(change) || isNaN(changePercent) || !isFinite(change) || !isFinite(changePercent)) {
      console.log('❌ Calculation resulted in NaN/Infinity!');
    } else {
      console.log('✅ Calculation is valid');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

diagnoseUnifiedMode().catch(console.error);

