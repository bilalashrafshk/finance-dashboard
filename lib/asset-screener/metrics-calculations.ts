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

export interface MonthlyObservation {
  year: number
  return: number // Monthly return as percentage
  startDate: string // First day of month date
  endDate: string // Last day of month date
  startPrice: number
  endPrice: number
}

export interface MonthlySeasonality {
  month: number // 0-11 (January = 0)
  monthName: string
  avgReturn: number // Average return as percentage
  count: number // Number of observations
  observations: MonthlyObservation[] // Detailed observations for each year
}

export interface DrawdownPeriod {
  peakDate: string
  troughDate: string
  recoveryDate: string | null // null if not yet recovered
  peakPrice: number
  troughPrice: number
  drawdown: number // percentage
  duration: number // days from peak to recovery (or to end if not recovered)
}

export interface CalculatedMetrics {
  ytdReturn?: number | null
  ytdReturnPercent?: number | null
  cagr1Year?: number | null
  cagr3Year?: number | null
  cagr5Year?: number | null
  beta1Year?: number | null
  beta3Year?: number | null
  sharpeRatio1Year?: number | null
  sharpeRatio3Year?: number | null
  sortinoRatio1Year?: number | null
  sortinoRatio3Year?: number | null
  maxDrawdown?: number | null
  maxDrawdown3Year?: number | null
  monthlySeasonality?: MonthlySeasonality[]
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
 * Calculate Sortino Ratio (annualized from daily returns)
 * 
 * Formula: Sortino Ratio = (Mean Daily Return * 252 - Risk-Free Rate) / (Downside Std Dev * sqrt(252))
 * 
 * Where:
 * - 252 = number of trading days in a year
 * - Risk-Free Rate = annual risk-free rate (default: 2.5% or 0.025)
 * - Downside Std Dev = standard deviation of only negative returns
 * 
 * @param historicalData - Asset historical price data
 * @param riskFreeRate - Annual risk-free rate (default: 0.025 = 2.5%)
 * @returns Annualized Sortino Ratio, or null if insufficient data
 */
export function calculateSortinoRatio(
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

  // Calculate downside deviation: only consider negative returns (returns below 0)
  const negativeReturns = dailyReturns.filter(ret => ret < 0)

  if (negativeReturns.length === 0) {
    // If there are no negative returns, downside deviation is 0
    // In this case, Sortino Ratio would be infinite, so we return null
    // Alternatively, we could return a very high number, but null is safer
    return null
  }

  // Calculate standard deviation of negative returns only
  const downsideStdDev = standardDeviation(negativeReturns)

  if (downsideStdDev === 0) {
    return null // Cannot divide by zero
  }

  // Annualize the returns and downside standard deviation
  // Mean annual return = Mean daily return * 252 (trading days)
  const annualizedReturn = meanDailyReturn * 252

  // Annualized downside standard deviation = Downside std dev * sqrt(252)
  const annualizedDownsideStdDev = downsideStdDev * Math.sqrt(252)

  if (annualizedDownsideStdDev === 0) {
    return null
  }

  // Calculate Sortino Ratio
  // Sortino Ratio = (Annualized Return - Risk-Free Rate) / Annualized Downside Std Dev
  const sortinoRatio = (annualizedReturn - (riskFreeRate * 100)) / annualizedDownsideStdDev

  return sortinoRatio
}

/**
 * Calculate Max Drawdown
 * 
 * Formula: MaxDD = max((Peak - Trough) / Peak)
 * 
 * Max Drawdown is the largest observed drop from peak to trough.
 * Shows downside risk - critical for illiquid stocks.
 * 
 * @param historicalData - Asset historical price data
 * @returns Max Drawdown as a percentage (e.g., 25.5 for 25.5%), or null if insufficient data
 */
export function calculateMaxDrawdown(
  historicalData: PriceDataPoint[]
): number | null {
  if (!historicalData || historicalData.length < 2) {
    return null // Need at least 2 data points
  }

  // Sort data by date (ascending) to ensure chronological order
  const sortedData = [...historicalData].sort((a, b) => a.date.localeCompare(b.date))

  let maxDrawdown = 0
  let peak = sortedData[0].close

  // Iterate through prices to find the maximum drawdown
  for (let i = 1; i < sortedData.length; i++) {
    const currentPrice = sortedData[i].close

    // Update peak if we see a new high
    if (currentPrice > peak) {
      peak = currentPrice
    }

    // Calculate drawdown from current peak
    if (peak > 0) {
      const drawdown = ((peak - currentPrice) / peak) * 100

      // Update max drawdown if this is larger
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown
      }
    }
  }

