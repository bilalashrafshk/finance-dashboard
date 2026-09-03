import { PoolClient } from 'pg'

export interface TabExtractionResult {
  tabName: string
  headers: string[]
  rows: any[][]
}

/**
 * Format a number safely, returning null or number rounded to decimals
 */
function num(val: any, decimals: number = 2): number | string {
  if (val === null || val === undefined || val === '') return ''
  const parsed = parseFloat(val)
  if (isNaN(parsed)) return ''
  return Number(parsed.toFixed(decimals))
}

function str(val: any, fallback: string = ''): string {
  if (val === null || val === undefined) return fallback
  return String(val).trim()
}

function formatDate(val: any): string {
  if (!val) return ''
  try {
    const d = new Date(val)
    if (isNaN(d.getTime())) return ''
    return d.toISOString().split('T')[0]
  } catch {
    return ''
  }
}

/**
 * TAB 1: PSX Master Screener
 * Full universe of ~500+ PSX stocks with all computed valuation, risk, technical, and quality metrics
 */
export async function extractPSXScreener(client: PoolClient): Promise<TabExtractionResult> {
  const query = `
    SELECT 
      s.symbol,
      COALESCE(cp.name, s.symbol) as name,
      COALESCE(cp.sector, s.sector, 'Other') as sector,
      COALESCE(cp.industry, s.industry, 'Other') as industry,
      COALESCE(lp.latest_price, s.price) as price,
      COALESCE(lp.latest_price_date, s.price_date) as price_date,
      CASE 
        WHEN cp.shares_outstanding IS NOT NULL AND cp.shares_outstanding > 0 AND lp.latest_price IS NOT NULL
        THEN (lp.latest_price * cp.shares_outstanding)
        ELSE COALESCE(s.market_cap, cp.market_cap)
      END as market_cap,
      s.pe_ratio,
      s.sector_pe,
      s.relative_pe,
      s.industry_pe,
      s.relative_pe_industry,
      s.peg_ratio,
      s.pb_ratio,
      s.ps_ratio,
      s.dividend_yield,
      s.avg_dividend_yield,
      s.dividend_payout_ratio,
      s.dividend_growth_5y,
      s.ex_dividend_date,
      s.last_dividend_date,
      s.rsi_14,
      s.ytd_return,
      s.beta_3y,
      cp.beta as cp_beta,
      s.sharpe_3y,
      s.sortino_3y,
      s.max_drawdown_3y,
      s.roe,
      s.roa,
      s.gross_margin,
      s.operating_margin,
      s.net_margin,
      s.debt_to_equity,
      s.current_ratio,
      s.quick_ratio,
      s.revenue_growth,
      s.net_income_growth,
      s.book_value_per_share,
      s.sales_per_share,
      s.cash_per_share,
      cp.all_time_high,
      cp.fifty_two_week_high,
      cp.shares_outstanding,
      cp.float_shares,
      cp.website,
      s.updated_at
    FROM screener_metrics s
    LEFT JOIN company_profiles cp ON cp.symbol = s.symbol AND cp.asset_type = 'pk-equity'
    LEFT JOIN LATERAL (
      SELECT date as latest_price_date, close as latest_price
      FROM historical_price_data h
      WHERE h.asset_type = 'pk-equity' AND h.symbol = s.symbol
      ORDER BY h.date DESC
      LIMIT 1
    ) lp ON true
    WHERE s.asset_type = 'pk-equity'
    ORDER BY 
      CASE 
        WHEN cp.shares_outstanding IS NOT NULL AND cp.shares_outstanding > 0 AND lp.latest_price IS NOT NULL
        THEN 0
        WHEN s.market_cap IS NOT NULL AND s.market_cap > 0 THEN 0
        ELSE 1 
      END,
      CASE 
        WHEN cp.shares_outstanding IS NOT NULL AND cp.shares_outstanding > 0 AND lp.latest_price IS NOT NULL
        THEN (lp.latest_price * cp.shares_outstanding)
        ELSE s.market_cap 
      END DESC NULLS LAST,
      s.symbol ASC
  `

  const { rows } = await client.query(query)

  const headers = [
    // Identity
    'Symbol',
    'Company Name',
    'Sector',
    'Industry',
    'Market Cap Rank',
    'Market Cap (PKR B)',
    'Price (PKR)',
    'Price Date',

    // Valuation & Multiples
    'Trailing P/E',
    'Sector Median P/E',
    'Relative P/E (Stock/Sector)',
    'Valuation Status',
    'PEG Ratio',
    'Price to Book (P/B)',
    'Price to Sales (P/S)',

    // Risk-Adjusted Returns & Volatility
    'Beta (3Y / Benchmark)',
    'Sharpe Ratio (3Y)',
    'Sortino Ratio (3Y)',
    'Max Drawdown (3Y) %',
    'Quantitative Risk Score (0-1)',

    // Returns & Momentum
    'YTD Return %',
    'RSI (14D)',
    '52W High (PKR)',
    '% from 52W High',
    'All-Time High (ATH)',
    '% from ATH',

    // Financial Quality & Margins
    'ROE %',
    'ROA %',
    'Gross Margin %',
    'Operating Margin %',
    'Net Profit Margin %',
    'Debt to Equity',
    'Current Ratio',
    'Quick Ratio',
    'Revenue Growth YoY %',
    'Net Income Growth YoY %',

    // Per Share Data
    'Book Value / Share',
    'Sales / Share',
    'Cash / Share',

    // Dividends & Yield
    'Dividend Yield %',
    '5Y Avg Dividend Yield %',
    'Dividend Payout Ratio %',
    '5Y Dividend Growth %',
    'Ex-Dividend Date',
    'Last Dividend Date',

    // Share Structure & Info
    'Shares Outstanding (M)',
    'Float Shares (M)',
    'Website',
    'Last Synced At',
  ]

  let rank = 1
  const outputRows = rows.map((r) => {
    const price = parseFloat(r.price) || 0
    const mcapB = r.market_cap ? Number((parseFloat(r.market_cap) / 1e9).toFixed(2)) : ''
    const currentRank = r.market_cap && parseFloat(r.market_cap) > 0 ? rank++ : ''

    const relPE = r.relative_pe ? parseFloat(r.relative_pe) : null
    let valStatus = 'Fair'
    if (relPE !== null) {
      if (relPE <= 0.7) valStatus = 'Deep Value (Discount >30%)'
      else if (relPE <= 0.9) valStatus = 'Undervalued'
      else if (relPE <= 1.15) valStatus = 'Fair Value'
      else if (relPE <= 1.4) valStatus = 'Premium'
      else valStatus = 'High Premium (>40%)'
    }

    const high52 = parseFloat(r.fifty_two_week_high) || 0
    const ath = parseFloat(r.all_time_high) || 0
    const pctFrom52WHigh = price && high52 ? Number((((price - high52) / high52) * 100).toFixed(2)) : ''
    const pctFromATH = price && ath ? Number((((price - ath) / ath) * 100).toFixed(2)) : ''

    // Compute heuristic risk score (0.0 to 1.0)
    let riskScore: number | string = ''
    if (relPE !== null || r.rsi_14 !== null || r.max_drawdown_3y !== null) {
      let score = 0.5
      if (relPE !== null) score += (relPE - 1.0) * 0.25
      if (r.rsi_14) score += (parseFloat(r.rsi_14) - 50) / 100 * 0.25
      score = Math.max(0.05, Math.min(0.95, score))
      riskScore = Number(score.toFixed(2))
    }

    const sharesM = r.shares_outstanding ? Number((parseFloat(r.shares_outstanding) / 1e6).toFixed(2)) : ''
    const floatM = r.float_shares ? Number((parseFloat(r.float_shares) / 1e6).toFixed(2)) : ''

    return [
      str(r.symbol),
      str(r.name),
      str(r.sector),
      str(r.industry),
      currentRank,
      mcapB,
      num(r.price, 2),
      formatDate(r.price_date),

      num(r.pe_ratio, 2),
      num(r.sector_pe, 2),
      num(r.relative_pe, 2),
      valStatus,
      num(r.peg_ratio, 2),
      num(r.pb_ratio, 2),
      num(r.ps_ratio, 2),

      num(r.beta_3y || r.cp_beta, 2),
      num(r.sharpe_3y, 2),
      num(r.sortino_3y, 2),
      num(r.max_drawdown_3y, 2),
      riskScore,

      num(r.ytd_return, 2),
      num(r.rsi_14, 1),
      num(r.fifty_two_week_high, 2),
      pctFrom52WHigh,
      num(r.all_time_high, 2),
      pctFromATH,

      num(r.roe, 2),
      num(r.roa, 2),
      num(r.gross_margin, 2),
      num(r.operating_margin, 2),
      num(r.net_margin, 2),
      num(r.debt_to_equity, 2),
      num(r.current_ratio, 2),
      num(r.quick_ratio, 2),
      num(r.revenue_growth, 2),
      num(r.net_income_growth, 2),

      num(r.book_value_per_share, 2),
      num(r.sales_per_share, 2),
      num(r.cash_per_share, 2),

      num(r.dividend_yield, 2),
      num(r.avg_dividend_yield, 2),
      num(r.dividend_payout_ratio, 2),
      num(r.dividend_growth_5y, 2),
      formatDate(r.ex_dividend_date),
      formatDate(r.last_dividend_date),

      sharesM,
      floatM,
      str(r.website),
      formatDate(r.updated_at),
    ]
  })

  return {
    tabName: 'PSX_Master_Screener',
    headers,
    rows: outputRows,
  }
}

