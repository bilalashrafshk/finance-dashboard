import { Pool } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { calculateHoldingsFromTransactions } from '../lib/portfolio/transaction-utils';
import { getSBPEconomicData } from '../lib/portfolio/db-client';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function testRouteValues() {
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

    console.log('🔍 Running Centralized Route Logic\n');
    console.log(`User ID: ${userId}`);
    console.log(`Currency: ${currency}`);
    console.log(`Unified: ${unified}`);
    console.log(`Days: ${days}\n`);

    // Step 1: Get exchange rate
    console.log('📊 Step 1: Getting Exchange Rate...');
    let exchangeRate: number | null = null;
    if (unified) {
      try {
        const exchangeResult = await getSBPEconomicData('TS_GP_ER_FAERPKR_M.E00220');
        if (exchangeResult && exchangeResult.data && exchangeResult.data.length > 0) {
          const sorted = [...exchangeResult.data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          exchangeRate = sorted[0].value;
          console.log(`✅ Exchange rate: ${exchangeRate} PKR/USD (Date: ${sorted[0].date})\n`);
        } else {
          console.log(`❌ No exchange rate data\n`);
        }
      } catch (error) {
        console.log(`❌ Error: ${error}\n`);
      }
    }

    // Step 2: Get trades
    console.log('📊 Step 2: Getting Trades...');
    const tradesResult = await client.query(
      `SELECT id, user_id, holding_id, trade_type, asset_type, symbol, name, quantity,
              price, total_amount, currency, trade_date, notes, created_at
       FROM user_trades
       WHERE user_id = $1
       ORDER BY trade_date ASC, created_at ASC`,
      [userId]
    );

    const trades = tradesResult.rows.map(row => {
      let tradeDate: string;
      if (row.trade_date instanceof Date) {
        tradeDate = row.trade_date.toISOString().split('T')[0];
      } else if (typeof row.trade_date === 'string') {
        tradeDate = row.trade_date.split('T')[0];
      } else {
        tradeDate = new Date().toISOString().split('T')[0];
      }

      return {
        id: row.id,
        userId: row.user_id,
        holdingId: row.holding_id,
        tradeType: row.trade_type,
        assetType: row.asset_type,
        symbol: row.symbol || '',
        name: row.name || '',
        quantity: parseFloat(row.quantity) || 0,
        price: parseFloat(row.price) || 0,
        totalAmount: parseFloat(row.total_amount) || 0,
        currency: row.currency || 'USD',
        tradeDate: tradeDate,
        notes: row.notes,
        createdAt: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
      };
    }).filter(t => t.tradeDate);

    console.log(`✅ Total trades: ${trades.length}\n`);

    if (trades.length === 0) {
      console.log('❌ No trades found\n');
      return;
    }

    // Step 3: Generate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    // Step 4: Get unique assets
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

    console.log(`📊 Step 3: Unique Assets: ${uniqueAssets.size}\n`);

    // Step 5: Fetch historical prices
    console.log('📊 Step 4: Fetching Historical Prices...');
    const historicalPriceMap = new Map<string, Map<string, number>>();
    const todayStr = new Date().toISOString().split('T')[0];

    for (const [assetKey, asset] of uniqueAssets.entries()) {
      const priceMap = new Map<string, number>();
      const result = await client.query(
        `SELECT date, close FROM historical_price_data 
         WHERE asset_type = $1 AND symbol = $2 
         AND date >= $3 AND date <= $4
         ORDER BY date ASC`,
        [asset.assetType, asset.symbol, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
      );

      result.rows.forEach(row => {
        priceMap.set(row.date.toISOString().split('T')[0], parseFloat(row.close));
      });

      if (priceMap.size > 0) {
        historicalPriceMap.set(assetKey, priceMap);
        console.log(`   ✅ ${assetKey}: ${priceMap.size} price points`);
      } else {
        console.log(`   ❌ ${assetKey}: No price data`);
      }
    }

    console.log('');

    // Step 6: Helper functions
    const hasValidPriceForDate = (assetKey: string, dateStr: string): boolean => {
      const priceMap = historicalPriceMap.get(assetKey);
      if (!priceMap || priceMap.size === 0) return false;
      if (priceMap.has(dateStr)) return true;
      const dates = Array.from(priceMap.keys()).sort().reverse();
      for (const date of dates) {
        if (date <= dateStr) return true;
      }
      return false;
    };

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

    // Step 7: Calculate daily holdings
    console.log('📊 Step 5: Calculating Daily Holdings...\n');
    const dailyHoldings: Record<string, { date: string, cash: number, invested: number, cashFlow: number }> = {};
    
    // Track cash flows
    const cashFlowsByDate = new Map<string, number>();
    for (const trade of trades) {
      if (trade.tradeType === 'add' || trade.tradeType === 'remove') {
        const dateStr = trade.tradeDate;
        const currentFlow = cashFlowsByDate.get(dateStr) || 0;
        const flowAmount = trade.tradeType === 'add' ? trade.totalAmount : -trade.totalAmount;
        cashFlowsByDate.set(dateStr, currentFlow + flowAmount);
      }
    }

    // Generate dates
    let currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
    const finalEndDate = new Date(endDate);
    finalEndDate.setHours(23, 59, 59, 999);

    const todayStrCheck = new Date().toISOString().split('T')[0];
    const yesterdayStrCheck = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    while (currentDate <= finalEndDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const tradesUntilDate = trades.filter(t => t.tradeDate <= dateStr);
      const holdings = calculateHoldingsFromTransactions(tradesUntilDate);

      let cashBalance = 0;
      let bookValue = 0;

      holdings.forEach(h => {
        try {
          const holdingCurrency = h.currency || 'USD';
          let shouldInclude = false;
          let valueToAdd = 0;

          if (unified) {
            shouldInclude = true;
            if (h.assetType === 'cash') {
              valueToAdd = h.quantity || 0;
            } else {
              const assetKey = `${h.assetType}:${h.symbol.toUpperCase()}:${holdingCurrency}`;
              const isToday = dateStr === todayStrCheck;
              const isYesterday = dateStr === yesterdayStrCheck;
              const purchaseDateStr = h.purchaseDate ? new Date(h.purchaseDate).toISOString().split('T')[0] : null;
              const wasPurchasedToday = purchaseDateStr === todayStrCheck;
              const wasPurchasedYesterday = purchaseDateStr === yesterdayStrCheck;

              if ((isToday && wasPurchasedToday) || (isToday && wasPurchasedYesterday) || 
                  (isYesterday && wasPurchasedYesterday)) {
                if (!hasValidPriceForDate(assetKey, dateStr)) {
                  shouldInclude = false;
                } else {
                  const historicalPrice = getPriceForDate(assetKey, dateStr, h.purchasePrice || 0);
                  valueToAdd = (h.quantity || 0) * historicalPrice;
                }
              } else {
                const historicalPrice = getPriceForDate(assetKey, dateStr, h.purchasePrice || 0);
                valueToAdd = (h.quantity || 0) * historicalPrice;
              }
            }

            if (holdingCurrency !== 'USD') {
              if (holdingCurrency === 'PKR' && exchangeRate) {
                valueToAdd = valueToAdd / exchangeRate;
              } else if (holdingCurrency === 'PKR' && !exchangeRate) {
                shouldInclude = false;
              }
            }
          } else {
            if (holdingCurrency.toUpperCase() === currency.toUpperCase()) {
              shouldInclude = true;
              if (h.assetType === 'cash') {
                valueToAdd = h.quantity || 0;
              } else {
                const assetKey = `${h.assetType}:${h.symbol.toUpperCase()}:${holdingCurrency}`;
                const historicalPrice = getPriceForDate(assetKey, dateStr, h.purchasePrice || 0);
                valueToAdd = (h.quantity || 0) * historicalPrice;
              }
            }
          }

          if (shouldInclude) {
            if (h.assetType === 'cash') {
              cashBalance += valueToAdd;
            }
            bookValue += valueToAdd;
          }
        } catch (error) {
          // Continue
        }
      });

      const cashFlow = cashFlowsByDate.get(dateStr) || 0;
      dailyHoldings[dateStr] = {
        date: dateStr,
        cash: cashBalance,
        invested: bookValue,
        cashFlow: cashFlow
      };

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Step 8: Sort and display
    const sortedHistory = Object.values(dailyHoldings).sort((a: any, b: any) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    console.log('📊 Portfolio History Values:\n');
    sortedHistory.forEach((entry: any) => {
      console.log(`   ${entry.date}: invested=${entry.invested.toFixed(2)}, cashFlow=${entry.cashFlow.toFixed(2)}`);
    });

    // Step 9: Calculate Today's Change
    console.log('\n📊 Today\'s Change Calculation:\n');
    
    if (sortedHistory.length < 1) {
      console.log('❌ No history data\n');
      return;
    }

    const latest = sortedHistory[sortedHistory.length - 1];
    const previous = sortedHistory.length >= 2 ? sortedHistory[sortedHistory.length - 2] : { invested: 0, cashFlow: 0 };

    console.log(`Latest Entry:`);
    console.log(`   Date: ${latest.date}`);
    console.log(`   Invested: ${latest.invested.toFixed(2)}`);
    console.log(`   Cash Flow: ${latest.cashFlow.toFixed(2)}`);

    console.log(`\nPrevious Entry:`);
    console.log(`   Date: ${previous.date || 'N/A'}`);
    console.log(`   Invested: ${previous.invested.toFixed(2)}`);
    console.log(`   Cash Flow: ${previous.cashFlow.toFixed(2)}`);

    if (latest.invested === undefined) {
      console.log('\n❌ Latest invested is undefined!\n');
      return;
    }

    const latestCashFlow = latest.cashFlow || 0;
    const previousInvested = previous.invested || 0;
    
    const change = (latest.invested - previousInvested) - latestCashFlow;
    const changePercent = previousInvested > 0 ? (change / previousInvested) * 100 : 0;

    console.log(`\n📊 Calculation:`);
    console.log(`   Change = (${latest.invested.toFixed(2)} - ${previousInvested.toFixed(2)}) - ${latestCashFlow.toFixed(2)}`);
    console.log(`   Change = ${change.toFixed(2)}`);
    console.log(`   Change % = (${change.toFixed(2)} / ${previousInvested.toFixed(2)}) * 100`);
    console.log(`   Change % = ${changePercent.toFixed(2)}%\n`);

    const isValid = !isNaN(change) && !isNaN(changePercent) && isFinite(change) && isFinite(changePercent);
    
    if (isValid) {
      console.log('✅ VALID - Should display in UI');
      console.log(`   Value: ${change >= 0 ? '+' : ''}${change.toFixed(2)}`);
      console.log(`   Percent: ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`);
    } else {
      console.log('❌ INVALID - Would show blank');
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

testRouteValues().catch(console.error);

