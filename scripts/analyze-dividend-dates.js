/**
 * Analyze dividend data to find oldest dates and anomalies
 */

const https = require('https');

const TEST_TICKERS = [
  'HBL', 'PTC', 'OGDC', 'UBL', 'MEBL', 'MCB', 'LUCK', 'ENGRO',
  'ABL', 'BAFL', 'BAHL', 'JSBL'
];

async function fetchDividendData(ticker) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      par: ticker,
      _search: false,
      nd: Date.now(),
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
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  
  const months = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };
  
  const parts = dateStr.trim().split(' ');
  if (parts.length !== 3) return null;
  
  const [day, month, year] = parts;
  if (!months[month]) return null;
  
  return new Date(`${year}-${months[month]}-${day.padStart(2, '0')}`);
}

function parseDividend(dividendStr) {
  if (!dividendStr || dividendStr.trim() === '') return null;
  const match = dividendStr.match(/^([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

async function analyzeAllData() {
  const allDates = [];
  const anomalies = [];
  const companyStats = {};

  console.log('📊 Analyzing dividend data from all tested companies...\n');

  for (const ticker of TEST_TICKERS) {
    try {
      const result = await fetchDividendData(ticker);
      
      if (!result.d || result.d.length === 0) {
        console.log(`⚠️  ${ticker}: No data`);
        continue;
      }

      const validRecords = result.d.filter(r => 
        r.bm_bc_exp && r.bm_bc_exp.trim() !== '' &&
        (r.bm_dividend || r.bm_bonus || r.bm_right_per)
      );

      if (validRecords.length === 0) {
        console.log(`⚠️  ${ticker}: No valid records`);
        continue;
      }

      const dates = validRecords
        .map(r => parseDate(r.bm_bc_exp))
        .filter(d => d !== null)
        .sort((a, b) => a - b);

      if (dates.length === 0) continue;

      const oldestDate = dates[0];
      const newestDate = dates[dates.length - 1];
      
      allDates.push(...dates);
      
      companyStats[ticker] = {
        name: validRecords[0].company_name,
        recordCount: validRecords.length,
        oldestDate: oldestDate,
        newestDate: newestDate,
        dateRange: `${oldestDate.toISOString().split('T')[0]} to ${newestDate.toISOString().split('T')[0]}`
      };

      // Check for anomalies
      validRecords.forEach(record => {
        // Missing % sign
        if (record.bm_dividend && !record.bm_dividend.includes('%') && record.bm_dividend.trim() !== '') {
          anomalies.push({
            ticker,
            type: 'Missing % sign in dividend',
            value: record.bm_dividend,
            date: record.bm_bc_exp
          });
        }

        // Double % sign
        if (record.bm_dividend && record.bm_dividend.includes('%%')) {
          anomalies.push({
            ticker,
            type: 'Double % sign',
            value: record.bm_dividend,
            date: record.bm_bc_exp
          });
        }

        // Missing space before annotation
        if (record.bm_dividend && /%\w/.test(record.bm_dividend)) {
          anomalies.push({
            ticker,
            type: 'Missing space before annotation',
            value: record.bm_dividend,
            date: record.bm_bc_exp
          });
        }

        // Trailing whitespace in company name
        if (record.company_name && record.company_name.trim() !== record.company_name) {
          anomalies.push({
            ticker,
            type: 'Trailing whitespace in company name',
            value: `"${record.company_name}"`,
            date: record.bm_bc_exp
          });
        }

        // Bonus with descriptive text
        if (record.bm_bonus && record.bm_bonus.includes('Share for every')) {
          anomalies.push({
            ticker,
            type: 'Bonus with descriptive text',
            value: record.bm_bonus,
            date: record.bm_bc_exp
          });
        }

        // Right shares present
        if (record.bm_right_per && record.bm_right_per.trim() !== '') {
          anomalies.push({
            ticker,
            type: 'Right shares present',
            value: record.bm_right_per,
            date: record.bm_bc_exp
          });
        }

        // Very high dividend (>100%)
        const divValue = parseDividend(record.bm_dividend);
        if (divValue && divValue > 100) {
          anomalies.push({
            ticker,
            type: 'Very high dividend (>100%)',
            value: record.bm_dividend,
            date: record.bm_bc_exp
          });
        }

        // Records with only bonus/right, no dividend
        if (!record.bm_dividend || record.bm_dividend.trim() === '') {
          if (record.bm_bonus && record.bm_bonus.trim() !== '') {
            anomalies.push({
              ticker,
              type: 'Only bonus, no dividend',
              value: `Bonus: ${record.bm_bonus}`,
              date: record.bm_bc_exp
            });
          }
          if (record.bm_right_per && record.bm_right_per.trim() !== '') {
            anomalies.push({
              ticker,
              type: 'Only right shares, no dividend',
              value: `Right: ${record.bm_right_per}`,
              date: record.bm_bc_exp
            });
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`❌ Error fetching ${ticker}:`, error.message);
    }
  }

  // Find oldest date
  const sortedDates = allDates.sort((a, b) => a - b);
  const oldestDate = sortedDates[0];
  const newestDate = sortedDates[sortedDates.length - 1];

  console.log('\n' + '='.repeat(80));
  console.log('📅 DATE RANGE ANALYSIS');
  console.log('='.repeat(80));
  console.log(`\nOldest date found: ${oldestDate.toISOString().split('T')[0]} (${oldestDate.toLocaleDateString()})`);
  console.log(`Newest date found: ${newestDate.toISOString().split('T')[0]} (${newestDate.toLocaleDateString()})`);
  console.log(`Total date span: ${Math.round((newestDate - oldestDate) / (1000 * 60 * 60 * 24))} days`);
  console.log(`Total date span: ${Math.round((newestDate - oldestDate) / (1000 * 60 * 60 * 24 * 365.25))} years`);

  console.log('\n' + '='.repeat(80));
  console.log('🏢 COMPANY STATISTICS');
  console.log('='.repeat(80));
  Object.entries(companyStats).forEach(([ticker, stats]) => {
    console.log(`\n${ticker} (${stats.name.trim()})`);
    console.log(`  Records: ${stats.recordCount}`);
    console.log(`  Date Range: ${stats.dateRange}`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('⚠️  ANOMALIES FOUND');
  console.log('='.repeat(80));
  
  if (anomalies.length === 0) {
    console.log('\n✅ No anomalies found!');
  } else {
    const grouped = {};
    anomalies.forEach(anomaly => {
      if (!grouped[anomaly.type]) {
        grouped[anomaly.type] = [];
      }
      grouped[anomaly.type].push(anomaly);
    });

    Object.entries(grouped).forEach(([type, items]) => {
      console.log(`\n${type} (${items.length} occurrences):`);
      items.slice(0, 5).forEach(item => {
        console.log(`  - ${item.ticker}: ${item.value} (${item.date})`);
      });
      if (items.length > 5) {
        console.log(`  ... and ${items.length - 5} more`);
      }
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Analysis complete!');
  console.log('='.repeat(80));
}

analyzeAllData().catch(console.error);



