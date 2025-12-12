import { sql } from '@vercel/postgres';
import { fetchFaceValue } from '@/lib/scraper/manual-equity-source';
import { updateMarketCapFromPrice } from './db-client';

/**
 * Standard headers to mimic a real browser and avoid blocking
 */
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
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

// Map of our DB columns to the text labels found on StockAnalysis.com
const METRIC_MAPPING: Record<string, string[]> = {
  // INCOME STATEMENT
  'revenue': ['Revenue', 'Total Revenue'],
  'cost_of_revenue': ['Cost of Revenue', 'Cost of Goods Sold'],
  'gross_profit': ['Gross Profit'],
  'operating_expenses': ['Operating Expenses'],
  'operating_income': ['Operating Income', 'EBIT'],
  'interest_expense': ['Interest Expense'],
  'interest_income': ['Interest & Investment Income', 'Investment Income', 'Interest Income'],
  'currency_gain_loss': ['Currency Exchange Gain (Loss)', 'Foreign Exchange Gain'],
  'pretax_income': ['Pretax Income', 'Income Before Tax'],
  'income_tax_expense': ['Income Tax Expense', 'Income Tax'],
  'net_income': ['Net Income', 'Net Income to Common'],
  'eps_basic': ['EPS (Basic)'],
  'eps_diluted': ['EPS (Diluted)'],
  'shares_outstanding_basic': ['Shares Outstanding (Basic)'],
  'shares_outstanding_diluted': ['Shares Outstanding (Diluted)'],

  // BALANCE SHEET
  'cash_and_equivalents': ['Cash & Equivalents', 'Cash and Cash Equivalents'],
  'short_term_investments': ['Short-Term Investments'],
  'accounts_receivable': ['Accounts Receivable', 'Receivables'],
  'inventory': ['Inventory'],
  'total_current_assets': ['Total Current Assets'],
  'property_plant_equipment': ['Property, Plant & Equipment', 'Net PP&E'],
  'long_term_investments': ['Long-Term Investments'],
  'total_assets': ['Total Assets'],
  'accounts_payable': ['Accounts Payable'],
  'total_current_liabilities': ['Total Current Liabilities'],
  'total_liabilities': ['Total Liabilities'],
  'total_debt': ['Total Debt'],
  'common_stock': ['Common Stock'],
  'retained_earnings': ['Retained Earnings'],
  'total_equity': ['Shareholders\' Equity', 'Total Equity'],

  // CASH FLOW
  'operating_cash_flow': ['Operating Cash Flow', 'Cash From Operations'],
  'capital_expenditures': ['Capital Expenditures', 'CapEx'],
  'free_cash_flow': ['Free Cash Flow'],
  'dividends_paid': ['Common Dividends Paid', 'Dividends Paid'],
  'change_in_working_capital': ['Change in Working Capital']
};

interface ScrapedFinancials {
  symbol: string;
  period_type: 'quarterly' | 'annual' | 'ttm';
  data: Array<{
    date: string; // YYYY-MM-DD
    metrics: Record<string, number | null>;
  }>;
}

/**
 * Helper to fetch HTML from a URL
 */