/**
 * TAB 2: Financial Fundamentals
 * Full historical income statement, balance sheet, and cash flow ratios for all stocks
 */
export async function extractFinancialFundamentals(client: PoolClient): Promise<TabExtractionResult> {
  const query = `
    WITH ranked AS (
      SELECT 
        f.*,
        COALESCE(cp.name, f.symbol) as name,
        COALESCE(cp.sector, 'Other') as sector,
        cp.market_cap as cp_market_cap,
        ROW_NUMBER() OVER (PARTITION BY f.symbol ORDER BY f.period_end_date DESC) as rn
      FROM financial_statements f
      LEFT JOIN company_profiles cp ON cp.symbol = f.symbol AND cp.asset_type = 'pk-equity'
      WHERE f.asset_type = 'pk-equity'
    )
    SELECT 
      symbol,
      name,
      sector,
      period_end_date,
      period_type,
      fiscal_quarter,
      revenue,
      cost_of_revenue,
      gross_profit,
      operating_expenses,
      operating_income,
      interest_expense,
      interest_income,
      pretax_income,
      income_tax_expense,
      net_income,
      eps_diluted,
      operating_cash_flow,
      capital_expenditures,
      free_cash_flow,
      dividends_paid,
      cash_and_equivalents,
      short_term_investments,
      accounts_receivable,
      inventory,
      total_current_assets,
      property_plant_equipment,
      total_assets,
      accounts_payable,
      total_current_liabilities,
      total_debt,
      total_liabilities,
      total_equity,
      retained_earnings
    FROM ranked
    WHERE rn <= 8 -- Top 8 most recent periods (quarterly & annual) per stock to guarantee 100% stock coverage
    ORDER BY 
      CASE WHEN cp_market_cap IS NOT NULL AND cp_market_cap > 0 THEN 0 ELSE 1 END,
      cp_market_cap DESC NULLS LAST,
      symbol ASC,
      period_end_date DESC
  `

  const { rows } = await client.query(query)

  const headers = [
    'Symbol',
    'Company Name',
    'Sector',
    'Period End Date',
    'Period Type',
    'Fiscal Quarter',

    // Income Statement (PKR Millions)
    'Revenue (PKR M)',
    'Gross Profit (PKR M)',
    'Operating Income (PKR M)',
    'Net Income (PKR M)',
    'EPS Diluted (PKR)',

    // Profitability & Margins
    'Gross Margin %',
    'Operating Margin %',
    'Net Profit Margin %',

    // Cash Flows (PKR Millions)
    'Operating Cash Flow (PKR M)',
    'CapEx (PKR M)',
    'Free Cash Flow (PKR M)',
    'Dividends Paid (PKR M)',

    // Balance Sheet (PKR Millions)
    'Cash & Short-Term Inv (PKR M)',
    'Total Current Assets (PKR M)',
    'Total Assets (PKR M)',
    'Total Current Liabilities (PKR M)',
    'Total Debt (PKR M)',
    'Total Liabilities (PKR M)',
    'Total Stockholders Equity (PKR M)',
    'Retained Earnings (PKR M)',

    // Solvency & Health Ratios
    'Debt to Equity',
    'Current Ratio',
    'ROE %',
    'ROA %',
  ]

  const outputRows = rows.map((r) => {
    const toM = (val: any) => (val !== null && val !== undefined ? Number((parseFloat(val) / 1e6).toFixed(2)) : '')
    const rev = parseFloat(r.revenue) || 0
    const gross = parseFloat(r.gross_profit) || 0
    const opInc = parseFloat(r.operating_income) || 0
    const netInc = parseFloat(r.net_income) || 0
    const totalAssets = parseFloat(r.total_assets) || 0
    const totalEquity = parseFloat(r.total_equity) || 0
    const totalDebt = parseFloat(r.total_debt) || 0
    const curAssets = parseFloat(r.total_current_assets) || 0
    const curLiab = parseFloat(r.total_current_liabilities) || 0

    const grossMargin = rev > 0 ? Number(((gross / rev) * 100).toFixed(2)) : ''
    const opMargin = rev > 0 ? Number(((opInc / rev) * 100).toFixed(2)) : ''
    const netMargin = rev > 0 ? Number(((netInc / rev) * 100).toFixed(2)) : ''

    const roe = totalEquity > 0 ? Number(((netInc / totalEquity) * 100).toFixed(2)) : ''
    const roa = totalAssets > 0 ? Number(((netInc / totalAssets) * 100).toFixed(2)) : ''
    const d2e = totalEquity > 0 ? Number((totalDebt / totalEquity).toFixed(2)) : ''
    const curRatio = curLiab > 0 ? Number((curAssets / curLiab).toFixed(2)) : ''

    const cashAndInv = (parseFloat(r.cash_and_equivalents) || 0) + (parseFloat(r.short_term_investments) || 0)

    return [
      str(r.symbol),
      str(r.name),
      str(r.sector),
      formatDate(r.period_end_date),
      str(r.period_type),
      r.fiscal_quarter ? `Q${r.fiscal_quarter}` : 'Annual',

      toM(r.revenue),
      toM(r.gross_profit),
      toM(r.operating_income),
      toM(r.net_income),
      num(r.eps_diluted, 2),

      grossMargin,
      opMargin,
      netMargin,

      toM(r.operating_cash_flow),
      toM(r.capital_expenditures),
      toM(r.free_cash_flow),
      toM(r.dividends_paid),

      toM(cashAndInv),
      toM(r.total_current_assets),
      toM(r.total_assets),
      toM(r.total_current_liabilities),
      toM(r.total_debt),
      toM(r.total_liabilities),
      toM(r.total_equity),
      toM(r.retained_earnings),

      d2e,
      curRatio,
      roe,
      roa,
    ]
  })

  return {
    tabName: 'Financial_Fundamentals',
    headers,
    rows: outputRows,
  }
}

