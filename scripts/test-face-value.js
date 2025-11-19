#!/usr/bin/env node
/**
 * Test script to fetch face value for a stock symbol
 */

async function fetchFaceValue(symbol) {
  try {
    // Ensure symbol is uppercase
    const ticker = symbol.toUpperCase();
    const url = `https://scstrade.com/stockscreening/SS_CompanySnapShot.aspx?symbol=${ticker}`;
    
    console.log(`Fetching face value for ${ticker} from: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      }
    });

    if (!response.ok) {
      console.error(`[SCSTrade] Error fetching face value for ${ticker}: ${response.status}`);
      return null;
    }

    const html = await response.text();
    
    // Look for <span id="ContentPlaceHolder1_lbl_facevalue">10.00</span>
    const match = html.match(/id="ContentPlaceHolder1_lbl_facevalue"[^>]*>([\d.,]+)</);
    
    if (match && match[1]) {
      const valueStr = match[1].replace(/,/g, ''); // Remove commas if any
      const value = parseFloat(valueStr);
      if (!isNaN(value)) {
        return value;
      }
    }
    
    console.warn(`[SCSTrade] Face value not found in HTML for ${ticker}`);
    console.log('HTML snippet around face value:', html.substring(html.indexOf('Facevalue'), html.indexOf('Facevalue') + 500));
    return null;

  } catch (error) {
    console.error(`[SCSTrade] Exception fetching face value for ${symbol}:`, error.message);
    return null;
  }
}

// Test with UBL
const symbol = process.argv[2] || 'UBL';

console.log(`\n🔍 Testing face value fetch for: ${symbol}\n`);

fetchFaceValue(symbol)
  .then((faceValue) => {
    if (faceValue !== null) {
      console.log(`✅ Face Value for ${symbol}: Rs. ${faceValue.toFixed(2)}`);
    } else {
      console.log(`❌ Could not fetch face value for ${symbol}`);
    }
    process.exit(faceValue !== null ? 0 : 1);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