  return maxDrawdown
}

/**
 * Calculate Drawdown Duration
 * 
 * Measures how long it takes to recover from a peak.
 * Tracks time from peak to recovery (when price returns to or exceeds peak).
 * 
 * @param historicalData - Asset historical price data
 * @returns Object with max and average drawdown durations in days, or null if insufficient data
 */
export function calculateDrawdownDuration(
  historicalData: PriceDataPoint[]
): { maxDuration: number | null, avgDuration: number | null, drawdownPeriods: DrawdownPeriod[] } | null {
  if (!historicalData || historicalData.length < 2) {
    return null
  }

  // Sort data by date (ascending)
  const sortedData = [...historicalData].sort((a, b) => a.date.localeCompare(b.date))

  const drawdownPeriods: DrawdownPeriod[] = []
  let currentPeak: { date: string, price: number } | null = null
  let currentTrough: { date: string, price: number } | null = null
  let inDrawdown = false

  for (let i = 0; i < sortedData.length; i++) {
    const currentDate = sortedData[i].date
    const currentPrice = sortedData[i].close

    if (!currentPeak || currentPrice > currentPeak.price) {
      // New peak - check if we were in a drawdown and recovered
      if (inDrawdown && currentPeak && currentTrough) {
        // Recovery! Calculate the drawdown period
        const peakDate = new Date(currentPeak.date)
        const recoveryDate = new Date(currentDate)
        const duration = Math.floor((recoveryDate.getTime() - peakDate.getTime()) / (1000 * 60 * 60 * 24))
        const drawdown = ((currentPeak.price - currentTrough.price) / currentPeak.price) * 100

        drawdownPeriods.push({
          peakDate: currentPeak.date,
          troughDate: currentTrough.date,
          recoveryDate: currentDate,
          peakPrice: currentPeak.price,
          troughPrice: currentTrough.price,
          drawdown,
          duration
        })

        inDrawdown = false
        currentTrough = null
      }

      // Update peak
      currentPeak = { date: currentDate, price: currentPrice }
    } else if (currentPeak && currentPrice < currentPeak.price) {
      // We're in a drawdown
      if (!inDrawdown) {
        inDrawdown = true
        currentTrough = { date: currentDate, price: currentPrice }
      } else {
        // Update trough if this is a new low
        if (!currentTrough || currentPrice < currentTrough.price) {
          currentTrough = { date: currentDate, price: currentPrice }
        }
      }
    }
  }

  // Handle any ongoing drawdown (not yet recovered)
  if (inDrawdown && currentPeak && currentTrough) {
    const peakDate = new Date(currentPeak.date)
    const lastDate = new Date(sortedData[sortedData.length - 1].date)
    const duration = Math.floor((lastDate.getTime() - peakDate.getTime()) / (1000 * 60 * 60 * 24))
    const drawdown = ((currentPeak.price - currentTrough.price) / currentPeak.price) * 100

    drawdownPeriods.push({
      peakDate: currentPeak.date,
      troughDate: currentTrough.date,
      recoveryDate: null, // Not yet recovered
      peakPrice: currentPeak.price,
      troughPrice: currentTrough.price,
      drawdown,
      duration
    })
  }

  if (drawdownPeriods.length === 0) {
    return null
  }

  // Calculate max and average duration (only for recovered drawdowns)
  const recoveredDurations = drawdownPeriods
    .filter(p => p.recoveryDate !== null)
    .map(p => p.duration)

  if (recoveredDurations.length === 0) {
    return {
      maxDuration: null,
      avgDuration: null,
      drawdownPeriods
    }
  }

  const maxDuration = Math.max(...recoveredDurations)
  const avgDuration = mean(recoveredDurations)

  return {
    maxDuration,
    avgDuration,
    drawdownPeriods
  }
}

/**
 * Calculate Monthly Seasonality
 * 
 * Computes average monthly returns by:
 * 1. For each year, calculate monthly return: (Last day of month price - First day of month price) / First day of month price
 * 2. Average those monthly returns across all years
 * 
 * @param historicalData - Asset historical price data
 * @returns Array of monthly seasonality data, or null if insufficient data
 */
