/**
 * Test script to inspect the actual HTML structure from stockanalysis.com
 * and compare it with what our scraper extracts
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
};

async function fetchHtml(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

function extractDatesFromHeader(html) {
  const dates = [];
  const dateColumnIndices = [];
  let ttmOffset = 0;
  
  // Find thead section
  const theadMatch = html.match(/<thead>([\s\S]*?)<\/thead>/);
  if (!theadMatch) return { dates, dateColumnIndices, ttmOffset };
  
  // Find first <tr> in thead (Fiscal Quarter/Fiscal Year row)
  const firstRowMatch = theadMatch[0].match(/<tr[^>]*>([\s\S]*?)<\/tr>/);
  if (!firstRowMatch) return { dates, dateColumnIndices, ttmOffset };
  
  // Extract all <th> elements from first row
  const allThMatches = firstRowMatch[0].match(/<th[^>]*>([\s\S]*?)<\/th>/g);
  if (!allThMatches) return { dates, dateColumnIndices, ttmOffset };
  
  console.log('\n=== HEADER ANALYSIS ===');
  console.log('Total <th> elements:', allThMatches.length);
  allThMatches.forEach((th, i) => {
    const text = th.replace(/<[^>]+>/g, '').trim();
    const hasDateId = th.match(/id="(\d{4}-\d{2}-\d{2})"/);
    console.log(`Column ${i}: "${text}" ${hasDateId ? `[DATE: ${hasDateId[1]}]` : ''}`);
  });
  
  // Iterate through all <th> elements and find which ones have date IDs
  allThMatches.forEach((th, index) => {
    const dateMatch = th.match(/id="(\d{4}-\d{2}-\d{2})"/);
    if (dateMatch) {
      dates.push(dateMatch[1]);
      dateColumnIndices.push(index);
    }
  });
  
  // Calculate TTM offset
  if (allThMatches.length > 1) {
    const firstTh = allThMatches[0];
    const secondTh = allThMatches[1];
    
    const firstThText = firstTh.replace(/<[^>]+>/g, '').toLowerCase();
    const isLabelColumn = firstThText.includes('fiscal') || firstThText.includes('item') || firstThText.includes('period');
    
    if (isLabelColumn) {
      const hasDateId = secondTh.match(/id="\d{4}-\d{2}-\d{2}"/);
      
      if (!hasDateId) {
        const secondThText = secondTh.replace(/<[^>]+>/g, '').toLowerCase();
        if (secondThText.includes('ttm') || secondThText.includes('+') || 
            (secondThText.includes('quarter') && !secondThText.match(/\d{4}/))) {
          ttmOffset = 1;
        }
      } else {
        ttmOffset = 0;
      }
    }
  }
  
  return { dates, dateColumnIndices, ttmOffset };
}

function extractRowValues(html, label) {
  const safeLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeLabelAmp = safeLabel.replace('&', '&amp;');
  
  // Try to find the label
  let labelIndex = html.search(new RegExp(`>${safeLabelAmp}<`, 'i'));
  if (labelIndex === -1) {
    labelIndex = html.search(new RegExp(`>${safeLabel}<`, 'i'));
  }
  
  if (labelIndex === -1) {
    console.log(`Label "${label}" not found`);
    return [];
  }
  
  // Find the row
  const rowStart = html.lastIndexOf('<tr', labelIndex);
  const rowEnd = html.indexOf('</tr>', labelIndex);
  
  if (rowStart === -1 || rowEnd === -1) {
    console.log(`Row not found for "${label}"`);
    return [];
  }
  
  const row = html.substring(rowStart, rowEnd + 5);
  const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
  
  if (!cells || cells.length <= 1) {
    console.log(`No cells found for "${label}"`);
    return [];
  }
  
  console.log(`\nRow has ${cells.length} cells`);
  console.log(`First cell (label): "${cells[0].replace(/<[^>]+>/g, '').trim()}"`);
  console.log(`Second cell: "${cells[1].replace(/<[^>]+>/g, '').trim()}"`);
  console.log(`Third cell: "${cells[2].replace(/<[^>]+>/g, '').trim()}"`);
  
  // Return ALL cells including the label (index 0)
  const values = [];
  for (let i = 0; i < cells.length; i++) {
    const valStr = cells[i].replace(/<[^>]+>/g, '').trim();
    values.push(valStr);
  }
  
  return values;
}

async function testSymbol(symbol) {
  console.log(`\n\n=== TESTING ${symbol} ===\n`);
  
  const baseUrl = `https://stockanalysis.com/quote/psx/${symbol}/financials/`;
  const url = `${baseUrl}?p=quarterly`;
  
  console.log(`Fetching: ${url}`);
  const html = await fetchHtml(url);
  
  // Extract dates
  const { dates, dateColumnIndices, ttmOffset } = extractDatesFromHeader(html);
  console.log(`\nExtracted ${dates.length} dates:`, dates);
  console.log(`Date column indices:`, dateColumnIndices);
  console.log(`TTM Offset: ${ttmOffset}`);
  
  // Test extracting Revenue row
  console.log('\n=== REVENUE ROW ===');
  const revenueValues = extractRowValues(html, 'Revenue');
  console.log(`Found ${revenueValues.length} values:`, revenueValues);
  
  // Map values to dates using the new method
  console.log('\n=== MAPPING VALUES TO DATES (NEW METHOD) ===');
  dates.forEach((date, dateIndex) => {
    const headerColumnIndex = dateColumnIndices[dateIndex];
    const dataCellIndex = headerColumnIndex;
    if (dataCellIndex < revenueValues.length) {
      const val = revenueValues[dataCellIndex];
      console.log(`${date} (col ${headerColumnIndex}): ${val}`);
    }
  });
  
  // Also check "Total Revenue" if it exists
  console.log('\n=== TOTAL REVENUE ROW ===');
  const totalRevenueValues = extractRowValues(html, 'Total Revenue');
  if (totalRevenueValues.length > 0) {
    console.log(`Found ${totalRevenueValues.length} values:`, totalRevenueValues);
  }
}

async function main() {
  const symbol = process.argv[2] || 'AIRLINK';
  await testSymbol(symbol);
}

main().catch(console.error);

