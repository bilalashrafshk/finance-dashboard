/**
 * Test script for State Bank of Pakistan EasyData API
 * 
 * Usage:
 *   npx tsx test_sbp_api.ts --api-key=your_api_key --series-key=TS_GP_IR_SIRPR_AH.SIRPR001 --start-date=2020-01-01
 *   OR
 *   SBP_API_KEY=your_api_key npx tsx test_sbp_api.ts
 */

interface SBPAPIResponse {
  columns: string[];
  rows: Array<Array<string | number>>;
}

interface TestConfig {
  apiKey?: string;
  seriesKey?: string;
  startDate?: string;
  endDate?: string;
  format?: 'json' | 'csv';
}

async function testSBPSeriesAPI(config: TestConfig) {
  const {
    apiKey = process.env.SBP_API_KEY,
    seriesKey = 'TS_GP_IR_SIRPR_AH.SIRPR001', // Policy (Target) Rate - example key
    startDate,
    endDate,
    format = 'json'
  } = config;

  if (!apiKey) {
    console.error('❌ API key is required!');
    console.log('Set SBP_API_KEY environment variable or pass --api-key parameter');
    process.exit(1);
  }

  // Build URL
  const baseUrl = 'https://easydata.sbp.org.pk/api/v1/series';
  const params = new URLSearchParams({
    api_key: apiKey,
    format: format
  });

  if (startDate) {
    params.append('start_date', startDate);
  }
  if (endDate) {
    params.append('end_date', endDate);
  }

  const url = `${baseUrl}/${seriesKey}/data?${params.toString()}`;
  
  console.log('🔍 Testing SBP EasyData API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Series Key: ${seriesKey}`);
  console.log(`Start Date: ${startDate || 'Not specified (most recent only)'}`);
  console.log(`End Date: ${endDate || 'Today'}`);
  console.log(`Format: ${format}`);
  console.log(`URL: ${url.replace(apiKey, '***REDACTED***')}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Note: The Python example uses verify=False, but we'll try with default SSL
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API Error (${response.status}):`);
      
      if (response.status === 401) {
        console.error('   Unauthorized - Please check your API key is correct.');
        console.error('   Get your API key from: https://easydata.sbp.org.pk (My Data Basket)');
      } else if (response.status === 404) {
        console.error('   Series not found - Please check the series key is correct.');
        console.error('   Example format: TS_GP_IR_SIRPR_AH.SIRPR001');
      } else {
        console.error('   Response:', errorText.substring(0, 500));
      }
      return;
    }

    if (format === 'csv') {
      const csvText = await response.text();
      console.log('✅ CSV Response:');
      console.log(csvText);
      return;
    }

    const data: SBPAPIResponse = await response.json();
    
    console.log('✅ API Response Received');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Columns: ${data.columns.join(', ')}`);
    console.log(`Total Rows: ${data.rows.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (data.rows.length === 0) {
      console.log('⚠️  No data returned. Check if the series key is correct.');
      return;
    }

    // Display first few rows
    console.log('📊 Sample Data (first 10 rows):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Print header
    console.log(data.columns.map((col, i) => {
      const maxWidth = Math.max(col.length, ...data.rows.slice(0, 10).map(r => String(r[i] || '').length));
      return col.padEnd(Math.min(maxWidth, 30));
    }).join(' | '));
    console.log('━'.repeat(80));

    // Print rows
    data.rows.slice(0, 10).forEach((row, idx) => {
      console.log(row.map((cell, i) => {
        const maxWidth = Math.max(data.columns[i].length, ...data.rows.slice(0, 10).map(r => String(r[i] || '').length));
        return String(cell || '').padEnd(Math.min(maxWidth, 30));
      }).join(' | '));
    });

    if (data.rows.length > 10) {
      console.log(`\n... and ${data.rows.length - 10} more rows`);
    }

    // Summary statistics
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 Summary:');
    
    // Find date and value columns
    const dateColIdx = data.columns.findIndex(col => 
      col.toLowerCase().includes('date') || col.toLowerCase().includes('observation date')
    );
    const valueColIdx = data.columns.findIndex(col => 
      col.toLowerCase().includes('value') || col.toLowerCase().includes('observation value')
    );

    if (dateColIdx !== -1 && valueColIdx !== -1) {
      const dates = data.rows.map(row => row[dateColIdx] as string).filter(Boolean);
      const values = data.rows.map(row => parseFloat(String(row[valueColIdx] || 0))).filter(v => !isNaN(v));
      
      if (dates.length > 0) {
        console.log(`Date Range: ${dates[dates.length - 1]} to ${dates[0]}`);
      }
      
      if (values.length > 0) {
        const sortedValues = [...values].sort((a, b) => a - b);
        console.log(`Value Range: ${sortedValues[0]} to ${sortedValues[sortedValues.length - 1]}`);
        console.log(`Latest Value: ${values[0]}`);
        console.log(`Average Value: ${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)}`);
      }
    }

    console.log('\n✅ Test completed successfully!');

  } catch (error: any) {
    console.error('❌ Error fetching data:', error.message);
    if (error.message.includes('certificate') || error.message.includes('SSL') || error.message.includes('ENOTFOUND')) {
      console.log('\n💡 Network Error - Possible issues:');
      console.log('   - Check your internet connection');
      console.log('   - Verify the API endpoint is accessible');
      if (error.message.includes('certificate')) {
        console.log('   - SSL certificate issue (unlikely with Node.js fetch)');
      }
    } else if (error.message.includes('fetch')) {
      console.log('\n💡 Fetch Error - This might be a network or CORS issue.');
    }
  }
}

// Parse command line arguments
function parseArgs(): TestConfig {
  const args = process.argv.slice(2);
  const config: TestConfig = {};

  args.forEach(arg => {
    if (arg.startsWith('--api-key=')) {
      config.apiKey = arg.split('=')[1];
    } else if (arg.startsWith('--series-key=')) {
      config.seriesKey = arg.split('=')[1];
    } else if (arg.startsWith('--start-date=')) {
      config.startDate = arg.split('=')[1];
    } else if (arg.startsWith('--end-date=')) {
      config.endDate = arg.split('=')[1];
    } else if (arg.startsWith('--format=')) {
      config.format = arg.split('=')[1] as 'json' | 'csv';
    }
  });

  return config;
}

// Main execution
async function main() {
  const config = parseArgs();
  
  // Test with different series keys based on the interest rate dataset
  // Series keys from: https://easydata.sbp.org.pk/api/v1/dataset/TS_GP_IR_SIRPR_AH/meta
  const seriesKeys = [
    'TS_GP_IR_SIRPR_AH.SBPOL0010', // Reverse Repo Rate (since 1956)
    'TS_GP_IR_SIRPR_AH.SBPOL0020', // Repo Rate (since 2009)
    'TS_GP_IR_SIRPR_AH.SBPOL0030', // Policy (Target) Rate (since 2015)
  ];

  // If a specific series key is provided, test only that one
  if (config.seriesKey) {
    await testSBPSeriesAPI(config);
  } else {
    // Test with the first series key
    console.log('ℹ️  No series key provided. Testing with example key.');
    console.log('   Use --series-key=YOUR_KEY to test a specific series.\n');
    await testSBPSeriesAPI({ ...config, seriesKey: seriesKeys[0] });
  }
}

main().catch(console.error);

