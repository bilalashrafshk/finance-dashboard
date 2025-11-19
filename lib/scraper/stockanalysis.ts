import { FinancialStatement, CompanyProfile } from './types';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
};

// Helper to parse "1.06T", "767.38B", "574.68M" into numbers
function parseMetricValue(str: string): number | undefined {
  if (!str || str === 'n/a' || str === '-' || str === '') return undefined;
  
  const cleanStr = str.replace(/,/g, '').trim();
  const lastChar = cleanStr.slice(-1).toUpperCase();
  const numPart = parseFloat(cleanStr.slice(0, -1));

  if (isNaN(numPart) && !isNaN(parseFloat(cleanStr))) {
    return parseFloat(cleanStr); // Just a number
  }

  switch (lastChar) {
    case 'T': return numPart * 1e12;
    case 'B': return numPart * 1e9;
    case 'M': return numPart * 1e6;
    case 'K': return numPart * 1e3;
    case '%': return parseFloat(cleanStr.slice(0, -1)); // Keep as percentage number (e.g., 6.13)
    default: return isNaN(parseFloat(cleanStr)) ? undefined : parseFloat(cleanStr);
  }
}

// Helper to fetch HTML
async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.text();
}

/**
 * Scrapes the Profile & Statistics pages to get Static Data (Sector, Market Cap, Float)
 */
