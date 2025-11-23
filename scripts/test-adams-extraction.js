/**
 * Thoroughly test extraction for ADAMS ticker
 * Tests dates and quarter labels extraction to ensure they match
 */

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
};

async function fetchHtml(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.text();
}

function extractDatesFromHeader(html) {
  const dates = [];
  const fiscalQuarters = [];
  const dateColumnIndices = [];
  let ttmOffset = 0;
  
  // Find thead section
  const theadMatch = html.match(/<thead>([\s\S]*?)<\/thead>/);
  if (!theadMatch) {
    console.log('❌ No thead found');
    return { dates, fiscalQuarters, dateColumnIndices, ttmOffset };
  }
  
  console.log('✅ Found thead section');
  
  // Extract all rows from thead
  const allRows = theadMatch[0].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
  if (!allRows || allRows.length === 0) {
    console.log('❌ No rows found in thead');
    return { dates, fiscalQuarters, dateColumnIndices, ttmOffset };
  }
  
  console.log(`✅ Found ${allRows.length} rows in thead`);
  
  // Debug: Print all rows
  console.log('\n=== THEAD ROWS ===');
  allRows.forEach((row, i) => {
    const thMatches = row.match(/<th[^>]*>([\s\S]*?)<\/th>/g);
    if (thMatches) {
      console.log(`\nRow ${i} (${thMatches.length} columns):`);
      thMatches.forEach((th, j) => {
        const text = th.replace(/<[^>]+>/g, '').trim();
        const dateId = th.match(/id="(\d{4}-\d{2}-\d{2})"/);
        const quarterMatch = text.match(/(Q[1-4]\s+\d{4})/i);
        console.log(`  Col ${j}: "${text.substring(0, 50)}" ${dateId ? `[DATE ID: ${dateId[1]}]` : ''} ${quarterMatch ? `[QUARTER: ${quarterMatch[1]}]` : ''}`);
      });
    }
  });
  
  // First, find the row with date IDs (usually first or second row)
  let dateRowIndex = -1;
  let dateRowThs = [];
  for (let i = 0; i < allRows.length; i++) {
    const thMatches = allRows[i].match(/<th[^>]*>([\s\S]*?)<\/th>/g);
    if (thMatches) {
      // Check if this row has date IDs
      const hasDateId = thMatches.some(th => th.match(/id="\d{4}-\d{2}-\d{2}"/));
      if (hasDateId) {
        dateRowIndex = i;
        dateRowThs = thMatches;
        console.log(`\n✅ Found date row at index ${i} with ${thMatches.length} columns`);
        break;
      }
    }
  }
  
  if (dateRowIndex === -1 || dateRowThs.length === 0) {
    console.log('❌ No date row found');
    return { dates, fiscalQuarters, dateColumnIndices, ttmOffset };
  }
  
  // Now find the row with quarter labels (usually the row before or after the date row)
  let quarterRowThs = [];
  for (let i = 0; i < allRows.length; i++) {
    const thMatches = allRows[i].match(/<th[^>]*>([\s\S]*?)<\/th>/g);
    if (thMatches && thMatches.length === dateRowThs.length) {
      // Check if this row has quarter labels
      const hasQuarter = thMatches.some(th => {
        const text = th.replace(/<[^>]+>/g, '').trim();
        return /Q[1-4]\s+\d{4}/i.test(text);
      });
      if (hasQuarter) {
        quarterRowThs = thMatches;
        console.log(`✅ Found quarter row at index ${i} with ${thMatches.length} columns`);
        break;
      }
    }
  }
  
  if (quarterRowThs.length === 0) {
    console.log('⚠️  No quarter row found - will try to extract from date row itself');
  }
  
  // Extract dates and map to quarter labels
  console.log('\n=== EXTRACTING DATES AND QUARTERS ===');
  dateRowThs.forEach((th, index) => {
    const dateMatch = th.match(/id="(\d{4}-\d{2}-\d{2})"/);
    if (dateMatch) {
      const date = dateMatch[1];
      dates.push(date);
      dateColumnIndices.push(index);
      
      // Try to find quarter label from the quarter row at the same index
      let quarterLabel = '';
      if (quarterRowThs.length > index) {
        const quarterTh = quarterRowThs[index];
        const quarterMatch = quarterTh.replace(/<[^>]+>/g, '').trim().match(/(Q[1-4]\s+\d{4})/i);
        if (quarterMatch) {
          quarterLabel = quarterMatch[1].trim();
        }
      }
      
      // If not found in quarter row, try in the same th element
      if (!quarterLabel) {
        const quarterMatch = th.replace(/<[^>]+>/g, '').trim().match(/(Q[1-4]\s+\d{4})/i);
        if (quarterMatch) {
          quarterLabel = quarterMatch[1].trim();
        }
      }
      
      fiscalQuarters.push(quarterLabel);
      
      console.log(`  Date: ${date} | Quarter: ${quarterLabel || 'NOT FOUND'} | Column Index: ${index}`);
    }
  });
  
  // Calculate TTM offset by checking if second column (index 1) has a date ID
  // If not, it's likely a TTM or "+X Quarters" column
  if (dateRowThs.length > 1) {
    const firstTh = dateRowThs[0];
    const secondTh = dateRowThs[1];
    
    const firstThText = firstTh.replace(/<[^>]+>/g, '').toLowerCase();
    const isLabelColumn = firstThText.includes('fiscal') || firstThText.includes('item') || firstThText.includes('period');
    
    if (isLabelColumn) {
      // Check if second column has a date ID
      const hasDateId = secondTh.match(/id="\d{4}-\d{2}-\d{2}"/);
      
      if (!hasDateId) {
        // Second column doesn't have date ID - it's likely TTM or "+X Quarters"
        const secondThText = secondTh.replace(/<[^>]+>/g, '').toLowerCase();
        if (secondThText.includes('ttm') || secondThText.includes('+') || 
            (secondThText.includes('quarter') && !secondThText.match(/\d{4}/))) {
          ttmOffset = 1;
          console.log('⚠️  TTM offset detected: 1');
        }
      } else {
        // Second column has date ID, so no TTM column
        ttmOffset = 0;
        console.log('✅ No TTM offset (second column has date)');
      }
    }
  }
  
  return { dates, fiscalQuarters, dateColumnIndices, ttmOffset };
}

