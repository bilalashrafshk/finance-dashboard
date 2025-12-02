import { Pool } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { calculateHoldingsFromTransactions } from '../lib/portfolio/transaction-utils';
import { getSBPEconomicData } from '../lib/portfolio/db-client';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function testCashFlowFix() {
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
    
    // Test both scenarios
    const scenarios = [
      { currency: 'USD', unified: true, label: 'Unified USD' },
      { currency: 'PKR', unified: false, label: 'PKR Only' },
    ];

    for (const scenario of scenarios) {
      console.log(`\n🔍 Testing: ${scenario.label}\n`);
      console.log(`Currency: ${scenario.currency}, Unified: ${scenario.unified}\n`);

      const { currency, unified } = scenario;

      // Get exchange rate
      let exchangeRate: number | null = null;
      if (unified) {
        try {
          const exchangeResult = await getSBPEconomicData('TS_GP_ER_FAERPKR_M.E00220');
          if (exchangeResult && exchangeResult.data && exchangeResult.data.length > 0) {
            const sorted = [...exchangeResult.data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            exchangeRate = sorted[0].value;
            console.log(`✅ Exchange rate: ${exchangeRate} PKR/USD\n`);
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

      // Track cash flows (with conversion for unified mode)
      const cashFlowsByDate = new Map<string, number>();
      for (const trade of trades) {
        if (trade.tradeType === 'add' || trade.tradeType === 'remove') {
          const dateStr = trade.tradeDate;
          const currentFlow = cashFlowsByDate.get(dateStr) || 0;
          let flowAmount = trade.tradeType === 'add' ? trade.totalAmount : -trade.totalAmount;
          
          // Convert to USD if unified mode and trade is in PKR
          if (unified && trade.currency === 'PKR' && exchangeRate) {
            flowAmount = flowAmount / exchangeRate;
            console.log(`   Cash flow ${trade.tradeDate}: ${trade.totalAmount} PKR → ${flowAmount.toFixed(2)} USD`);
          }
          
          cashFlowsByDate.set(dateStr, currentFlow + flowAmount);
        }
      }

      // Get last 2 days
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Calculate for last 2 days (simplified)
      const datesToCheck = [yesterdayStr, todayStr];
      const dailyValues: Array<{ date: string; invested: number; cashFlow: number }> = [];

      for (const dateStr of datesToCheck) {
        const tradesUntilDate = trades.filter(t => t.tradeDate <= dateStr);
        const holdings = calculateHoldingsFromTransactions(tradesUntilDate);

        let bookValue = 0;
        // Simplified calculation - just sum up current values
        holdings.forEach(h => {
          if (h.assetType === 'cash') {
            if (unified) {
              if (h.currency === 'PKR' && exchangeRate) {
                bookValue += (h.quantity || 0) / exchangeRate;
              } else {
                bookValue += h.quantity || 0;
              }
            } else {
              if (h.currency.toUpperCase() === currency.toUpperCase()) {
                bookValue += h.quantity || 0;
              }
            }
          } else {
            // For non-cash, use current price (simplified)
            const value = (h.quantity || 0) * (h.currentPrice || h.purchasePrice || 0);
            if (unified) {
              if (h.currency === 'PKR' && exchangeRate) {
                bookValue += value / exchangeRate;
              } else {
                bookValue += value;
              }
            } else {
              if (h.currency.toUpperCase() === currency.toUpperCase()) {
                bookValue += value;
              }
            }
          }
        });

        const cashFlow = cashFlowsByDate.get(dateStr) || 0;
        dailyValues.push({ date: dateStr, invested: bookValue, cashFlow });
      }

      console.log(`\n📊 Values:`);
      dailyValues.forEach(d => {
        console.log(`   ${d.date}: invested=${d.invested.toFixed(2)} ${currency}, cashFlow=${d.cashFlow.toFixed(2)} ${currency}`);
      });

      if (dailyValues.length >= 2) {
        const latest = dailyValues[dailyValues.length - 1];
        const previous = dailyValues[dailyValues.length - 2];

        const change = (latest.invested - previous.invested) - latest.cashFlow;
        const changePercent = previous.invested > 0 ? (change / previous.invested) * 100 : 0;

        console.log(`\n📊 Today's Change:`);
        console.log(`   Change = (${latest.invested.toFixed(2)} - ${previous.invested.toFixed(2)}) - ${latest.cashFlow.toFixed(2)}`);
        console.log(`   Change = ${change.toFixed(2)} ${currency}`);
        console.log(`   Change % = ${changePercent.toFixed(2)}%`);

        const isValid = !isNaN(change) && !isNaN(changePercent) && isFinite(change) && isFinite(changePercent);
        console.log(`\n   ${isValid ? '✅ VALID' : '❌ INVALID'}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

testCashFlowFix().catch(console.error);