/**
 * TAB 3: Institutional Flows (LIPI / FIPI)
 */
export async function extractInstitutionalFlows(client: PoolClient): Promise<TabExtractionResult> {
  const query = `
    SELECT 
      date,
      client_type,
      sector_name,
      buy_value,
      sell_value,
      net_value,
      source
    FROM lipi_data
    ORDER BY date DESC, sector_name ASC, client_type ASC
    LIMIT 2000
  `

  const { rows } = await client.query(query)

  const headers = [
    'Date',
    'Investor Category (Client Type)',
    'Sector / Market Segment',
    'Buy Value ($M / PKR M)',
    'Sell Value ($M / PKR M)',
    'Net Inflow / Outflow ($M / PKR M)',
    'Flow Direction',
    'Source',
  ]

  const outputRows = rows.map((r) => {
    const net = parseFloat(r.net_value) || 0
    const direction = net > 0 ? '🟢 Net Buying' : net < 0 ? '🔴 Net Selling' : '⚪ Neutral'

    return [
      formatDate(r.date),
      str(r.client_type),
      str(r.sector_name),
      num(r.buy_value, 4),
      num(r.sell_value, 4),
      num(r.net_value, 4),
      direction,
      str(r.source, 'PSX / NCCPL'),
    ]
  })

  return {
    tabName: 'Institutional_Flows',
    headers,
    rows: outputRows,
  }
}