async function testADAMS() {
  console.log('\n\n========================================');
  console.log('  TESTING ADAMS EXTRACTION');
  console.log('========================================\n');
  
  const symbol = 'ADAMS';
  const baseUrl = `https://stockanalysis.com/quote/psx/${symbol}/financials/`;
  const url = `${baseUrl}?p=quarterly`;
  
  console.log(`Fetching: ${url}\n`);
  
  try {
    const html = await fetchHtml(url);
    console.log(`✅ Fetched HTML (${html.length} characters)\n`);
    
    // Extract dates and quarters
    const { dates, fiscalQuarters, dateColumnIndices, ttmOffset } = extractDatesFromHeader(html);
    
    console.log('\n========================================');
    console.log('  EXTRACTION RESULTS');
    console.log('========================================\n');
    
    console.log(`Found ${dates.length} dates:`);
    console.log(`Found ${fiscalQuarters.length} quarter labels:`);
    console.log(`TTM Offset: ${ttmOffset}\n`);
    
    if (dates.length === 0) {
      console.log('❌ ERROR: No dates extracted!');
      return;
    }
    
    if (dates.length !== fiscalQuarters.length) {
      console.log(`⚠️  WARNING: Mismatch! ${dates.length} dates but ${fiscalQuarters.length} quarters`);
    }
    
    console.log('\n=== DATE-QUARTER MAPPING ===');
    const mismatches = [];
    dates.forEach((date, index) => {
      const quarter = fiscalQuarters[index] || 'MISSING';
      const status = quarter === 'MISSING' || quarter === '' ? '❌' : '✅';
      console.log(`${status} ${date} -> ${quarter || 'NOT FOUND'}`);
      
      if (!quarter || quarter === '') {
        mismatches.push({ date, index, quarter: null });
      }
    });
    
    if (mismatches.length > 0) {
      console.log(`\n❌ Found ${mismatches.length} dates without quarter labels:`);
      mismatches.forEach(m => {
        console.log(`   - ${m.date} (column ${m.index})`);
      });
    } else {
      console.log('\n✅ All dates have matching quarter labels!');
    }
    
    // Also test extracting a sample row to verify data alignment
    console.log('\n=== TESTING DATA EXTRACTION ALIGNMENT ===');
    const revenueMatch = html.search(/Revenue/i);
    if (revenueMatch !== -1) {
      const rowStart = html.lastIndexOf('<tr', revenueMatch);
      const rowEnd = html.indexOf('</tr>', revenueMatch);
      if (rowStart !== -1 && rowEnd !== -1) {
        const row = html.substring(rowStart, rowEnd + 5);
        const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
        if (cells && cells.length > 1) {
          console.log(`Revenue row has ${cells.length} cells`);
          console.log(`First cell (label): "${cells[0].replace(/<[^>]+>/g, '').trim()}"`);
          
          dates.forEach((date, dateIndex) => {
            const headerColumnIndex = dateColumnIndices[dateIndex];
            if (headerColumnIndex < cells.length) {
              const cell = cells[headerColumnIndex];
              const valStr = cell.replace(/<[^>]+>/g, '').trim();
              const quarter = fiscalQuarters[dateIndex] || 'MISSING';
              console.log(`  ${date} (${quarter}) [col ${headerColumnIndex}]: ${valStr.substring(0, 30)}`);
            }
          });
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

// Run the test
testADAMS().catch(console.error);


