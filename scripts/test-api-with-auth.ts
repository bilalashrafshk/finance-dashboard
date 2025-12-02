import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function testAPIWithAuth() {
  const baseUrl = 'http://localhost:3002';
  
  console.log('🔍 Testing API with Authentication\n');
  console.log(`Base URL: ${baseUrl}\n`);

  try {
    // Step 1: Login to get token
    console.log('📝 Step 1: Logging in...\n');
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'bilalashraf248@gmail.com',
        password: 'panzer2001',
      }),
    });

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      console.log(`❌ Login failed: ${loginResponse.status}`);
      console.log(errorText);
      return;
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;

    if (!token) {
      console.log('❌ No token received from login');
      console.log(loginData);
      return;
    }

    console.log(`✅ Login successful! Token received.\n`);

    // Step 2: Test portfolio history endpoint
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
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });

        console.log(`   Status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.log(`   ❌ Error Response:`);
          try {
            const errorJson = JSON.parse(errorText);
            console.log(JSON.stringify(errorJson, null, 2));
          } catch {
            console.log(errorText.substring(0, 500));
          }
          continue;
        }

        const data = await response.json();
        const history = data.history || [];

        console.log(`   ✅ Success! History entries: ${history.length}\n`);

        if (history.length === 0) {
          console.log('   ⚠️  No history data returned - this would cause blank display!\n');
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
    console.log('   Check the output above to see what the API actually returns');
    console.log('   This will show why Today\'s Change is blank');

  } catch (error: any) {
    console.error('❌ Error:', error);
  }
}

// Wait a bit for server to start, then test
setTimeout(() => {
  testAPIWithAuth().catch(console.error);
}, 3000);