/**
 * TAB 4: Macro Economy & SBP Indicators
 */
export async function extractMacroSBPData(client: PoolClient): Promise<TabExtractionResult> {
  const query = `
    SELECT 
      'Interest Rates' as category,
      date,
      series_key,
      series_name,
      value,
      unit
    FROM sbp_interest_rates
    UNION ALL
    SELECT 
      'Economic Indicators' as category,
      date,
      series_key,
      series_name,
      value,
      unit
    FROM sbp_economic_data
    UNION ALL
    SELECT 
      'Balance of Payments' as category,
      date,
      series_key,
      series_name,
      value,
      unit
    FROM balance_of_payments
    ORDER BY date DESC, category ASC
    LIMIT 2500
  `

  const { rows } = await client.query(query)

  const headers = [
    'Date',
    'Category',
    'Indicator / Series Name',
    'Value',
    'Unit',
    'Series Key',
  ]

  const outputRows = rows.map((r) => [
    formatDate(r.date),
    str(r.category),
    str(r.series_name),
    num(r.value, 4),
    str(r.unit),
    str(r.series_key),
  ])

  return {
    tabName: 'Macro_&_SBP_Economy',
    headers,
    rows: outputRows,
  }
}

/**
 * TAB 5: US Equities, Crypto & Global Commodities
 */