export async function scrapeCompanyProfile(symbol: string): Promise<CompanyProfile> {
  const baseUrl = `https://stockanalysis.com/quote/psx/${symbol}`;
  
  // 1. Fetch Overview for Sector/Industry/Name
  const overviewHtml = await fetchHtml(`${baseUrl}/`);
  
  // Extract Name
  const nameMatch = overviewHtml.match(/<h1[^>]*>([^<]+)\s*\(PSX:/i);
  const name = nameMatch ? nameMatch[1].trim() : symbol;
  
  // Extract Sector & Industry from div structure
  // Structure: <span class="block font-semibold">Industry</span> <!--[!--><span>Oil &amp; Gas</span>
  // Or: <span class="block font-semibold">Sector</span> <!--[--><a href="/stocks/sector/energy/">Energy</a>
  const getDivValue = (label: string): string | undefined => {
    // Find the label, then find the next span with the value
    const labelIndex = overviewHtml.indexOf(`${label}</span>`);
    if (labelIndex === -1) return undefined;
    
    const afterLabel = overviewHtml.substring(labelIndex);
    const spanMatch = afterLabel.match(/<span>([^<]+)<\/span>/);
    if (spanMatch) {
      // Extract text and handle HTML entities
      const text = spanMatch[1].replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
      return text || undefined;
    }
    return undefined;
  };
  
  // Extract Industry (plain text in span)
  let industry = getDivValue('Industry');
  
  // Extract Sector (from link, with fallback to div structure)
  let sector: string | undefined;
  const sectorLabelIndex = overviewHtml.indexOf('Sector</span>');
  if (sectorLabelIndex !== -1) {
    const afterSectorLabel = overviewHtml.substring(sectorLabelIndex);
    const sectorLinkMatch = afterSectorLabel.match(/href="\/stocks\/sector\/[^"]+"[^>]*>([^<]+)<\/a>/);
    if (sectorLinkMatch) {
      sector = sectorLinkMatch[1].trim();
    }
  }
  
  // Fallback: try direct link match anywhere in the HTML
  if (!sector) {
    const directLinkMatch = overviewHtml.match(/href="\/stocks\/sector\/[^"]+"[^>]*>([^<]+)<\/a>/);
    sector = directLinkMatch ? directLinkMatch[1] : undefined;
  }
  
  // 2. Fetch Statistics for Float & Shares
  const statsHtml = await fetchHtml(`${baseUrl}/statistics/`);
  
  const getStat = (label: string) => {
    // Find the label, then find the NEXT td cell (not the one containing the label)
    const labelIndex = statsHtml.indexOf(`>${label}<`);
    if (labelIndex === -1) return undefined;
    
    // Look for the next <td> after the label
    const afterLabel = statsHtml.substring(labelIndex);
    const tdMatch = afterLabel.match(/<td[^>]*>([^<]+)<\/td>/);
    if (tdMatch) {
      return parseMetricValue(tdMatch[1].trim());
    }
    return undefined;
  };
  
  return {
    symbol,
    name,
    sector: sector || 'Unknown',
    industry: industry || 'Unknown',
    marketCap: getStat('Market Cap'),
    sharesOutstanding: getStat('Shares Outstanding'),
    float: getStat('Float')
  };
}

/**
 * Scrapes the Financials pages to get Time Series Data
 */
export async function scrapeFinancials(symbol: string, period: 'quarterly' | 'annual' = 'quarterly'): Promise<FinancialStatement[]> {
  const baseUrl = `https://stockanalysis.com/quote/psx/${symbol}/financials/`;
  const periodParam = `?p=${period}`;
  
  const statements: Record<string, Partial<FinancialStatement>> = {};
  
  // Helper to extract dates from thead (first row with date IDs)
  const extractDatesFromHeader = (html: string): { dates: string[], ttmOffset: number } => {
    const dates: string[] = [];
    let ttmOffset = 0;
    
    // Find thead section
    const theadMatch = html.match(/<thead>([\s\S]*?)<\/thead>/);
    if (!theadMatch) return { dates, ttmOffset };
    
    // Find first <tr> in thead (Fiscal Quarter/Fiscal Year row)
    const firstRowMatch = theadMatch[0].match(/<tr[^>]*>([\s\S]*?)<\/tr>/);
    if (!firstRowMatch) return { dates, ttmOffset };
    
    // Extract all <th> elements from first row
    const allThMatches = firstRowMatch[0].match(/<th[^>]*>([\s\S]*?)<\/th>/g);
    if (!allThMatches) return { dates, ttmOffset };
    
    // Extract all <th> elements with id="YYYY-MM-DD" from first row (these are the actual date columns)
    const thMatches = firstRowMatch[0].match(/<th[^>]*id="(\d{4}-\d{2}-\d{2})"[^>]*>/g);
    if (thMatches) {
      thMatches.forEach(m => {
        const dateMatch = m.match(/id="(\d{4}-\d{2}-\d{2})"/);
        if (dateMatch) dates.push(dateMatch[1]);
      });
    }
    
    // Calculate TTM offset by comparing total columns vs date columns
    // Total columns = allThMatches.length (includes label + TTM if present + dates)
    // Date columns = dates.length
    // Label column = 1 (always present)
    // So: allThMatches.length = 1 (label) + ttmOffset + dates.length
    // Therefore: ttmOffset = allThMatches.length - 1 - dates.length
    
    const totalColumns = allThMatches.length;
    const dateColumns = dates.length;
    const labelColumn = 1;
    
    // Calculate expected offset
    const calculatedOffset = totalColumns - labelColumn - dateColumns;
    
    // Verify by checking the second column (after label)
    if (allThMatches.length > 1) {
      const firstTh = allThMatches[0];
      const secondTh = allThMatches[1];
      
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
          } else {
            // Use calculated offset if it makes sense
            ttmOffset = calculatedOffset > 0 ? calculatedOffset : 0;
          }
        } else {
          // Second column has date ID, so no TTM column
          ttmOffset = 0;
        }
      } else {
        // First column might not be label, use calculated offset
        ttmOffset = calculatedOffset > 0 ? calculatedOffset : 0;
      }
    }
    
    return { dates, ttmOffset };
  };
  
  // Helper to process a page and extract rows
  const processPage = (html: string, type: 'income' | 'balance' | 'cashflow') => {
    // 1. Extract Dates (Columns) from Header and TTM offset
    const { dates, ttmOffset: headerTtmOffset } = extractDatesFromHeader(html);
    
    if (dates.length === 0) return;
    
    // Initialize objects for these dates
    dates.forEach(date => {
      if (!statements[date]) {
        statements[date] = { symbol, periodEndDate: date, periodType: period };
      }
    });

    // 2. Extract Metrics
    const extractRow = (label: string, key: keyof FinancialStatement, multiplier: number = 1e6): boolean => {
       // Find the row containing the label
       // Try multiple patterns to find the label in different HTML structures
       // Handle both & and &amp; in labels
       const safeLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
       const safeLabelAmp = safeLabel.replace('&', '&amp;');
       let labelIndex = -1;
       
       // Pattern 1: Link with label (try both & and &amp;)
       labelIndex = html.search(new RegExp(`href="[^"]*">${safeLabelAmp}<\\/a>`, 'i'));
       if (labelIndex === -1) {
         labelIndex = html.search(new RegExp(`href="[^"]*">${safeLabel}<\\/a>`, 'i'));
       }
       
       // Pattern 2: Label in div (for bank financials) - try direct match first
       if (labelIndex === -1) {
         // First try exact match: <div...>Label</div>
         labelIndex = html.search(new RegExp(`<div[^>]*>${safeLabelAmp}<\\/div>`, 'i'));
       }
       if (labelIndex === -1) {
         labelIndex = html.search(new RegExp(`<div[^>]*>${safeLabel}<\\/div>`, 'i'));
       }
       // If still not found, try with whitespace/nested content
       if (labelIndex === -1) {
         labelIndex = html.search(new RegExp(`<div[^>]*>[\\s]*${safeLabelAmp}[\\s]*<\\/div>`, 'i'));
       }
       if (labelIndex === -1) {
         labelIndex = html.search(new RegExp(`<div[^>]*>[\\s]*${safeLabel}[\\s]*<\\/div>`, 'i'));
       }
       
       // Pattern 3: Label in span
       if (labelIndex === -1) {
         labelIndex = html.search(new RegExp(`<span[^>]*>${safeLabelAmp}<\\/span>`, 'i'));
       }
       if (labelIndex === -1) {
         labelIndex = html.search(new RegExp(`<span[^>]*>${safeLabel}<\\/span>`, 'i'));
       }
       
       // Pattern 4: Label directly in td or th (try both & and &amp;)
       if (labelIndex === -1) {
         labelIndex = html.search(new RegExp(`>${safeLabelAmp}<`, 'i'));
       }
       if (labelIndex === -1) {
         labelIndex = html.search(new RegExp(`>${safeLabel}<`, 'i'));
       }
       
       // Pattern 5: Fallback - search for label text anywhere (for complex nested structures)
       if (labelIndex === -1) {
         // Just search for the label text (case-insensitive)
         // Try both with & and &amp;
         const labelLower = label.toLowerCase();
         const labelLowerAmp = labelLower.replace('&', '&amp;');
         const htmlLower = html.toLowerCase();
         let labelPos = htmlLower.indexOf(labelLowerAmp);
         if (labelPos === -1) {
           labelPos = htmlLower.indexOf(labelLower);
         }
         if (labelPos !== -1) {
           labelIndex = labelPos;
         }
       }
       
       if (labelIndex === -1) return false;
       
       // Find the row containing this label
       const rowStart = html.lastIndexOf('<tr', labelIndex);
       const rowEnd = html.indexOf('</tr>', labelIndex);
       
       if (rowStart === -1 || rowEnd === -1) return false;
       
       const row = html.substring(rowStart, rowEnd + 5);
       let foundAny = false;
       
       if (row) {
         // Extract all <td> cells from this row
         const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
         if (cells && cells.length > 1) {
           // Check if first cell contains the label (to determine if we need to skip it)
           // In StockAnalysis tables, the first cell is ALWAYS the label/header for the row.
           // We should always skip it.
           const dataStartIndex = 1;
           
          // Use the TTM offset detected from header
          let ttmOffset = headerTtmOffset;
          
          // Verify offset by checking if we have the right number of data cells
          // Only adjust if we didn't find a definitive TTM column in the header
          // (If we found a date ID in column 2, ttmOffset is definitely 0)
          // Also, assume extra cells are at the end (e.g. "Upgrade" column), not the start
          // So we only recalculate if we have FEWER cells than expected, not more
          
          // Map cells to dates (skip label cell + TTM offset)
          const dataCells = cells.slice(dataStartIndex + ttmOffset);
          dataCells.forEach((cell, i) => {
             if (i < dates.length && statements[dates[i]]) {
               const valStr = cell.replace(/<[^>]+>/g, '').trim();
               // Skip "Upgrade" text or empty cells
               if (valStr.toLowerCase().includes('upgrade') || valStr === '-' || valStr === '') return;
               
               // Parse value
               const cleanStr = valStr.replace(/,/g, '').trim();
               const numVal = parseFloat(cleanStr);
               if (!isNaN(numVal)) {
                 // Apply multiplier (default 1e6 for millions, 1 for per-share/ratios)
                 const val = numVal * multiplier;
                 // @ts-ignore
                 statements[dates[i]][key] = val;
                 foundAny = true;
               }
             }
           });
         }
       }
       return foundAny;
    };

    // Helper to try multiple label variations
    const extractRowWithVariants = (labels: string[], key: keyof FinancialStatement, multiplier: number = 1e6): boolean => {
      for (const label of labels) {
        const found = extractRow(label, key, multiplier);
        if (found) return true; // Stop on first match
      }
      return false;
    };

    // Define Mappings based on Page Type
    if (type === 'income') {
      // Revenue - try both regular and bank labels
      extractRowWithVariants(['Revenue'], 'revenue');
      
      // Cost of Revenue - may not exist for banks
      extractRowWithVariants(['Cost of Revenue', 'Cost of Goods Sold'], 'costOfRevenue');
      
      // Gross Profit - may not exist for banks
      extractRowWithVariants(['Gross Profit'], 'grossProfit');
      
      // Operating Expenses - may not exist for banks (they have non-interest expenses)
      extractRowWithVariants(['Operating Expenses', 'Total Non-Interest Expense'], 'operatingExpenses');
      
      // Operating Income - for banks, this might be EBT Excluding Unusual Items or similar
      extractRowWithVariants(['Operating Income', 'EBIT', 'EBT Excluding Unusual Items'], 'operatingIncome');
      
      // Interest Expense - for banks, this is "Interest Paid on Deposits" or similar
      extractRowWithVariants([
        'Interest Expense',
        'Interest Paid on Deposits',
        'Total Interest Expense'
      ], 'interestExpense');
      
      // Interest Income - for banks, this is "Total Interest Income" or sum of loan/investment income
      extractRowWithVariants([
        'Interest & Investment Income',
        'Total Interest Income',
        'Interest Income on Loans',  // Fallback for banks
        'Interest Income on Investments'  // Fallback for banks
      ], 'interestIncome');
      
      // Currency Gain/Loss
      extractRowWithVariants([
        'Currency Exchange Gain (Loss)',
        'Currency Gain/Loss',
        'Foreign Exchange Gain'
      ], 'currencyGainLoss');
      
      // Pretax Income
      extractRowWithVariants(['Pretax Income', 'Income Before Tax', 'EBT'], 'pretaxIncome');
      
      // Income Tax Expense
      extractRowWithVariants(['Income Tax Expense', 'Income Tax'], 'incomeTaxExpense');
      
      // Net Income
      extractRowWithVariants(['Net Income', 'Net Income to Common'], 'netIncome');
      
      // EPS
      extractRowWithVariants(['EPS (Diluted)', 'EPS'], 'epsDiluted', 1);
    } else if (type === 'balance') {
      // Assets
      extractRowWithVariants(['Cash & Equivalents', 'Cash and Cash Equivalents'], 'cashAndEquivalents');
      
      // Short-Term Investments - for banks, this might be "Investment Securities" or "Trading Asset Securities"
      extractRowWithVariants([
        'Short-Term Investments',
        'Investment Securities',  // Bank-specific
        'Trading Asset Securities',  // Bank-specific
        'Total Investments'  // Bank-specific (sum of Investment Securities + Trading Asset Securities)
      ], 'shortTermInvestments');
      
      // Accounts Receivable - extract all 3 fields separately for banks
      // 1. Try standard "Accounts Receivable" first
      extractRowWithVariants([
        'Accounts Receivable',
        'Receivables'
      ], 'accountsReceivable');
      
      // 2. Extract Accrued Interest Receivable (bank-specific, separate field)
      extractRowWithVariants([
        'Accrued Interest Receivable'
      ], 'accruedInterestReceivable');
      
      // 3. Extract Other Receivables (bank-specific, separate field)
      extractRowWithVariants([
        'Other Receivables'
      ], 'otherReceivables');
      
      // 4. If accounts_receivable is not set but we have the components, sum them
      dates.forEach(date => {
        if (statements[date]) {
          if (!statements[date].accountsReceivable) {
            const accrued = statements[date].accruedInterestReceivable || 0;
            const other = statements[date].otherReceivables || 0;
            if (accrued > 0 || other > 0) {
              statements[date].accountsReceivable = accrued + other;
            }
          }
        }
      });
      
      // Inventory - may not exist for banks
      extractRowWithVariants(['Inventory'], 'inventory');
      
      // Total Current Assets
      extractRowWithVariants(['Total Current Assets'], 'totalCurrentAssets');
      
      // Property, Plant & Equipment
      extractRowWithVariants(['Property, Plant & Equipment', 'Net PP&E', 'PP&E'], 'propertyPlantEquipment');
      
      // Total Assets
      extractRowWithVariants(['Total Assets'], 'totalAssets');
      
      // Liabilities
      // Accounts Payable - for banks, this might be "Accrued Expenses" or "Accrued Interest Payable"
      extractRowWithVariants([
        'Accounts Payable',
        'Accrued Expenses',  // Bank-specific
        'Accrued Interest Payable'  // Bank-specific
      ], 'accountsPayable');
      
      // Total Current Liabilities
      extractRowWithVariants(['Total Current Liabilities'], 'totalCurrentLiabilities');
      
      // Total Debt - for banks, this includes "Short-Term Borrowings" and "Long-Term Debt"
      extractRowWithVariants([
        'Total Debt',
        'Short-Term Borrowings',  // Bank-specific
        'Long-Term Debt'  // Bank-specific
      ], 'totalDebt');
      
      // Total Liabilities
      extractRowWithVariants(['Total Liabilities'], 'totalLiabilities');
      
      // Additional Assets - Bank-specific
      extractRowWithVariants(['Restricted Cash'], 'restrictedCash');
      extractRowWithVariants(['Other Current Assets'], 'otherCurrentAssets');
      extractRowWithVariants(['Goodwill'], 'goodwill');
      extractRowWithVariants(['Other Intangible Assets'], 'otherIntangibleAssets');
      extractRowWithVariants(['Long-Term Deferred Tax Assets'], 'longTermDeferredTaxAssets');
      extractRowWithVariants(['Other Long-Term Assets'], 'otherLongTermAssets');
      
      // Total Equity - for banks, this might be "Shareholders\' Equity" or "Total Common Equity"
      extractRowWithVariants([
        'Total Equity',
        'Shareholders\' Equity',  // Bank-specific
        'Total Common Equity'  // Bank-specific
      ], 'totalEquity');
      
      // Retained Earnings
      extractRowWithVariants(['Retained Earnings'], 'retainedEarnings');
      
      // Additional Liabilities - Bank-specific
      extractRowWithVariants(['Accrued Expenses'], 'accruedExpenses');
      extractRowWithVariants(['Accrued Interest Payable'], 'accruedInterestPayable');
      extractRowWithVariants(['Interest Bearing Deposits'], 'interestBearingDeposits');
      extractRowWithVariants(['Non-Interest Bearing Deposits'], 'nonInterestBearingDeposits');
      extractRowWithVariants(['Total Deposits'], 'totalDeposits');
      extractRowWithVariants(['Short-Term Borrowings'], 'shortTermBorrowings');
      extractRowWithVariants(['Current Portion of Long-Term Debt'], 'currentPortionLongTermDebt');
      extractRowWithVariants(['Current Portion of Leases'], 'currentPortionLeases');
      extractRowWithVariants(['Current Income Taxes Payable'], 'currentIncomeTaxesPayable');
      extractRowWithVariants(['Other Current Liabilities'], 'otherCurrentLiabilities');
      extractRowWithVariants(['Long-Term Debt'], 'longTermDebt');
      extractRowWithVariants(['Long-Term Leases'], 'longTermLeases');
      extractRowWithVariants(['Long-Term Unearned Revenue'], 'longTermUnearnedRevenue');
      extractRowWithVariants(['Pension & Post-Retirement Benefits'], 'pensionPostRetirementBenefits');
      extractRowWithVariants(['Long-Term Deferred Tax Liabilities'], 'longTermDeferredTaxLiabilities');
      extractRowWithVariants(['Other Long-Term Liabilities'], 'otherLongTermLiabilities');
    } else if (type === 'cashflow') {
      extractRowWithVariants(['Operating Cash Flow'], 'operatingCashFlow');
      extractRowWithVariants(['Capital Expenditures', 'CapEx'], 'capitalExpenditures');
      extractRowWithVariants(['Free Cash Flow'], 'freeCashFlow');
      extractRowWithVariants(['Common Dividends Paid', 'Dividends Paid'], 'dividendsPaid');
      extractRowWithVariants(['Change in Working Capital'], 'changeInWorkingCapital');
    }
  };

  // Fetch all 3 pages
  const incomeHtml = await fetchHtml(`${baseUrl}${periodParam}`);
  processPage(incomeHtml, 'income');
  
  const balanceHtml = await fetchHtml(`${baseUrl}balance-sheet/${periodParam}`);
  processPage(balanceHtml, 'balance');
  
  const cfHtml = await fetchHtml(`${baseUrl}cash-flow-statement/${periodParam}`);
  processPage(cfHtml, 'cashflow');
  
  return Object.values(statements) as FinancialStatement[];
}
