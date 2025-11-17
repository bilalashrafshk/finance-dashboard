/**
 * Backfill Dividend Data Script
 * 
 * Fetches and stores dividend data for existing PK equity companies in the database
 * 
 * Usage:
 *   node scripts/backfill-dividends.js
 *   node scripts/backfill-dividends.js HBL PTC OGDC  # Specific tickers
 */

const https = require('https');
const path = require('path');

// Load environment variables from .env.local
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
} catch (e) {
  try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  } catch (e2) {
    // Continue without dotenv if not available
  }
}

// Get database connection from environment
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.error('Error: DATABASE_URL or POSTGRES_URL environment variable is required');
  process.exit(1);
}

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

/**
 * Parse dividend percentage to amount (percent/10)
 */
function parseDividendAmount(dividendStr) {
  if (!dividendStr || typeof dividendStr !== 'string') return null;
  const trimmed = dividendStr.trim();
  if (trimmed === '') return null;
  const match = trimmed.match(/^([\d.]+)/);
  if (!match) return null;
  const numericValue = parseFloat(match[1]);
  if (isNaN(numericValue)) return null;
  return numericValue / 10;
}

/**
 * Parse date from "DD MMM YYYY" to "YYYY-MM-DD"
 */
function parseDividendDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (trimmed === '') return null;
  
  const months = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };
  
  const parts = trimmed.split(' ');
  if (parts.length !== 3) return null;
  
  const [day, month, year] = parts;
  const monthNum = months[month];
  if (!monthNum) return null;
  
  const dayNum = parseInt(day, 10);
  const yearNum = parseInt(year, 10);
  if (isNaN(dayNum) || isNaN(yearNum) || dayNum < 1 || dayNum > 31 || yearNum < 1900 || yearNum > 2100) {
    return null;
  }
  
  return `${year}-${monthNum}-${day.padStart(2, '0')}`;
}

/**
 * Check if dividend record is valid
 */
function isValidDividendRecord(record) {
  if (!record.bm_dividend || record.bm_dividend.trim() === '') return false;
  if (!record.bm_bc_exp || record.bm_bc_exp.trim() === '') return false;
  const amount = parseDividendAmount(record.bm_dividend);
  if (amount === null) return false;
  const date = parseDividendDate(record.bm_bc_exp);
  if (date === null) return false;
  return true;
}

/**
 * Fetch dividend data from scstrade.com
 */
function fetchDividendData(ticker) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      par: ticker.toUpperCase(),
      _search: false,
      nd: Date.now(),
      rows: 100,
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
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Store dividend data in database
 */
async function storeDividendData(ticker, dividendRecords) {
  if (!dividendRecords || dividendRecords.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const values = [];
    const placeholders = [];

    dividendRecords.forEach((record, index) => {
      const baseIndex = index * 5;
      placeholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5})`
      );
      values.push(
        'pk-equity',
        ticker.toUpperCase(),
        record.date,
        record.dividend_amount,
        'scstrade'
      );
    });

    const result = await client.query(
      `INSERT INTO dividend_data 
       (asset_type, symbol, date, dividend_amount, source)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (asset_type, symbol, date) 
       DO UPDATE SET 
         dividend_amount = EXCLUDED.dividend_amount,
         source = EXCLUDED.source,
         updated_at = NOW()`,
      values
    );

    await client.query('COMMIT');
    return { inserted: result.rowCount || 0, skipped: dividendRecords.length - (result.rowCount || 0) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all PK equity tickers from database
 */
async function getPKEquityTickers() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT DISTINCT symbol 
       FROM historical_price_data 
       WHERE asset_type = 'pk-equity'
       ORDER BY symbol`
    );
    return result.rows.map(row => row.symbol);
  } finally {
    client.release();
  }
}

/**
 * Process a single ticker
 */
async function processTicker(ticker) {
  try {
    console.log(`\n📊 Processing ${ticker}...`);
    
    // Check if already has dividend data
    const client = await pool.connect();
    let hasData = false;
    try {
      const result = await client.query(
        `SELECT COUNT(*) as count FROM dividend_data WHERE asset_type = 'pk-equity' AND symbol = $1`,
        [ticker.toUpperCase()]
      );
      hasData = parseInt(result.rows[0]?.count || '0', 10) > 0;
    } finally {
      client.release();
    }

    if (hasData) {
      console.log(`  ⏭️  ${ticker} already has dividend data, skipping`);
      return { ticker, status: 'skipped', reason: 'already_exists' };
    }

    // Fetch dividend data
    console.log(`  📡 Fetching dividend data for ${ticker}...`);
    const response = await fetchDividendData(ticker);

    if (!response.d || !Array.isArray(response.d)) {
      console.log(`  ⚠️  ${ticker}: Invalid response format`);
      return { ticker, status: 'error', reason: 'invalid_response' };
    }

    // Parse and filter valid records
    const dividendRecords = [];
    for (const record of response.d) {
      if (!isValidDividendRecord(record)) continue;

      const dividendAmount = parseDividendAmount(record.bm_dividend);
      const date = parseDividendDate(record.bm_bc_exp);

      if (dividendAmount !== null && date !== null) {
        dividendRecords.push({ date, dividend_amount: dividendAmount });
      }
    }

    if (dividendRecords.length === 0) {
      console.log(`  ℹ️  ${ticker}: No dividend data available`);
      return { ticker, status: 'no_data', count: 0 };
    }

    // Store in database
    console.log(`  💾 Storing ${dividendRecords.length} dividend records for ${ticker}...`);
    const result = await storeDividendData(ticker, dividendRecords);
    console.log(`  ✅ ${ticker}: Stored ${result.inserted} records (${result.skipped} skipped)`);

    return { ticker, status: 'success', count: result.inserted };
  } catch (error) {
    console.error(`  ❌ ${ticker}: Error - ${error.message}`);
    return { ticker, status: 'error', reason: error.message };
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  let tickers = [];

  if (args.length > 0) {
    // Use provided tickers
    tickers = args.map(t => t.toUpperCase());
  } else {
    // Get all PK equity tickers from database
    console.log('📋 Fetching PK equity tickers from database...');
    tickers = await getPKEquityTickers();
    console.log(`Found ${tickers.length} tickers in database`);
  }

  if (tickers.length === 0) {
    console.log('No tickers to process');
    await pool.end();
    return;
  }

  console.log(`\n🚀 Starting dividend backfill for ${tickers.length} ticker(s)...`);
  console.log('='.repeat(80));

  const results = [];
  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    const result = await processTicker(ticker);
    results.push(result);

    // Small delay between requests to avoid rate limiting
    if (i < tickers.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  
  const success = results.filter(r => r.status === 'success');
  const skipped = results.filter(r => r.status === 'skipped');
  const noData = results.filter(r => r.status === 'no_data');
  const errors = results.filter(r => r.status === 'error');

  console.log(`✅ Success: ${success.length}`);
  console.log(`⏭️  Skipped (already exists): ${skipped.length}`);
  console.log(`ℹ️  No data: ${noData.length}`);
  console.log(`❌ Errors: ${errors.length}`);

  if (success.length > 0) {
    const totalRecords = success.reduce((sum, r) => sum + (r.count || 0), 0);
    console.log(`\n📈 Total dividend records stored: ${totalRecords}`);
  }

  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(r => {
      console.log(`  - ${r.ticker}: ${r.reason}`);
    });
  }

  await pool.end();
  console.log('\n✅ Backfill complete!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

