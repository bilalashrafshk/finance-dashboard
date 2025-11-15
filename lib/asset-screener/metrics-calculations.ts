/**
 * Asset Screener Metrics Calculations
 * 
 * This file contains all mathematical logic for calculating asset metrics.
 * Keep all calculation logic here for easy modification in the future.
 * 
 * All functions are pure and can be easily tested or modified.
 */

export interface PriceDataPoint {
  date: string // YYYY-MM-DD
  close: number
}

export interface CalculatedMetrics {
  ytdReturn?: number | null
  ytdReturnPercent?: number | null
  cagr1Year?: number | null
  cagr3Year?: number | null
  cagr5Year?: number | null
  beta1Year?: number | null
  sharpeRatio1Year?: number | null
}

/**
 * Calculate Year-to-Date (YTD) Return
 * 
 * Formula: (Current Price - Price at Start of Year) / Price at Start of Year * 100
 * 
 * @param currentPrice - Current price of the asset
 * @param historicalData - Array of historical price data points
 * @returns YTD return as a percentage, or null if insufficient data
 */
export function calculateYTDReturn(
  currentPrice: number,
  historicalData: PriceDataPoint[]
): number | null {
  if (!historicalData || historicalData.length === 0) {
    return null
  }

  // Get current year
  const currentYear = new Date().getFullYear()
  const yearStartDate = `${currentYear}-01-01`

  // Find price at start of year
  // Sort data by date (ascending) to find the first record on or after Jan 1
  const sortedData = [...historicalData].sort((a, b) => a.date.localeCompare(b.date))
  
  // Find the first record on or after Jan 1 of current year
  let yearStartPrice: number | null = null
  
  // First, try to find exact match for Jan 1
  const exactMatch = sortedData.find(d => d.date === yearStartDate)
  if (exactMatch) {
    yearStartPrice = exactMatch.close
  } else {
    // Find the first record after Jan 1 (markets might be closed on Jan 1)
    const afterJan1 = sortedData.find(d => d.date >= yearStartDate)
    if (afterJan1) {
      yearStartPrice = afterJan1.close
    } else {
      // If no data after Jan 1, use the last available price before Jan 1
      const beforeJan1 = sortedData.filter(d => d.date < yearStartDate)
      if (beforeJan1.length > 0) {
        yearStartPrice = beforeJan1[beforeJan1.length - 1].close
      }
    }
  }

  if (yearStartPrice === null || yearStartPrice === 0) {
    return null
  }

  // Calculate YTD return
  const ytdReturn = ((currentPrice - yearStartPrice) / yearStartPrice) * 100

  return ytdReturn
}

/**
 * Calculate Compound Annual Growth Rate (CAGR)
 * 
 * Formula: ((Ending Value / Beginning Value) ^ (1 / Number of Years)) - 1
 * 
 * @param currentPrice - Current price of the asset
 * @param historicalData - Array of historical price data points
 * @param years - Number of years to calculate CAGR for (e.g., 1, 3, 5)
 * @returns CAGR as a percentage, or null if insufficient data
 */