export function calculateMonthlySeasonality(
  historicalData: PriceDataPoint[]
): MonthlySeasonality[] | null {
  if (!historicalData || historicalData.length < 2) {
    return null
  }

  // Sort data by date (ascending)
  const sortedData = [...historicalData].sort((a, b) => a.date.localeCompare(b.date))

  // Group data points by year-month
  const dataByYearMonth: Map<string, PriceDataPoint[]> = new Map()

  sortedData.forEach(point => {
    const date = new Date(point.date)
    const year = date.getFullYear()
    const month = date.getMonth() // 0-11
    const key = `${year}-${month}`

    if (!dataByYearMonth.has(key)) {
      dataByYearMonth.set(key, [])
    }
    dataByYearMonth.get(key)!.push(point)
  })

  // For each month (0-11), collect monthly returns and detailed observations across all years
  const monthlyReturnsByMonth: Map<number, number[]> = new Map()
  const monthlyObservationsByMonth: Map<number, MonthlyObservation[]> = new Map()

  dataByYearMonth.forEach((points, key) => {
    if (points.length === 0) return

    // Sort points by date within the month
    const sortedPoints = [...points].sort((a, b) => a.date.localeCompare(b.date))

    // Extract year and month from key (format: "YYYY-M")
    const [yearStr, monthStr] = key.split('-')
    const year = parseInt(yearStr)
    const month = parseInt(monthStr)

    // Get the first and last day of the month
    const firstDayOfMonth = new Date(year, month, 1)
    const lastDayOfMonth = new Date(year, month + 1, 0) // Last day of the month

    // Check if we have data in the first week (days 1-7)
    const firstWeekEnd = new Date(year, month, 7)
    const hasFirstWeekData = sortedPoints.some(point => {
      const pointDate = new Date(point.date)
      return pointDate >= firstDayOfMonth && pointDate <= firstWeekEnd
    })

    // Check if we have data in the last week (last 7 days of the month)
    const lastWeekStart = new Date(year, month + 1, -7) // 7 days before end of month
    const hasLastWeekData = sortedPoints.some(point => {
      const pointDate = new Date(point.date)
      return pointDate >= lastWeekStart && pointDate <= lastDayOfMonth
    })

    // Only calculate monthly return if we have data in both first and last week
    if (!hasFirstWeekData || !hasLastWeekData) {
      return // Skip this month-year combination
    }

    // Get first and last day prices for this month
    const firstDayPrice = sortedPoints[0].close
    const lastDayPrice = sortedPoints[sortedPoints.length - 1].close

    if (firstDayPrice > 0) {
      // Calculate monthly return: (Last day - First day) / First day * 100
      const monthlyReturn = ((lastDayPrice - firstDayPrice) / firstDayPrice) * 100

      if (!monthlyReturnsByMonth.has(month)) {
        monthlyReturnsByMonth.set(month, [])
        monthlyObservationsByMonth.set(month, [])
      }
      monthlyReturnsByMonth.get(month)!.push(monthlyReturn)

      // Store detailed observation
      monthlyObservationsByMonth.get(month)!.push({
        year,
        return: monthlyReturn,
        startDate: sortedPoints[0].date,
        endDate: sortedPoints[sortedPoints.length - 1].date,
        startPrice: firstDayPrice,
        endPrice: lastDayPrice
      })
    }
  })

  // Calculate average for each month across all years
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']

  const seasonality: MonthlySeasonality[] = []

  for (let month = 0; month < 12; month++) {
    const returns = monthlyReturnsByMonth.get(month) || []
    const observations = monthlyObservationsByMonth.get(month) || []
    const avgReturn = returns.length > 0 ? mean(returns) : 0

    // Sort observations by year (descending - most recent first)
    const sortedObservations = [...observations].sort((a, b) => b.year - a.year)

    seasonality.push({
      month,
      monthName: monthNames[month],
      avgReturn,
      count: returns.length, // Number of years with data for this month
      observations: sortedObservations
    })
  }

  return seasonality
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
 * @param historicalDataForSeasonality - Optional full historical data for seasonality (all years, no limit)
 * @returns Object containing all calculated metrics
 */
export function calculateAllMetrics(
  currentPrice: number,
  historicalData: PriceDataPoint[],
  assetType?: string,
  benchmarkData?: PriceDataPoint[],
  riskFreeRates?: RiskFreeRates,
  historicalData1Year?: PriceDataPoint[],
  historicalData3Year?: PriceDataPoint[],
  historicalDataForSeasonality?: PriceDataPoint[]
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

  // Calculate Risk Metrics (Beta, Sharpe, Sortino)
  // We use specific subsets if provided, otherwise we might derive them (but explicit subsets are better)

  const riskFreeRate = (assetType === 'pk-equity' || assetType === 'kse100')
    ? (riskFreeRates?.pk || 15.0)
    : (riskFreeRates?.us || 2.5)

  // 1-Year Metrics
  if (historicalData1Year && historicalData1Year.length > 0) {
    // Beta 1Y
    if (benchmarkData && benchmarkData.length > 0) {
      // For Beta, we need to align 1Y asset data with benchmark data
      // We'll pass the full benchmark data and let calculateBeta handle alignment/slicing
      // or ideally we should pass 1Y benchmark data too. 
      // calculateBeta aligns by date, so passing full benchmark is fine as long as dates overlap.
      const beta1Y = calculateBeta(historicalData1Year, benchmarkData)
      if (beta1Y !== null) {
        metrics.beta1Year = beta1Y
      }
    }

    // Sharpe 1Y
    const sharpe1Y = calculateSharpeRatio(historicalData1Year, riskFreeRate / 100)
    if (sharpe1Y !== null) {
      metrics.sharpeRatio1Year = sharpe1Y
    }

    // Sortino 1Y
    const sortino1Y = calculateSortinoRatio(historicalData1Year, riskFreeRate / 100)
    if (sortino1Y !== null) {
      metrics.sortinoRatio1Year = sortino1Y
    }
  }

  // 3-Year Metrics
  if (historicalData3Year && historicalData3Year.length > 0) {
    // Beta 3Y
    if (benchmarkData && benchmarkData.length > 0) {
      const beta3Y = calculateBeta(historicalData3Year, benchmarkData)
      if (beta3Y !== null) {
        metrics.beta3Year = beta3Y
      }
    }

    // Sharpe 3Y
    const sharpe3Y = calculateSharpeRatio(historicalData3Year, riskFreeRate / 100)
    if (sharpe3Y !== null) {
      metrics.sharpeRatio3Year = sharpe3Y
    }

    // Sortino 3Y
    const sortino3Y = calculateSortinoRatio(historicalData3Year, riskFreeRate / 100)
    if (sortino3Y !== null) {
      metrics.sortinoRatio3Year = sortino3Y
    }

    // Max Drawdown 3Y
    const maxDD3Y = calculateMaxDrawdown(historicalData3Year)
    if (maxDD3Y !== null) {
      metrics.maxDrawdown3Year = maxDD3Y
    }
  }


  // Calculate Max Drawdown for all asset types (using full historical data)
  // Max Drawdown shows the worst peak-to-trough decline, so we want the full history
  const maxDrawdown = calculateMaxDrawdown(historicalData)
  if (maxDrawdown !== null) {
    metrics.maxDrawdown = maxDrawdown
  }

  // Calculate Seasonality for all asset types (using full historical data - all years)
  // Use historicalDataForSeasonality if provided (all years), otherwise use historicalData
  const dataForSeasonality = historicalDataForSeasonality && historicalDataForSeasonality.length > 0
    ? historicalDataForSeasonality
    : historicalData
  const monthlySeasonality = calculateMonthlySeasonality(dataForSeasonality)
  if (monthlySeasonality !== null) {
    metrics.monthlySeasonality = monthlySeasonality
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
  if (value === null || value === undefined) {
    return 'N/A'
  }

  const numValue = Number(value)
  if (isNaN(numValue)) {
    return 'N/A'
  }

  return `${numValue >= 0 ? '+' : ''}${numValue.toFixed(decimals)}%`
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
  if (value === null || value === undefined) {
    return 'N/A'
  }

  const numValue = Number(value)
  if (isNaN(numValue)) {
    return 'N/A'
  }

  // Handle PKR specially as it may not be recognized by Intl.NumberFormat in some environments
  if (currency === 'PKR') {
    return `Rs. ${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(numValue)}`
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(numValue)
  } catch (error) {
    // Fallback for unsupported currencies
    return `${currency} ${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(numValue)}`
  }
}

/**
 * Format a number to a compact string (e.g., 1.2M, 4.5B)
 * 
 * @param number - The number to format
 * @returns Formatted compact string
 */
export function formatCompactNumber(number: number | null | undefined): string {
  if (number === null || number === undefined || isNaN(number)) {
    return 'N/A'
  }
  return Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(number)
}
