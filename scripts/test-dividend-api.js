/**
 * Test script for scstrade.com dividend API endpoint
 * 
 * Tests the dividend data endpoint for Pakistan equities
 * Endpoint: https://scstrade.com/MarketStatistics/MS_xDates.aspx/chartact
 * 
 * Usage:
 *   node scripts/test-dividend-api.js HBL
 *   node scripts/test-dividend-api.js PTC
 *   node scripts/test-dividend-api.js OGDC
 */

const https = require('https');

// Test companies - format: "TICKER - Company Name"
const TEST_COMPANIES = [
  'HBL - Habib Bank Ltd.',
  'PTC - Pakistan Telecommunication Company Ltd.',
  'OGDC - Oil & Gas Development Company Ltd.',
  'UBL - United Bank Ltd.',
  'MCB - Muslim Commercial Bank'
];

/**
 * Fetch dividend data for a company
 */
async function fetchDividendData(companyName) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      par: companyName,
      _search: false,
      nd: Date.now(), // Current timestamp
      rows: 30,
      page: 1,
      sidx: '',
      sord: 'asc'
    });

    const options = {
      hostname: 'scstrade.com',
      path: '/MarketStatistics/MS_xDates.aspx/chartact',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Origin': 'https://scstrade.com',
        'Referer': 'https://scstrade.com/MarketStatistics/MS_xDates.aspx',
        'X-Requested-With': 'XMLHttpRequest'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsed
          });
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}\nResponse: ${data.substring(0, 500)}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Format and display dividend data
 */
function displayDividendData(companyName, result) {
  console.log('\n' + '='.repeat(80));
  console.log(`Company: ${companyName}`);
  console.log('='.repeat(80));
  console.log(`Status Code: ${result.statusCode}`);
  console.log(`Content-Type: ${result.headers['content-type']}`);
  console.log('\nRaw Response Structure:');
  console.log(JSON.stringify(result.data, null, 2));
  
  if (result.data && result.data.d && Array.isArray(result.data.d)) {
    console.log(`\n✅ Found ${result.data.d.length} dividend records\n`);
    
    // Display formatted table
    console.log('Dividend History:');
    console.log('-'.repeat(80));
    console.log('Date'.padEnd(15) + 'Dividend'.padEnd(15) + 'Bonus'.padEnd(15) + 'Right %'.padEnd(15) + 'Expiry');
    console.log('-'.repeat(80));
    
    result.data.d.forEach((record, index) => {
      const date = record.bm_bc_exp || 'N/A';
      const dividend = record.bm_dividend || 'N/A';
      const bonus = record.bm_bonus || 'N/A';
      const right = record.bm_right_per || 'N/A';
      
      console.log(
        date.padEnd(15) + 
        dividend.padEnd(15) + 
        bonus.padEnd(15) + 
        right.padEnd(15) + 
        date
      );
    });
    
    // Analyze data structure
    console.log('\n📊 Data Structure Analysis:');
    if (result.data.d.length > 0) {
      const sample = result.data.d[0];
      console.log('Sample record fields:');
      Object.keys(sample).forEach(key => {
        console.log(`  - ${key}: ${typeof sample[key]} (example: ${sample[key]})`);
      });
    }
  } else {
    console.log('\n⚠️  No dividend data found or unexpected response structure');
  }
}

/**
 * Main test function
 */
async function main() {
  const args = process.argv.slice(2);
  const companiesToTest = args.length > 0 
    ? args.map(arg => {
        // If just ticker provided, try to find full name or use as-is
        if (!arg.includes(' - ')) {
          const found = TEST_COMPANIES.find(c => c.startsWith(arg + ' - '));
          return found || `${arg} - ${arg}`;
        }
        return arg;
      })
    : TEST_COMPANIES.slice(0, 3); // Test first 3 by default
  
  // Also test with just ticker to see if it works
  if (args.length === 0) {
    console.log('\n🧪 Testing with just ticker (HBL) to see if it works...');
    try {
      const result = await fetchDividendData('HBL');
      if (result.data && result.data.d && result.data.d.length > 0 && result.data.d[0].bm_dividend) {
        console.log('✅ Just ticker works!');
        displayDividendData('HBL (ticker only)', result);
      } else {
        console.log('❌ Just ticker does not work - needs full format');
      }
    } catch (error) {
      console.log('❌ Error with just ticker:', error.message);
    }
  }

  console.log('🧪 Testing scstrade.com Dividend API');
  console.log(`Testing ${companiesToTest.length} company/companies...\n`);

  for (const company of companiesToTest) {
    try {
      console.log(`\n📡 Fetching data for: ${company}`);
      const result = await fetchDividendData(company);
      displayDividendData(company, result);
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`\n❌ Error fetching data for ${company}:`);
      console.error(error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Testing complete!');
  console.log('='.repeat(80));
}

// Run the test
main().catch(console.error);