export function calculateCAGR(
  currentPrice: number,
  historicalData: PriceDataPoint[],
  years: number
): number | null {
  if (!historicalData || historicalData.length === 0 || years <= 0) {
    return null
  }

  // Calculate the target date (years ago from today)
  const today = new Date()
  const targetDate = new Date(today)
  targetDate.setFullYear(today.getFullYear() - years)
  const targetDateStr = targetDate.toISOString().split('T')[0]

  // Sort data by date (ascending)
  const sortedData = [...historicalData].sort((a, b) => a.date.localeCompare(b.date))

  // Find price at target date (or closest before)
  let beginningPrice: number | null = null

  // Try to find exact match
  const exactMatch = sortedData.find(d => d.date === targetDateStr)
  if (exactMatch) {
    beginningPrice = exactMatch.close
  } else {
    // Find the closest record before the target date
    const beforeTarget = sortedData.filter(d => d.date <= targetDateStr)
    if (beforeTarget.length > 0) {
      beginningPrice = beforeTarget[beforeTarget.length - 1].close
    } else {
      // If no data before target date, use the earliest available price
      if (sortedData.length > 0) {
        beginningPrice = sortedData[0].close
        // Adjust years based on actual data range
        const actualStartDate = new Date(sortedData[0].date)
        const actualYears = (today.getTime() - actualStartDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        if (actualYears < 0.5) {
          // Need at least 6 months of data for meaningful CAGR
          return null
        }
        // Use actual years for calculation
        const cagr = Math.pow(currentPrice / beginningPrice, 1 / actualYears) - 1
        return cagr * 100
      }
    }
  }

  if (beginningPrice === null || beginningPrice === 0) {
    return null
  }

  // Calculate CAGR
  // CAGR = ((Ending Value / Beginning Value) ^ (1 / Number of Years)) - 1
  const cagr = Math.pow(currentPrice / beginningPrice, 1 / years) - 1

  return cagr * 100 // Convert to percentage
}

/**
 * Calculate daily returns from price data
 * 
 * @param priceData - Array of price data points sorted by date
 * @returns Array of daily returns (percentage)
 */
function calculateDailyReturns(priceData: PriceDataPoint[]): number[] {
  const returns: number[] = []
  
  for (let i = 1; i < priceData.length; i++) {
    const prevPrice = priceData[i - 1].close
    const currentPrice = priceData[i].close
    
    if (prevPrice > 0) {
      const dailyReturn = ((currentPrice - prevPrice) / prevPrice) * 100
      returns.push(dailyReturn)
    }
  }
  
  return returns
}

/**
 * Align asset and benchmark data by matching dates
 * 
 * @param assetData - Asset price data
 * @param benchmarkData - Benchmark price data
 * @returns Aligned data arrays with matching dates
 */
function alignPriceData(
  assetData: PriceDataPoint[],
  benchmarkData: PriceDataPoint[]
): { asset: PriceDataPoint[], benchmark: PriceDataPoint[] } {
  // Create maps for quick lookup
  const assetMap = new Map<string, number>()
  assetData.forEach(point => {
    assetMap.set(point.date, point.close)
  })
  
  const benchmarkMap = new Map<string, number>()
  benchmarkData.forEach(point => {
    benchmarkMap.set(point.date, point.close)
  })
  
  // Find common dates
  const commonDates = new Set<string>()
  assetMap.forEach((_, date) => {
    if (benchmarkMap.has(date)) {
      commonDates.add(date)
    }
  })
  
  // Sort dates
  const sortedDates = Array.from(commonDates).sort()
  
  // Build aligned arrays
  const alignedAsset: PriceDataPoint[] = []
  const alignedBenchmark: PriceDataPoint[] = []
  
  sortedDates.forEach(date => {
    const assetPrice = assetMap.get(date)
    const benchmarkPrice = benchmarkMap.get(date)
    
    if (assetPrice !== undefined && benchmarkPrice !== undefined) {
      alignedAsset.push({ date, close: assetPrice })
      alignedBenchmark.push({ date, close: benchmarkPrice })
    }
  })
  
  return { asset: alignedAsset, benchmark: alignedBenchmark }
}

/**
 * Calculate mean (average) of an array
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0
  const sum = values.reduce((a, b) => a + b, 0)
  return sum / values.length
}

/**
 * Calculate variance of an array
 */
function variance(values: number[]): number {
  if (values.length === 0) return 0
  const avg = mean(values)
  const squaredDiffs = values.map(value => Math.pow(value - avg, 2))
  return mean(squaredDiffs)
}

/**
 * Calculate standard deviation of an array
 */
function standardDeviation(values: number[]): number {
  return Math.sqrt(variance(values))
}

/**
 * Calculate covariance between two arrays
 */
function covariance(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0
  
  const xMean = mean(x)
  const yMean = mean(y)
  
  let sum = 0
  for (let i = 0; i < x.length; i++) {
    sum += (x[i] - xMean) * (y[i] - yMean)
  }
  
  return sum / x.length
}

/**
 * Calculate Beta (1-year)
 * 
 * Formula: Beta = Covariance(Asset Returns, Market Returns) / Variance(Market Returns)
 * 
 * @param assetData - Asset historical price data
 * @param benchmarkData - Benchmark (SPX500 or KSE100) historical price data
 * @returns Beta value, or null if insufficient data
 */
export function calculateBeta(
  assetData: PriceDataPoint[],
  benchmarkData: PriceDataPoint[]
): number | null {
  if (!assetData || assetData.length === 0 || !benchmarkData || benchmarkData.length === 0) {
    return null
  }
  
  // Align data by date
  const { asset: alignedAsset, benchmark: alignedBenchmark } = alignPriceData(assetData, benchmarkData)
  
  // Need at least 30 trading days (about 6 weeks) for meaningful Beta
  if (alignedAsset.length < 30) {
    return null
  }
  
  // Calculate daily returns for both
  const assetReturns = calculateDailyReturns(alignedAsset)
  const benchmarkReturns = calculateDailyReturns(alignedBenchmark)
  
  // Ensure both arrays have same length (should be same after alignment)
  const minLength = Math.min(assetReturns.length, benchmarkReturns.length)
  if (minLength < 30) {
    return null
  }
  
  const assetReturnsTrimmed = assetReturns.slice(0, minLength)
  const benchmarkReturnsTrimmed = benchmarkReturns.slice(0, minLength)
  
  // Calculate variance of benchmark returns
  const benchmarkVariance = variance(benchmarkReturnsTrimmed)
  
  if (benchmarkVariance === 0) {
    return null // Cannot divide by zero
  }
  
  // Calculate covariance
  const cov = covariance(assetReturnsTrimmed, benchmarkReturnsTrimmed)
  
  // Calculate Beta
  const beta = cov / benchmarkVariance
  
  return beta
}

/**
 * Calculate Sharpe Ratio (annualized from daily returns)
 * 
 * Formula: Sharpe Ratio = (Mean Daily Return * 252 - Risk-Free Rate) / (Std Dev * sqrt(252))
 * 
 * Where:
 * - 252 = number of trading days in a year
 * - Risk-Free Rate = annual risk-free rate (default: 2.5% or 0.025)
 * 
 * @param historicalData - Asset historical price data
 * @param riskFreeRate - Annual risk-free rate (default: 0.025 = 2.5%)
 * @returns Annualized Sharpe Ratio, or null if insufficient data
 */
export function calculateSharpeRatio(
  historicalData: PriceDataPoint[],
  riskFreeRate: number = 0.025 // Default 2.5% annual risk-free rate
): number | null {
  if (!historicalData || historicalData.length < 30) {
    return null // Need at least 30 trading days
  }
  
  // Calculate daily returns
  const dailyReturns = calculateDailyReturns(historicalData)
  
  if (dailyReturns.length < 30) {
    return null
  }
  
  // Calculate mean daily return (as percentage)
  const meanDailyReturn = mean(dailyReturns)
  
  // Calculate standard deviation of daily returns (as percentage)
  const stdDevDailyReturn = standardDeviation(dailyReturns)
  
  if (stdDevDailyReturn === 0) {
    return null // Cannot divide by zero
  }
  
  // Annualize the returns and standard deviation
  // Mean annual return = Mean daily return * 252 (trading days)
  const annualizedReturn = meanDailyReturn * 252
  
  // Annualized standard deviation = Daily std dev * sqrt(252)
  const annualizedStdDev = stdDevDailyReturn * Math.sqrt(252)
  
  if (annualizedStdDev === 0) {
    return null
  }
  
  // Calculate Sharpe Ratio
  // Sharpe Ratio = (Annualized Return - Risk-Free Rate) / Annualized Std Dev
  const sharpeRatio = (annualizedReturn - (riskFreeRate * 100)) / annualizedStdDev
  
  return sharpeRatio
}

/**
 * Risk-free rate configuration
 */
export interface RiskFreeRates {
  us: number // US risk-free rate as percentage (e.g., 2.5 for 2.5%)
  pk: number // PK risk-free rate as percentage (e.g., 3.5 for 3.5%)
}

/**
 * Calculate all metrics for an asset
 * 
 * This is the main function that orchestrates all metric calculations.
 * Add new metrics here as you implement them.
 * 
 * @param currentPrice - Current price of the asset
 * @param historicalData - Array of historical price data points (full dataset for CAGR)
 * @param assetType - Type of asset (for determining which metrics to calculate)
 * @param benchmarkData - Benchmark data for Beta calculation (SPX500 or KSE100)
 * @param riskFreeRates - Risk-free rates for Sharpe Ratio calculation
 * @param historicalData1Year - Optional 1-year subset for Beta and Sharpe Ratio (for consistency)
 * @returns Object containing all calculated metrics
 */
export function calculateAllMetrics(
  currentPrice: number,
  historicalData: PriceDataPoint[],
  assetType?: string,
  benchmarkData?: PriceDataPoint[],
  riskFreeRates?: RiskFreeRates,
  historicalData1Year?: PriceDataPoint[]
): CalculatedMetrics {
  const metrics: CalculatedMetrics = {}

  // Calculate YTD Return
  const ytdReturn = calculateYTDReturn(currentPrice, historicalData)
  if (ytdReturn !== null) {
    metrics.ytdReturn = ytdReturn
    metrics.ytdReturnPercent = ytdReturn
  }

  // Calculate CAGR for different periods
  const cagr1Year = calculateCAGR(currentPrice, historicalData, 1)
  if (cagr1Year !== null) {
    metrics.cagr1Year = cagr1Year
  }

  const cagr3Year = calculateCAGR(currentPrice, historicalData, 3)
  if (cagr3Year !== null) {
    metrics.cagr3Year = cagr3Year
  }

  const cagr5Year = calculateCAGR(currentPrice, historicalData, 5)
  if (cagr5Year !== null) {
    metrics.cagr5Year = cagr5Year
  }

  // Calculate Beta for US and PK equities
  // Use 1-year subset if provided (for consistency with summary), otherwise use full data
  if ((assetType === 'us-equity' || assetType === 'pk-equity') && benchmarkData && benchmarkData.length > 0) {
    const dataForBeta = historicalData1Year && historicalData1Year.length > 0 ? historicalData1Year : historicalData
    const beta = calculateBeta(dataForBeta, benchmarkData)
    if (beta !== null) {
      metrics.beta1Year = beta
    }
  }

  // Calculate Sharpe Ratio for US and PK equities
  // Use 1-year subset if provided (for consistency with summary), otherwise use full data
  if (assetType === 'us-equity' || assetType === 'pk-equity') {
    // Use provided risk-free rates or defaults
    let riskFreeRate: number
    if (riskFreeRates) {
      riskFreeRate = assetType === 'us-equity' 
        ? riskFreeRates.us / 100  // Convert percentage to decimal
        : riskFreeRates.pk / 100
    } else {
      // Default to 2.5% for US and 3.5% for PK
      riskFreeRate = assetType === 'us-equity' ? 0.025 : 0.035
    }
    
    const dataForSharpe = historicalData1Year && historicalData1Year.length > 0 ? historicalData1Year : historicalData
    const sharpeRatio = calculateSharpeRatio(dataForSharpe, riskFreeRate)
    if (sharpeRatio !== null) {
      metrics.sharpeRatio1Year = sharpeRatio
    }
  }

  return metrics
}

/**
 * Format percentage for display
 * 
 * @param value - Percentage value (e.g., 15.5 for 15.5%)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string with % sign
 */
export function formatPercentage(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A'
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

/**
 * Format currency for display
 * 
 * @param value - Currency value
 * @param currency - Currency code (e.g., 'USD', 'PKR')
 * @param decimals - Number of decimal places
 * @returns Formatted currency string
 */
export function formatCurrency(value: number | null | undefined, currency: string = 'USD', decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A'
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

