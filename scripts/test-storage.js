require('dotenv').config({ path: '.env.local' });
const { insertHistoricalData } = require('../lib/portfolio/db-client');

async function test() {
  console.log('🧪 Testing database storage...\n');
  
  const testData = [
    {
      date: '2025-01-01',
      open: 100,
      high: 110,
      low: 95,
      close: 105,
      volume: 1000,
      adjusted_close: null,
      change_pct: null,
    },
    {
      date: '2025-01-02',
      open: 105,
      high: 115,
      low: 100,
      close: 110,
      volume: 2000,
      adjusted_close: null,
      change_pct: null,
    }
  ];
  
  try {
    console.log('📝 Attempting to insert test data...');
    const result = await insertHistoricalData('crypto', 'TEST', testData, 'binance');
    console.log(`✅ Result: inserted=${result.inserted}, skipped=${result.skipped}\n`);
    
    if (result.inserted > 0) {
      console.log('✅ Storage is working!');
    } else {
      console.log('❌ No records were inserted');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
  
  process.exit(0);
}

test();