export async function extractGlobalAssets(client: PoolClient): Promise<TabExtractionResult> {
  const query = `
    SELECT 
      s.symbol,
      s.asset_type,
      COALESCE(cp.name, s.symbol) as name,
      COALESCE(cp.sector, s.sector, 'Global') as sector,
      COALESCE(lp.latest_price, s.price) as price,
      COALESCE(lp.latest_price_date, s.price_date) as price_date,
      CASE 
        WHEN cp.shares_outstanding IS NOT NULL AND cp.shares_outstanding > 0 AND lp.latest_price IS NOT NULL
        THEN (lp.latest_price * cp.shares_outstanding)
        ELSE COALESCE(s.market_cap, cp.market_cap)
      END as market_cap,
      s.pe_ratio,
      s.pb_ratio,
      s.rsi_14,
      s.ytd_return,
      s.dividend_yield,
      cp.all_time_high,
      cp.fifty_two_week_high,
      s.updated_at
    FROM screener_metrics s
    LEFT JOIN company_profiles cp ON cp.symbol = s.symbol AND cp.asset_type = s.asset_type
    LEFT JOIN LATERAL (
      SELECT date as latest_price_date, close as latest_price
      FROM historical_price_data h
      WHERE h.asset_type = s.asset_type AND h.symbol = s.symbol
      ORDER BY h.date DESC
      LIMIT 1
    ) lp ON true
    WHERE s.asset_type IN ('us-equity', 'crypto', 'metals', 'commodity', 'eth', 'btc')
    ORDER BY s.asset_type ASC, s.market_cap DESC NULLS LAST
  `

  const { rows } = await client.query(query)

  const headers = [
    'Symbol',
    'Asset Class',
    'Asset Name',
    'Sector',
    'Price (USD)',
    'Price Date',
    'Market Cap ($B)',
    'P/E Ratio',
    'P/B Ratio',
    'RSI (14D)',
    'YTD Return %',
    'Dividend Yield %',
    '52W High ($)',
    'All-Time High ($)',
    'Last Updated',
  ]

  const outputRows = rows.map((r) => {
    const mcapB = r.market_cap ? Number((parseFloat(r.market_cap) / 1e9).toFixed(2)) : ''
    return [
      str(r.symbol),
      str(r.asset_type).toUpperCase(),
      str(r.name),
      str(r.sector),
      num(r.price, 2),
      formatDate(r.price_date),
      mcapB,
      num(r.pe_ratio, 2),
      num(r.pb_ratio, 2),
      num(r.rsi_14, 1),
      num(r.ytd_return, 2),
      num(r.dividend_yield, 2),
      num(r.fifty_two_week_high, 2),
      num(r.all_time_high, 2),
      formatDate(r.updated_at),
    ]
  })

  return {
    tabName: 'US_Crypto_Metals',
    headers,
    rows: outputRows,
  }
}