async function fetchHtml(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return await res.text();
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

/**
 * Extract value from an HTML table row
 * Looks for pattern: >Label< ... <td ...>Value</td>
 */
function extractRowValues(html: string, labels: string[]): (number | null)[] {
  for (const label of labels) {
    // Escape special chars for regex
    const safeLabel = label.replace('&', '&amp;').replace('(', '\\(').replace(')', '\\)');
    // Find the row header
    const regex = new RegExp(`>${safeLabel}<`, 'i');
    const matchIndex = html.search(regex);

    if (matchIndex !== -1) {
      // Get the row content (approx next 2000 chars)
      const rowChunk = html.substring(matchIndex, matchIndex + 3000);
      // Split by <td> to find cells
      // Note: This is a rough parser. Ideally use a DOM parser, but regex is faster/lighter for this specific consistent layout.
      const cells = rowChunk.split('<td');

      // Skip the first part (label cell) and map the rest
      // The first actual value usually starts at index 1 or 2 depending on hidden columns
      // In StockAnalysis, the values are usually in standard <td> cells
      const values: (number | null)[] = [];

      for (let i = 1; i < cells.length; i++) {
        // Clean value: remove tags, commas
        let cleanVal = cells[i].split('</td>')[0].replace(/>/g, '').replace(/<[^>]*>/g, '').trim();

        // Stop if we hit a new row (</tr>) which might be caught in the chunk if we aren't careful
        if (cleanVal.includes('tr>')) break;

        // Handle "Upgrade" or empty
        if (cleanVal.includes('Upgrade') || cleanVal === '-' || cleanVal === 'n/a' || cleanVal === '') {
          values.push(null);
        } else {
          // Handle percentages (e.g., 5.5%)
          cleanVal = cleanVal.replace('%', '');
          // Handle commas
          cleanVal = cleanVal.replace(/,/g, '');

          const num = parseFloat(cleanVal);
          values.push(isNaN(num) ? null : num);
        }
      }
      return values;
    }
  }
  return []; // Not found
}

/**
 * Extract dates from the header row
 */
function extractDates(html: string): string[] {
  // Find "Period Ending" or "Fiscal Year" row
  const label = 'Period Ending';
  const index = html.indexOf(label);
  if (index === -1) return [];

  const chunk = html.substring(index, index + 3000);
  const parts = chunk.split('<td'); // StockAnalysis uses <td> for dates too usually, or <th>

  const dates: string[] = [];
  // Parse dates
  // Format usually: Sep 30, 2025
  const months: Record<string, string> = {
    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
    'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
  };

  for (let i = 1; i < parts.length; i++) {
    let rawDate = parts[i].split('</td>')[0].replace(/>/g, '').replace(/<[^>]*>/g, '').trim();

    // Regex for "Mmm DD, YYYY"
    const match = rawDate.match(/([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/);
    if (match) {
      const [_, m, d, y] = match;
      const mm = months[m];
      const dd = d.padStart(2, '0');
      dates.push(`${y}-${mm}-${dd}`);
    }
  }

  return dates;
}

/**
 * Main function to scrape and save financials
 */
export async function updateFinancials(symbol: string, assetType: string = 'pk-equity') {
  const baseUrl = `https://stockanalysis.com/quote/psx/${symbol}`;
  const periods = ['quarterly', 'annual'];



  for (const period of periods) {
    const periodType = period as 'quarterly' | 'annual';
    const suffix = period === 'quarterly' ? '?period=quarterly' : '?period=annual';

    // 1. Fetch pages
    const [incomeHtml, balanceHtml, flowHtml] = await Promise.all([
      fetchHtml(`${baseUrl}/financials/${suffix}`),
      fetchHtml(`${baseUrl}/financials/balance-sheet/${suffix}`),
      fetchHtml(`${baseUrl}/financials/cash-flow-statement/${suffix}`)
    ]);

    // 2. Parse Dates (using Income Statement as master)
    const dates = extractDates(incomeHtml);
    if (dates.length === 0) {
      console.warn(`No dates found for ${symbol} (${period})`);
      continue;
    }

    // 3. Parse Metrics
    // We initialize an array of objects, one for each date column
    const periodData = dates.map(date => ({
      symbol,
      asset_type: assetType,
      period_end_date: date,
      period_type: periodType,
      metrics: {} as Record<string, number | null>
    }));

    // Helper to map parsed rows into the periodData objects
    const mapRowToData = (html: string, metricKey: string, labels: string[]) => {
      const values = extractRowValues(html, labels);
      // values[0] corresponds to dates[0], etc.
      for (let i = 0; i < Math.min(values.length, periodData.length); i++) {
        periodData[i].metrics[metricKey] = values[i];
      }
    };

    // Execute parsing for all metrics
    // Income
    Object.entries(METRIC_MAPPING).forEach(([key, labels]) => {
      if (['revenue', 'net_income', 'eps_diluted', 'interest_income', 'currency_gain_loss'].includes(key)) {
        mapRowToData(incomeHtml, key, labels);
      }
    });

    // Balance Sheet (Check balanceHtml)
    Object.entries(METRIC_MAPPING).forEach(([key, labels]) => {
      if (['total_assets', 'total_debt', 'cash_and_equivalents', 'accounts_receivable', 'inventory'].includes(key)) {
        mapRowToData(balanceHtml, key, labels);
      }
    });

    // Cash Flow (Check flowHtml)
    Object.entries(METRIC_MAPPING).forEach(([key, labels]) => {
      if (['operating_cash_flow', 'free_cash_flow', 'change_in_working_capital'].includes(key)) {
        mapRowToData(flowHtml, key, labels);
      }
    });

    // Note: The loop above is simplified; we should run ALL keys against the right HTML
    // Let's do it properly:

    // INCOME KEYS
    const incomeKeys = [
      'revenue', 'cost_of_revenue', 'gross_profit', 'operating_expenses', 'operating_income',
      'interest_expense', 'interest_income', 'currency_gain_loss', 'pretax_income',
      'income_tax_expense', 'net_income', 'eps_basic', 'eps_diluted',
      'shares_outstanding_basic', 'shares_outstanding_diluted'
    ];
    incomeKeys.forEach(k => mapRowToData(incomeHtml, k, METRIC_MAPPING[k]));

    // BALANCE KEYS
    const balanceKeys = [
      'cash_and_equivalents', 'short_term_investments', 'accounts_receivable', 'inventory',
      'total_current_assets', 'property_plant_equipment', 'long_term_investments', 'total_assets',
      'accounts_payable', 'total_current_liabilities', 'total_liabilities', 'total_debt',
      'common_stock', 'retained_earnings', 'total_equity'
    ];
    balanceKeys.forEach(k => mapRowToData(balanceHtml, k, METRIC_MAPPING[k]));

    // FLOW KEYS
    const flowKeys = [
      'operating_cash_flow', 'capital_expenditures', 'free_cash_flow', 'dividends_paid',
      'change_in_working_capital'
    ];
    flowKeys.forEach(k => mapRowToData(flowHtml, k, METRIC_MAPPING[k]));


    // 4. Save to Database


    for (const record of periodData) {
      // Skip if essential data is missing (e.g., no revenue AND no net income)
      if (record.metrics['revenue'] === undefined && record.metrics['net_income'] === undefined) continue;

      // Construct SQL Query dynamically
      const cols = [
        'symbol', 'asset_type', 'period_end_date', 'period_type',
        ...Object.keys(record.metrics)
      ];

      const vals = [
        record.symbol, record.asset_type, record.period_end_date, record.period_type,
        ...Object.values(record.metrics)
      ];

      // This needs a robust UPSERT. 
      // Since we are using @vercel/postgres or generic pg, we might need parameterized queries.
      // For simplicity in this generated file, I'll write the query construction logic.

      const query = `
        INSERT INTO financial_statements (${cols.join(', ')})
        VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
        ON CONFLICT (asset_type, symbol, period_end_date, period_type)
        DO UPDATE SET
          updated_at = NOW(),
          ${Object.keys(record.metrics).map(k => `${k} = EXCLUDED.${k}`).join(', ')}
      `;

      try {
        // Note: In a real Next.js app, use the pool. This requires the environment to be set up.
        await sql.query(query, vals);
      } catch (err) {
        console.error(`DB Error for ${record.period_end_date}:`, err);
      }
    }
  }

  // 5. Also fetch and update PROFILE (Float, Market Cap)
  await updateCompanyProfile(symbol, assetType);

  return { success: true };
}

async function updateCompanyProfile(symbol: string, assetType: string) {
  const baseUrl = `https://stockanalysis.com/quote/psx/${symbol}`;

  // We need the Profile page (Industry) and Statistics page (Float/Shares)
  // Sector is fetched from PSX API, not StockAnalysis
  // Also fetch Face Value from Manual Source
  const [profileHtml, statsHtml, faceValue, psxSector] = await Promise.all([
    fetchHtml(`${baseUrl}/profile/`),
    fetchHtml(`${baseUrl}/statistics/`),
    fetchFaceValue(symbol),
    assetType === 'pk-equity' ? fetchSectorFromPSX(symbol) : Promise.resolve(null)
  ]);

  // Parse Profile
  // Industry still comes from StockAnalysis
  const industryMatch = profileHtml.match(/Industry:[\s\S]*?>([^<]+)</);
  const descMatch = profileHtml.match(/<meta name="description" content="([^"]+)"/);

  // Sector from PSX API (for PK equity), otherwise null
  const sector = assetType === 'pk-equity' ? psxSector : null;
  const industry = industryMatch ? industryMatch[1] : null;
  const description = descMatch ? descMatch[1] : null;

  // Parse Stats
  // Look for "Float", "Shares Outstanding", "Market Cap"
  const parseStat = (label: string, html: string) => {
    const regex = new RegExp(`>${label}<[\\s\\S]*?<td[^>]*>([\\s\\S]*?)<\\/td>`, 'i');
    const match = html.match(regex);
    if (!match) return null;

    let val = match[1].replace(/<[^>]+>/g, '').trim();
    // Handle B/M/T suffixes
    const multiplier = val.endsWith('T') ? 1e12 : val.endsWith('B') ? 1e9 : val.endsWith('M') ? 1e6 : 1;
    val = val.replace(/[TBM,]/g, '');
    return parseFloat(val) * multiplier;
  };

  const float = parseStat('Float', statsHtml);
  const shares = parseStat('Shares Outstanding', statsHtml);
  const mcap = parseStat('Market Cap', statsHtml);



  // Upsert Profile
  await sql`
      INSERT INTO company_profiles (symbol, asset_type, sector, industry, description, float_shares, shares_outstanding, market_cap, face_value, last_updated)
      VALUES (${symbol}, ${assetType}, ${sector}, ${industry}, ${description}, ${float}, ${shares}, ${mcap}, ${faceValue}, NOW())
      ON CONFLICT (asset_type, symbol)
      DO UPDATE SET
        sector = EXCLUDED.sector,
        industry = EXCLUDED.industry,
        description = EXCLUDED.description,
        float_shares = EXCLUDED.float_shares,
        shares_outstanding = EXCLUDED.shares_outstanding,
        -- Don't update market_cap from external source - it's calculated from price × shares
        -- market_cap will be recalculated after this update
        face_value = EXCLUDED.face_value,
        last_updated = NOW()
    `;

  // Recalculate market cap based on latest price (don't use external source)
  // This ensures market cap = price × shares outstanding
  await updateMarketCapFromPrice(assetType, symbol);


}

