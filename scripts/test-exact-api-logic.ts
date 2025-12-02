import { Pool } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { calculateHoldingsFromTransactions } from '../lib/portfolio/transaction-utils';
import { getSBPEconomicData } from '../lib/portfolio/db-client';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function testExactAPILogic() {
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
    const days = 5;

    console.log('🔍 Testing EXACT API Logic\n');
    console.log(`Currency: ${currency}, Unified: ${unified}, Days: ${days}\n`);

    // Step 1: Get exchange rate (exact code from route)
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
        console.log(`❌ Error fetching exchange rate: ${error}\n`);
      }
    }

    // Step 2: Get trades
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

    console.log(`📊 Trades: ${trades.length}\n`);

    if (trades.length === 0) {
      console.log('❌ No trades - API would return: { success: true, history: [] }\n');
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

    console.log(`📈 Unique assets: ${uniqueAssets.size}\n`);

    // Step 5: Fetch historical prices (simplified - just get what we need)
    const historicalPriceMap = new Map<string, Map<string, number>>();
    const todayStr = new Date().toISOString().split('T')[0];

    for (const [assetKey, asset] of uniqueAssets.entries()) {
      const priceMap = new Map<string, number>();
      
      // Get prices for the date range
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
      }
    }

    console.log(`💰 Historical price maps: ${historicalPriceMap.size}\n`);

    // Step 6: Helper functions (exact from route)
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

    // Step 7: Calculate daily holdings (simplified - just last 2 days)
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

    // Calculate for last 2 days
    const datesToCalculate = [todayStr, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]];
    
    for (const dateStr of datesToCalculate) {
      const tradesUntilDate = trades.filter(t => t.tradeDate <= dateStr);
      const holdings = calculateHoldingsFromTransactions(tradesUntilDate);

      let cashBalance = 0;
      let bookValue = 0;
      const todayStrCheck = new Date().toISOString().split('T')[0];
      const yesterdayStrCheck = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
          console.error(`Error processing holding ${h.symbol}:`, error);
        }
      });

      const cashFlow = cashFlowsByDate.get(dateStr) || 0;
      dailyHoldings[dateStr] = {
        date: dateStr,
        cash: cashBalance,
        invested: bookValue,
        cashFlow: cashFlow
      };
    }

    // Step 8: Sort and format (exact from route)
    const sortedHistory = Object.values(dailyHoldings).sort((a: any, b: any) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    console.log('📊 API Response (simulated):\n');
    console.log(JSON.stringify({
      success: true,
      history: sortedHistory.map((h: any) => ({
        ...h,
        value: h.invested,
        marketValue: h.invested
      }))
    }, null, 2));

    // Step 9: Test client-side calculation
    console.log('\n📊 Client-side Calculation:\n');
    
    if (sortedHistory.length < 1) {
      console.log('❌ No history - would show blank\n');
      return;
    }

    const latest = sortedHistory[sortedHistory.length - 1];
    const previous = sortedHistory.length >= 2 ? sortedHistory[sortedHistory.length - 2] : { invested: 0, cashFlow: 0 };

    console.log(`Latest: ${latest.date}, invested=${latest.invested}, cashFlow=${latest.cashFlow}`);
    console.log(`Previous: ${previous.date || 'N/A'}, invested=${previous.invested || 0}, cashFlow=${previous.cashFlow || 0}`);

    if (latest.invested === undefined) {
      console.log('\n❌ ISSUE: latest.invested is undefined - this causes blank display!');
    } else {
      const latestCashFlow = latest.cashFlow || 0;
      const previousInvested = previous.invested || 0;
      const change = (latest.invested - previousInvested) - latestCashFlow;
      const changePercent = previousInvested > 0 ? (change / previousInvested) * 100 : 0;

      console.log(`\nChange: ${change.toFixed(2)}`);
      console.log(`Change %: ${changePercent.toFixed(2)}%`);

      const isValid = !isNaN(change) && !isNaN(changePercent) && isFinite(change) && isFinite(changePercent);
      
      if (isValid) {
        console.log('\n✅ Valid calculation - should display');
      } else {
        console.log('\n❌ Invalid calculation - would show blank');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

testExactAPILogic().catch(console.error);