/**
 * TAB 6: Notable Events Feed & AI Alerts
 */
export async function extractNotableEvents(client: PoolClient): Promise<TabExtractionResult> {
  const query = `
    SELECT 
      created_at,
      symbol,
      event_type,
      headline,
      summary,
      description
    FROM notable_events
    ORDER BY created_at DESC
    LIMIT 500
  `

  const { rows } = await client.query(query)

  const headers = [
    'Timestamp (UTC)',
    'Symbol',
    'Event Type',
    'AI Headline',
    'Summary / Analysis',
    'Details / Description',
  ]

  const outputRows = rows.map((r) => [
    formatDate(r.created_at),
    str(r.symbol),
    str(r.event_type),
    str(r.headline),
    str(r.summary),
    str(r.description),
  ])

  return {
    tabName: 'Notable_Events_Feed',
    headers,
    rows: outputRows,
  }
}

/**
 * TAB 7: Market Cycles
 */
export async function extractMarketCycles(client: PoolClient): Promise<TabExtractionResult> {
  const query = `
    SELECT 
      asset_type,
      symbol,
      cycle_id,
      cycle_name,
      start_date,
      end_date,
      start_price,
      end_price,
      roi,
      duration_trading_days
    FROM market_cycles
    ORDER BY asset_type ASC, cycle_id ASC
  `

  const { rows } = await client.query(query)

  const headers = [
    'Asset Type',
    'Benchmark / Symbol',
    'Cycle ID',
    'Cycle Name',
    'Start Date',
    'End Date',
    'Start Price (Points)',
    'Peak / End Price (Points)',
    'Total Cycle ROI %',
    'Duration (Trading Days)',
    'Duration (Years Approx)',
  ]

  const outputRows = rows.map((r) => {
    const days = parseInt(r.duration_trading_days) || 0
    const years = days > 0 ? Number((days / 252).toFixed(1)) : ''

    return [
      str(r.asset_type).toUpperCase(),
      str(r.symbol),
      r.cycle_id,
      str(r.cycle_name),
      formatDate(r.start_date),
      formatDate(r.end_date),
      num(r.start_price, 2),
      num(r.end_price, 2),
      num(r.roi, 2),
      days,
      years,
    ]
  })

  return {
    tabName: 'Market_Cycles',
    headers,
    rows: outputRows,
  }
}

/**
 * TAB: KSE-100 Daily Index History
 */
export async function extractKSE100Daily(client: PoolClient): Promise<TabExtractionResult> {
  const query = `
    SELECT 
      date,
      open,
      high,
      low,
      close,
      volume,
      change_pct
    FROM historical_price_data
    WHERE symbol = 'KSE100'
    ORDER BY date DESC
    LIMIT 2000
  `

  const { rows } = await client.query(query)

  const headers = [
    'Date',
    'KSE-100 Index (Close Points)',
    'Daily Change (Points)',
    'Daily Change %',
    'Index Open',
    'Intraday High',
    'Intraday Low',
    'Intraday Range (Pts)',
    'Trading Volume',
  ]

  let ath = 0
  rows.forEach((r) => {
    const c = parseFloat(r.close) || 0
    if (c > ath) ath = c
  })

  const outputRows = rows.map((r, i) => {
    const close = parseFloat(r.close) || 0
    const open = parseFloat(r.open) || close
    const high = parseFloat(r.high) || close
    const low = parseFloat(r.low) || close
    const rangePts = high && low ? Number((high - low).toFixed(2)) : ''

    // Calculate daily point difference against next row (which is previous calendar day)
    let changePts: number | string = ''
    let changePct: number | string = ''

    if (i < rows.length - 1) {
      const prevClose = parseFloat(rows[i + 1].close) || 0
      if (prevClose > 0) {
        changePts = Number((close - prevClose).toFixed(2))
        changePct = Number((((close - prevClose) / prevClose) * 100).toFixed(2))
      }
    }

    return [
      formatDate(r.date),
      num(r.close, 2),
      changePts,
      changePct,
      num(r.open, 2),
      num(r.high, 2),
      num(r.low, 2),
      rangePts,
      num(r.volume, 0),
    ]
  })

  return {
    tabName: 'KSE100_Daily_Index',
    headers,
    rows: outputRows,
  }
}

