import { FinancialStatement, CompanyProfile } from './types';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
};

/**
 * PSX Symbols API response type
 */
interface PSXSymbol {
  symbol: string;
  name: string;
  sectorName: string;
  isETF: boolean;
  isDebt: boolean;
  isGEM: boolean;
}

/**
 * Cache for PSX symbols data (fetched once, reused)
 */
let psxSymbolsCache: Map<string, string> | null = null;
let psxSymbolsCacheTimestamp: number = 0;
const PSX_SYMBOLS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch sector name from PSX symbols API
 * Uses caching to avoid repeated API calls
 * @param symbol - Stock ticker symbol (e.g., 'PTC', 'HBL')
 * @returns Sector name or null if not found
 */
async function fetchSectorFromPSX(symbol: string): Promise<string | null> {
  try {
    const normalizedSymbol = symbol.toUpperCase().trim();
    const now = Date.now();

    // Check cache validity
    if (psxSymbolsCache && (now - psxSymbolsCacheTimestamp) < PSX_SYMBOLS_CACHE_TTL) {
      const cachedSector = psxSymbolsCache.get(normalizedSymbol);
      if (cachedSector !== undefined) {
        return cachedSector || null; // Return null if empty string was cached
      }
    }

    // Fetch from API
    const response = await fetch('https://dps.psx.com.pk/symbols', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[PSX Symbols API] Failed to fetch: ${response.status}`);
      return null;
    }

    const symbols: PSXSymbol[] = await response.json();

    // Build cache map
    psxSymbolsCache = new Map();
    for (const sym of symbols) {
      // Store sector name (can be empty string, which we'll treat as null)
      psxSymbolsCache.set(sym.symbol.toUpperCase(), sym.sectorName || '');
    }
    psxSymbolsCacheTimestamp = now;

    // Return sector for requested symbol
    const sector = psxSymbolsCache.get(normalizedSymbol);
    return sector && sector.trim() ? sector.trim() : null;
  } catch (error) {
    console.error(`[PSX Symbols API] Error fetching sector for ${symbol}:`, error);
    return null;
  }
}

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

// Helper to fetch HTML with timeout
async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: controller.signal
    });

    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Scrapes the Profile & Statistics pages to get Static Data (Sector, Market Cap, Float)
 * Note: Sector is fetched from PSX API, not StockAnalysis
 */
export async function scrapeCompanyProfile(symbol: string): Promise<CompanyProfile> {
  const baseUrl = `https://stockanalysis.com/quote/psx/${symbol}`;

  // 1. Fetch Overview for Industry/Name (Sector comes from PSX API)
  // Also fetch sector from PSX API in parallel
  const [overviewHtml, statsHtml, psxSector] = await Promise.all([
    fetchHtml(`${baseUrl}/`),
    fetchHtml(`${baseUrl}/statistics/`),
    fetchSectorFromPSX(symbol)
  ]);

  // Extract Name
  const nameMatch = overviewHtml.match(/<h1[^>]*>([^<]+)\s*\(PSX:/i);
  const name = nameMatch ? nameMatch[1].trim() : symbol;

  // Extract Industry from div structure (Sector comes from PSX API)
  // Structure: <span class="block font-semibold">Industry</span> <!--[!--><span>Oil &amp; Gas</span>
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

  // Sector comes from PSX API, not StockAnalysis
  const sector = psxSector || 'Unknown';

  // 2. Parse Statistics for Float & Shares
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
    sector,
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

  // Helper to extract dates and quarter labels from thead
  // Returns dates, quarter labels, and column indices
  const extractDatesFromHeader = (html: string): { dates: string[], fiscalQuarters: string[], dateColumnIndices: number[], ttmOffset: number } => {
    const dates: string[] = [];
    const fiscalQuarters: string[] = [];
    const dateColumnIndices: number[] = [];
    let ttmOffset = 0;

    // Find thead section
    const theadMatch = html.match(/<thead>([\s\S]*?)<\/thead>/);
    if (!theadMatch) return { dates, fiscalQuarters, dateColumnIndices, ttmOffset };

    // Extract all rows from thead
    const allRows = theadMatch[0].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
    if (!allRows || allRows.length === 0) return { dates, fiscalQuarters, dateColumnIndices, ttmOffset };

    // First, find the row with date IDs (usually first or second row)
    let dateRowIndex = -1;
    let dateRowThs: string[] = [];
    for (let i = 0; i < allRows.length; i++) {
      const thMatches = allRows[i].match(/<th[^>]*>([\s\S]*?)<\/th>/g);
      if (thMatches) {
        // Check if this row has date IDs
        const hasDateId = thMatches.some(th => th.match(/id="\d{4}-\d{2}-\d{2}"/));
        if (hasDateId) {
          dateRowIndex = i;
          dateRowThs = thMatches;
          break;
        }
      }
    }

    if (dateRowIndex === -1 || dateRowThs.length === 0) return { dates, fiscalQuarters, dateColumnIndices, ttmOffset };

    // Now find the row with quarter labels (usually the row before or after the date row)
    let quarterRowThs: string[] = [];
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
          break;
        }
      }
    }

    // Extract dates and map to quarter labels
    dateRowThs.forEach((th, index) => {
      const dateMatch = th.match(/id="(\d{4}-\d{2}-\d{2})"/);
      if (dateMatch) {
        dates.push(dateMatch[1]);
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
          }
        } else {
          // Second column has date ID, so no TTM column
          ttmOffset = 0;
        }
      }
    }

    return { dates, fiscalQuarters, dateColumnIndices, ttmOffset };
  };

  // Helper to process a page and extract rows
  const processPage = (html: string, type: 'income' | 'balance' | 'cashflow') => {
    // 1. Extract Dates (Columns) from Header and TTM offset
    const { dates, fiscalQuarters, dateColumnIndices, ttmOffset: headerTtmOffset } = extractDatesFromHeader(html);

    if (dates.length === 0) return;

    // Initialize objects for these dates
    dates.forEach((date, index) => {
      if (!statements[date]) {
        statements[date] = {
          symbol,
          periodEndDate: date,
          periodType: period,
          fiscalQuarter: fiscalQuarters[index] || undefined
        };
      } else if (fiscalQuarters[index] && !statements[date].fiscalQuarter) {
        // Update fiscal quarter if not already set
        statements[date].fiscalQuarter = fiscalQuarters[index];
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
          // In StockAnalysis tables, the first cell (index 0) is ALWAYS the label/header for the row.
          // Data cells start at index 1.
          // We need to map data cells to dates based on the dateColumnIndices from the header.
          // dateColumnIndices tells us which column indices in the header contain dates.
          // Since data rows have the same structure as the header, we can use the same indices.

          // Map each date to its corresponding data cell
          // dateColumnIndices[i] tells us the header column index for dates[i]
          // In the data row, cells[dateColumnIndices[i]] contains the value for dates[i]
          // But we need to account for the label column in data rows (index 0)
          // So: if header column index is N, data cell index is also N (both skip label at 0)

          dates.forEach((date, dateIndex) => {
            // Get the header column index where this date appears
            const headerColumnIndex = dateColumnIndices[dateIndex];

            // The corresponding data cell is at the same index (both header and data rows have label at index 0)
            const dataCellIndex = headerColumnIndex;

            if (dataCellIndex < cells.length && statements[date]) {
              const cell = cells[dataCellIndex];
              const valStr = cell.replace(/<[^>]+>/g, '').trim();

              // Skip "Upgrade" text, empty cells, or non-numeric values
              if (valStr.toLowerCase().includes('upgrade') || valStr === '-' || valStr === '' || valStr === 'n/a') {
                return;
              }

              // Parse value (remove commas, handle B/M/T suffixes if present)
              let cleanStr = valStr.replace(/,/g, '').trim();

              // Handle B/M/T suffixes (though StockAnalysis usually shows raw numbers)
              let numVal = parseFloat(cleanStr);
              if (isNaN(numVal)) {
                // Try parsing with suffix
                const lastChar = cleanStr.slice(-1).toUpperCase();
                const numPart = parseFloat(cleanStr.slice(0, -1));
                if (!isNaN(numPart)) {
                  switch (lastChar) {
                    case 'T': numVal = numPart * 1e12; break;
                    case 'B': numVal = numPart * 1e9; break;
                    case 'M': numVal = numPart * 1e6; break;
                    case 'K': numVal = numPart * 1e3; break;
                    default: numVal = NaN;
                  }
                }
              }

              if (!isNaN(numVal)) {
                // Apply multiplier (default 1e6 for millions, 1 for per-share/ratios)
                const val = numVal * multiplier;
                // @ts-ignore
                statements[date][key] = val;
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
