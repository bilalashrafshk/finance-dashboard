import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function testAPIEndpoint() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002';
  const token = process.env.TEST_AUTH_TOKEN || '';

  console.log('🔍 Testing API Endpoint: /api/user/portfolio/history\n');
  console.log(`Base URL: ${baseUrl}\n`);

  // Test different scenarios
  const scenarios = [
    { currency: 'USD', unified: true, label: 'Unified USD' },
    { currency: 'USD', unified: false, label: 'USD Only' },
    { currency: 'PKR', unified: false, label: 'PKR Only' },
  ];

  for (const scenario of scenarios) {
    console.log(`\n📊 Testing: ${scenario.label}`);
    console.log(`   Currency: ${scenario.currency}, Unified: ${scenario.unified}\n`);

    try {
      const unifiedParam = scenario.unified ? '&unified=true' : '';
      const url = `${baseUrl}/api/user/portfolio/history?days=5&currency=${scenario.currency}${unifiedParam}`;
      
      console.log(`   URL: ${url}`);
      
      const response = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });

      console.log(`   Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`   ❌ Error: ${errorText.substring(0, 200)}\n`);
        continue;
      }

      const data = await response.json();
      const history = data.history || [];

      console.log(`   History entries: ${history.length}\n`);

      if (history.length === 0) {
        console.log('   ❌ No history data returned!\n');
        continue;
      }

      // Show last 5 entries
      const sortedHistory = [...history].sort((a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      console.log('   Last 5 entries:');
      sortedHistory.slice(-5).forEach((entry: any) => {
        console.log(`      ${entry.date}: invested=${entry.invested?.toFixed(2) || 'undefined'}, cashFlow=${entry.cashFlow || 0}`);
      });

      // Calculate what client would calculate
      if (sortedHistory.length >= 1) {
        const latest = sortedHistory[sortedHistory.length - 1];
        const previous = sortedHistory.length >= 2 ? sortedHistory[sortedHistory.length - 2] : { invested: 0, cashFlow: 0 };

        console.log(`\n   Client-side calculation:`);
        console.log(`      Latest: ${latest.date}, invested=${latest.invested?.toFixed(2) || 'undefined'}, cashFlow=${latest.cashFlow || 0}`);
        console.log(`      Previous: ${previous.date || 'N/A'}, invested=${previous.invested?.toFixed(2) || 0}, cashFlow=${previous.cashFlow || 0}`);

        if (latest.invested === undefined) {
          console.log(`      ❌ Latest invested is undefined - this would cause blank display!`);
        } else {
          const latestCashFlow = latest.cashFlow || 0;
          const previousInvested = previous.invested || 0;
          const change = (latest.invested - previousInvested) - latestCashFlow;
          const changePercent = previousInvested > 0 ? (change / previousInvested) * 100 : 0;

          console.log(`      Change: ${change.toFixed(2)}`);
          console.log(`      Change %: ${changePercent.toFixed(2)}%`);

          const isValid = !isNaN(change) && !isNaN(changePercent) && isFinite(change) && isFinite(changePercent);
          
          if (isValid) {
            console.log(`      ✅ Valid - should display`);
            if (change === 0 && changePercent === 0) {
              console.log(`      Note: Change is 0.00% - should show "0.00%" not blank`);
            }
          } else {
            console.log(`      ❌ Invalid - would show blank`);
            console.log(`         - change is NaN: ${isNaN(change)}`);
            console.log(`         - changePercent is NaN: ${isNaN(changePercent)}`);
            console.log(`         - change is Finite: ${isFinite(change)}`);
            console.log(`         - changePercent is Finite: ${isFinite(changePercent)}`);
          }
        }
      }

    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}\n`);
    }
  }

  console.log('\n📋 Summary:');
  console.log('   Check the output above to see which scenario returns valid data');
  console.log('   If all return empty history or undefined invested, check:');
  console.log('   1. Database connection');
  console.log('   2. User authentication');
  console.log('   3. Trades exist in database');
  console.log('   4. Exchange rate data (for unified mode)');
}

testAPIEndpoint().catch(console.error);