/**
 * TAB 8: Sync Overview & Executive KPI Summary
 */
export async function extractSyncOverview(
  client: PoolClient,
  psxResult: TabExtractionResult,
  finResult: TabExtractionResult
): Promise<TabExtractionResult> {
  const now = new Date()
  const nowPKT = new Date(now.getTime() + 5 * 60 * 60 * 1000)

  // Calculate high-level summary KPIs
  const totalPSXStocks = psxResult.rows.length
  const totalFinancialRecords = finResult.rows.length

  // Calculate Median P/E and Total Market Cap of tracked PSX universe
  let totalMcapPKRB = 0
  const peList: number[] = []

  psxResult.rows.forEach((r) => {
    const mcap = parseFloat(r[5])
    if (!isNaN(mcap)) totalMcapPKRB += mcap
    const pe = parseFloat(r[8])
    if (!isNaN(pe) && pe > 0 && pe < 100) peList.push(pe)
  })

  peList.sort((a, b) => a - b)
  const medianPE = peList.length > 0 ? peList[Math.floor(peList.length / 2)] : 0

  // Top 5 Undervalued Stocks (Lowest Relative P/E)
  const undervalued = [...psxResult.rows]
    .filter((r) => {
      const relPE = parseFloat(r[10])
      const roe = parseFloat(r[26])
      return !isNaN(relPE) && relPE > 0 && (!isNaN(roe) ? roe > 0 : true)
    })
    .sort((a, b) => parseFloat(a[10]) - parseFloat(b[10]))
    .slice(0, 5)

  // Top 5 Dividend Yield Stocks
  const topDividends = [...psxResult.rows]
    .filter((r) => {
      const dy = parseFloat(r[39])
      return !isNaN(dy) && dy > 0 && dy < 50
    })
    .sort((a, b) => parseFloat(b[39]) - parseFloat(a[39]))
    .slice(0, 5)

  const headers = ['Executive KPI / Metric', 'Value', 'Notes / Context']

  const summaryRows: any[][] = [
    ['🚀 CONVICTIONPAYS MASTER DATA INTELLIGENCE', '', 'Live Institutional Research & Metric Feed'],
    ['Last Synced (UTC)', now.toISOString().replace('T', ' ').substring(0, 19), 'Automated Cloud Sync'],
    ['Last Synced (Pakistan Time - PKT)', nowPKT.toISOString().replace('T', ' ').substring(0, 19), 'Karachi Timezone'],
    ['Total PSX Equities Synced', totalPSXStocks, 'Universe of Active Stocks with Price & Valuation'],
    ['Total Financial Statement Periods', totalFinancialRecords, 'TTM and Annual Income, Balance Sheet & Cash Flow Records'],
    ['Total Tracked PSX Market Cap', `PKR ${totalMcapPKRB.toFixed(2)} Billion`, 'Aggregated Listed Market Capitalization'],
    ['PSX Universe Median Trailing P/E', `${medianPE.toFixed(2)}x`, 'Median P/E ratio across all profitable companies'],
    ['', '', ''],
    ['⭐ TOP 5 DEEPEST VALUE ANOMALIES (Relative P/E vs Sector)', '', ''],
    ...undervalued.map((r, i) => [
      `  #${i + 1} ${r[0]} (${r[1]})`,
      `Rel P/E: ${r[10]}x (P/E: ${r[8]}x vs Sector ${r[9]}x)`,
      `Sector: ${r[2]} | ROE: ${r[26]}% | MCap: PKR ${r[5]}B`,
    ]),
    ['', '', ''],
    ['💰 TOP 5 HIGH DIVIDEND YIELD BLUE-CHIPS', '', ''],
    ...topDividends.map((r, i) => [
      `  #${i + 1} ${r[0]} (${r[1]})`,
      `Div Yield: ${r[39]}% (Payout: ${r[41]}%)`,
      `P/E: ${r[8]}x | MCap: PKR ${r[5]}B | Sector: ${r[2]}`,
    ]),
  ]

  return {
    tabName: 'Sync_Overview',
    headers,
    rows: summaryRows,
  }
}
