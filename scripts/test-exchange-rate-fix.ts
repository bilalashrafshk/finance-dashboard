import { Pool } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { getSBPEconomicData } from '../lib/portfolio/db-client';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

async function testExchangeRateFix() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error('❌ No DATABASE_URL found');
    process.exit(1);
  }

  console.log('🔍 Testing exchange rate fetching fix...\n');

  try {
    // Test 1: Get latest exchange rate (no date restrictions)
    console.log('Test 1: Getting latest exchange rate (any date)...');
    const latestResult = await getSBPEconomicData('TS_GP_ER_FAERPKR_M.E00220');
    
    if (latestResult.data.length > 0) {
      const sorted = [...latestResult.data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const latest = sorted[0];
      console.log(`✅ Latest exchange rate: ${latest.value} PKR/USD (Date: ${latest.date})\n`);
    } else {
      console.log('❌ No exchange rate data found in database\n');
    }

    // Test 2: Get exchange rate with old date range (should still work)
    console.log('Test 2: Getting exchange rate with old date range (last 3 months)...');
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const oldResult = await getSBPEconomicData(
      'TS_GP_ER_FAERPKR_M.E00220',
      threeMonthsAgo.toISOString().split('T')[0],
      new Date().toISOString().split('T')[0]
    );
    
    if (oldResult.data.length > 0) {
      const sorted = [...oldResult.data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const latest = sorted[0];
      console.log(`✅ Latest in range: ${latest.value} PKR/USD (Date: ${latest.date})\n`);
    } else {
      console.log('❌ No exchange rate data in date range\n');
    }

    // Test 3: Simulate the new logic (get latest regardless of date)
    console.log('Test 3: Simulating new logic (get latest available, no date restriction)...');
    const allData = await getSBPEconomicData('TS_GP_ER_FAERPKR_M.E00220');
    
    if (allData.data.length > 0) {
      // Sort by date descending to get the most recent
      const sorted = [...allData.data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const latest = sorted[0];
      console.log(`✅ Latest available exchange rate: ${latest.value} PKR/USD`);
      console.log(`   Date: ${latest.date}`);
      console.log(`   This is what should be used in unified mode!\n`);
    } else {
      console.log('❌ No exchange rate data available at all\n');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testExchangeRateFix().catch(console.error);

