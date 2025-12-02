import { Pool } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { calculateHoldingsFromTransactions } from '../lib/portfolio/transaction-utils';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function diagnoseAPICalculation() {
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
    const userId = 1; // Using first user
    const currency = 'USD';
    const unified = true;
    const days = 5;

    console.log('🔍 Simulating API calculation...\n');
    console.log(`Currency: ${currency}, Unified: ${unified}, Days: ${days}\n`);

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

    // Get today and yesterday
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    console.log(`📅 Today: ${todayStr}`);
    console.log(`📅 Yesterday: ${yesterdayStr}\n`);

    // Build historical price map (simplified - just check what we have)
    const historicalPriceMap = new Map<string, Map<string, number>>();
    
    // Get unique assets
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

    console.log(`📊 Fetching price data for ${uniqueAssets.size} assets...\n`);

    // Fetch price data for each asset
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
        console.log(`✅ ${assetKey}: ${priceMap.size} price points`);
      } else {
        console.log(`❌ ${assetKey}: No price data`);
      }
    }

    // Helper functions (same as API)
    const hasValidPriceForDate = (assetKey: string, dateStr: string): boolean => {
      const priceMap = historicalPriceMap.get(assetKey);
      if (!priceMap || priceMap.size === 0) {
        return false;
      }
      if (priceMap.has(dateStr)) {
        return true;
      }
      const dates = Array.from(priceMap.keys()).sort().reverse();
      for (const date of dates) {
        if (date <= dateStr) {
          return true;
        }
      }
      return false;
    };

    const getPriceForDate = (assetKey: string, dateStr: string, fallbackPrice: number): number => {
      const priceMap = historicalPriceMap.get(assetKey);
      if (!priceMap) {
        return fallbackPrice;
      }
      if (priceMap.has(dateStr)) {
        return priceMap.get(dateStr)!;
      }
      const dates = Array.from(priceMap.keys()).sort().reverse();
      for (const date of dates) {
        if (date <= dateStr) {
          return priceMap.get(date)!;
        }
      }
      return fallbackPrice;
    };

    // Calculate for today
    console.log(`\n💰 Calculating portfolio value for TODAY (${todayStr}):\n`);
    const tradesUntilToday = trades.filter(t => t.tradeDate <= todayStr);
    const holdingsToday = calculateHoldingsFromTransactions(tradesUntilToday);
    
    let todayValue = 0;
    let todayExcluded = 0;
    
    holdingsToday.forEach(h => {
      if (h.assetType === 'cash') {
        todayValue += h.quantity || 0;
        console.log(`   ✅ Cash: ${h.quantity} ${h.currency}`);
      } else {
        const assetKey = `${h.assetType}:${h.symbol.toUpperCase()}:${h.currency}`;
        const purchaseDateStr = h.purchaseDate ? new Date(h.purchaseDate).toISOString().split('T')[0] : null;
        const wasPurchasedToday = purchaseDateStr === todayStr;
        const wasPurchasedYesterday = purchaseDateStr === yesterdayStr;
        
        if ((wasPurchasedToday || wasPurchasedYesterday)) {
          if (!hasValidPriceForDate(assetKey, todayStr)) {
            console.log(`   ❌ EXCLUDED: ${h.symbol} (purchased ${purchaseDateStr}, no price data for today)`);
            todayExcluded++;
          } else {
            const price = getPriceForDate(assetKey, todayStr, h.purchasePrice || 0);
            const value = (h.quantity || 0) * price;
            todayValue += value;
            console.log(`   ✅ ${h.symbol}: ${h.quantity} × ${price} = ${value.toFixed(2)}`);
          }
        } else {
          // Not purchased recently - should always be included
          const price = getPriceForDate(assetKey, todayStr, h.purchasePrice || 0);
          const value = (h.quantity || 0) * price;
          todayValue += value;
          console.log(`   ✅ ${h.symbol}: ${h.quantity} × ${price} = ${value.toFixed(2)}`);
        }
      }
    });

    // Calculate for yesterday
    console.log(`\n💰 Calculating portfolio value for YESTERDAY (${yesterdayStr}):\n`);
    const tradesUntilYesterday = trades.filter(t => t.tradeDate <= yesterdayStr);
    const holdingsYesterday = calculateHoldingsFromTransactions(tradesUntilYesterday);
    
    let yesterdayValue = 0;
    let yesterdayExcluded = 0;
    
    holdingsYesterday.forEach(h => {
      if (h.assetType === 'cash') {
        yesterdayValue += h.quantity || 0;
        console.log(`   ✅ Cash: ${h.quantity} ${h.currency}`);
      } else {
        const assetKey = `${h.assetType}:${h.symbol.toUpperCase()}:${h.currency}`;
        const purchaseDateStr = h.purchaseDate ? new Date(h.purchaseDate).toISOString().split('T')[0] : null;
        const wasPurchasedYesterday = purchaseDateStr === yesterdayStr;
        
        if (wasPurchasedYesterday) {
          if (!hasValidPriceForDate(assetKey, yesterdayStr)) {
            console.log(`   ❌ EXCLUDED: ${h.symbol} (purchased ${purchaseDateStr}, no price data for yesterday)`);
            yesterdayExcluded++;
          } else {
            const price = getPriceForDate(assetKey, yesterdayStr, h.purchasePrice || 0);
            const value = (h.quantity || 0) * price;
            yesterdayValue += price;
            console.log(`   ✅ ${h.symbol}: ${h.quantity} × ${price} = ${value.toFixed(2)}`);
          }
        } else {
          const price = getPriceForDate(assetKey, yesterdayStr, h.purchasePrice || 0);
          const value = (h.quantity || 0) * price;
          yesterdayValue += value;
          console.log(`   ✅ ${h.symbol}: ${h.quantity} × ${price} = ${value.toFixed(2)}`);
        }
      }
    });

    // Get cash flow
    const cashFlows = trades.filter(t => 
      (t.tradeType === 'add' || t.tradeType === 'remove') && 
      t.tradeDate === todayStr
    );
    const todayCashFlow = cashFlows.reduce((sum, t) => {
      return sum + (t.tradeType === 'add' ? t.totalAmount : -t.totalAmount);
    }, 0);

    // Calculate change
    const change = (todayValue - yesterdayValue) - todayCashFlow;
    const changePercent = yesterdayValue > 0 ? (change / yesterdayValue) * 100 : 0;

    console.log(`\n📊 RESULTS:\n`);
    console.log(`   Today's value: ${todayValue.toFixed(2)}`);
    console.log(`   Yesterday's value: ${yesterdayValue.toFixed(2)}`);
    console.log(`   Today's cash flow: ${todayCashFlow}`);
    console.log(`   Change: ${change.toFixed(2)}`);
    console.log(`   Change %: ${changePercent.toFixed(2)}%`);
    console.log(`   Excluded today: ${todayExcluded}`);
    console.log(`   Excluded yesterday: ${yesterdayExcluded}\n`);

    if (isNaN(change) || isNaN(changePercent) || !isFinite(change) || !isFinite(changePercent)) {
      console.log('❌ ISSUE: Calculation resulted in NaN or Infinity - this is why it shows blank!');
      console.log(`   - change is NaN: ${isNaN(change)}`);
      console.log(`   - changePercent is NaN: ${isNaN(changePercent)}`);
      console.log(`   - change is Finite: ${isFinite(change)}`);
      console.log(`   - changePercent is Finite: ${isFinite(changePercent)}`);
    } else if (todayValue === 0 && yesterdayValue === 0) {
      console.log('❌ ISSUE: Both values are 0 - portfolio might be empty or all excluded');
    } else {
      console.log('✅ Calculation is valid - issue might be elsewhere');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

diagnoseAPICalculation().catch(console.error);

