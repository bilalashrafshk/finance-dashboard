/**
 * Test the financial API to see what data it returns
 */

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function testFinancialAPI(symbol) {
  console.log(`\n=== Testing Financial API for ${symbol} ===\n`);
  
  try {
    // First, update the financials
    console.log('1. Updating financials...');
    const updateResponse = await fetch(`${baseUrl}/api/financials/update?symbol=${symbol}&force=true`);
    const updateData = await updateResponse.json();
    console.log('Update result:', updateData);
    
    // Then, fetch the financials
    console.log('\n2. Fetching financials...');
    const fetchResponse = await fetch(`${baseUrl}/api/financials?symbol=${symbol}&period=quarterly`);
    const fetchData = await fetchResponse.json();
    
    if (fetchData.error) {
      console.error('Error:', fetchData.error);
      return;
    }
    
    console.log(`\nFound ${fetchData.count} quarterly records\n`);
    
    // Show the first 5 records with revenue
    console.log('First 5 records (newest first):');
    fetchData.financials.slice(0, 5).forEach((record, i) => {
      console.log(`${i + 1}. ${record.period_end_date}: Revenue = ${record.revenue ? (record.revenue / 1e6).toFixed(2) + 'M' : 'N/A'}`);
    });
    
    // Check if Q1 2026 (2025-09-30) has the correct revenue
    const q1_2026 = fetchData.financials.find(r => r.period_end_date === '2025-09-30');
    if (q1_2026) {
      console.log(`\nQ1 2026 (2025-09-30) Revenue: ${q1_2026.revenue ? (q1_2026.revenue / 1e6).toFixed(2) + 'M' : 'N/A'}`);
      console.log(`Expected: 24.402M (24,402 million)`);
      if (q1_2026.revenue) {
        const expected = 24402 * 1e6; // 24,402 million
        const actual = q1_2026.revenue;
        const diff = Math.abs(actual - expected);
        if (diff < 1e6) {
          console.log('✅ Revenue matches!');
        } else {
          console.log(`❌ Revenue mismatch! Expected: ${expected}, Got: ${actual}`);
        }
      }
    } else {
      console.log('\n❌ Q1 2026 record not found!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

const symbol = process.argv[2] || 'AIRLINK';
testFinancialAPI(symbol).catch(console.error);

