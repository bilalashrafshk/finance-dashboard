"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, TrendingUp, TrendingDown, Activity, Shield, ArrowUpRight, ArrowDownRight, Wallet } from "lucide-react"
import {
  formatCurrency,
  formatPercent,
  calculateAdjustedPortfolioHistory,
  calculateAdjustedDailyReturns,
  calculateXIRR,
  type PortfolioHistoryEntry,
  type AdjustedPortfolioHistoryEntry,
  type AdjustedDailyReturn
} from "@/lib/portfolio/portfolio-utils"

interface PerformanceMetricsProps {
  currency?: string
  unified?: boolean
}

interface PerformanceData {
  cagr: number | null
  xirr: number | null
  maxDrawdown: number | null
  volatility: number | null
  sharpeRatio: number | null
  beta: number | null
  bestDay: { value: number; date: string } | null
  worstDay: { value: number; date: string } | null
  winningDays: number | null
  avgDailyReturn: number | null
}

export function PerformanceMetrics({ currency = 'USD', unified = false }: PerformanceMetricsProps) {
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<PerformanceData>({
    cagr: null,
    xirr: null,
    maxDrawdown: null,
    volatility: null,
    sharpeRatio: null,
    beta: null,
    bestDay: null,
    worstDay: null,
    winningDays: null,
    avgDailyReturn: null,
  })

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true)
      try {
        const token = localStorage.getItem('auth_token')
        if (!token) {
          setLoading(false)
          return
        }

        // Fetch portfolio history (get enough data for calculations)
        const unifiedParam = unified ? '&unified=true' : ''
        const historyRes = await fetch(`/api/user/portfolio/history?days=ALL&currency=${currency}${unifiedParam}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (!historyRes.ok) {
          setLoading(false)
          return
        }

        const historyData = await historyRes.json()
        const rawHistory: PortfolioHistoryEntry[] = historyData.history || []

        if (rawHistory.length < 2) {
          console.log('[Performance Metrics] Insufficient history data:', rawHistory.length)
          setLoading(false)
          return
        }

        // Use centralized function to calculate adjusted history (accounting for cash flows)
        const adjustedHistory = calculateAdjustedPortfolioHistory(rawHistory)

        if (adjustedHistory.length < 2) {
          console.log('[Performance Metrics] Insufficient adjusted history data')
          setLoading(false)
          return
        }

        // Use centralized function to calculate adjusted daily returns
        const dailyReturns = calculateAdjustedDailyReturns(adjustedHistory, rawHistory)

        if (dailyReturns.length === 0) {
          console.log('[Performance Metrics] No daily returns calculated')
          setLoading(false)
          return
        }

        // Calculate CAGR using adjusted values
        // Formula: CAGR = ((Adjusted Ending Value / Adjusted Beginning Value) ^ (1 / years)) - 1
        let cagr: number | null = null

        // Find first non-zero adjusted entry
        const firstAdjustedEntry = adjustedHistory.find(entry => entry.adjustedValue > 0)
        const lastAdjustedEntry = adjustedHistory[adjustedHistory.length - 1]

        if (firstAdjustedEntry && lastAdjustedEntry) {
          const firstValue = firstAdjustedEntry.adjustedValue
          const lastValue = lastAdjustedEntry.adjustedValue
          const firstDateStr = firstAdjustedEntry.date
          const lastDateStr = lastAdjustedEntry.date

          if (firstValue > 0 && lastValue > 0 && firstDateStr && lastDateStr) {
            try {
              // Parse dates - handle both YYYY-MM-DD and ISO format
              const firstDate = firstDateStr.includes('T')
                ? new Date(firstDateStr)
                : new Date(firstDateStr + 'T00:00:00')
              const lastDate = lastDateStr.includes('T')
                ? new Date(lastDateStr)
                : new Date(lastDateStr + 'T00:00:00')

              // Validate dates
              if (!isNaN(firstDate.getTime()) && !isNaN(lastDate.getTime())) {
                const timeDiff = lastDate.getTime() - firstDate.getTime()
                const years = timeDiff / (365.25 * 24 * 60 * 60 * 1000)

                // Calculate CAGR for any time period (standard annualization approach)
                // Minimum: at least 1 day of data (0.00274 years)
                if (years >= 0.00274 && !isNaN(years) && isFinite(years)) {
                  const ratio = lastValue / firstValue
                  if (ratio > 0 && isFinite(ratio)) {
                    const cagrValue = (Math.pow(ratio, 1 / years) - 1) * 100
                    // Validate result
                    if (!isNaN(cagrValue) && isFinite(cagrValue) && cagrValue <= 1000000) {
                      cagr = cagrValue
                    }
                  }
                }
              }
            } catch (error) {
              console.error('[Performance Metrics] Error calculating CAGR:', error)
              cagr = null
            }
          }
        }

        // Calculate XIRR (Investor Return)
        let xirr: number | null = null
        try {
          // Construct cash flows from history
          // Inputs: deposits (-) and withdrawals (+)
          // NOTE: cashFlow in history is Net Flow (Dep - With). 
          // If Net Flow > 0 (Deposit), we need NEGATIVE amount for XIRR.
          // If Net Flow < 0 (Withdrawal), we need POSITIVE amount for XIRR.
          // So Amount = -cashFlow

          const cashFlows = rawHistory
            .filter(h => h.cashFlow && Math.abs(h.cashFlow) > 0.001)
            .map(h => ({
              amount: -(h.cashFlow || 0),
              date: h.date
            }))

          // Add Current Value as Final Positive Flow
          const lastEntry = rawHistory[rawHistory.length - 1]
          if (lastEntry) {
            cashFlows.push({
              amount: lastEntry.invested,
              date: new Date().toISOString().split('T')[0] // Today or last entry date
            })
          }

          if (cashFlows.length >= 2) {
            const xirrVal = calculateXIRR(cashFlows)
            if (xirrVal !== null) {
              xirr = xirrVal * 100
            }
          }
        } catch (error) {
          console.error('[Performance Metrics] Error calculating XIRR:', error)
        }

        // Calculate Max Drawdown using adjusted values
        let maxDrawdown: number | null = null
        let peak: number | null = null
        let maxDD = 0

        for (const entry of adjustedHistory) {
          if (entry.adjustedValue > 0) {
            if (peak === null || entry.adjustedValue > peak) {
              peak = entry.adjustedValue
            }
            const drawdown = peak > 0 ? ((entry.adjustedValue - peak) / peak) * 100 : 0
            if (drawdown < maxDD) {
              maxDD = drawdown
            }
          }
        }
        maxDrawdown = maxDD

        // Calculate 30-day Volatility using adjusted returns
        const last30Days = dailyReturns.slice(-30)
        let volatility: number | null = null
        if (last30Days.length >= 5) {
          const returns = last30Days.map(r => r.return / 100) // Convert to decimal
          const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length
          const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length
          const stdDev = Math.sqrt(variance)
          // Annualize: multiply by sqrt(252 trading days)
          volatility = stdDev * Math.sqrt(252) * 100
        }

        // Calculate Sharpe Ratio using adjusted returns
        let sharpeRatio: number | null = null
        if (dailyReturns.length >= 5) {
          const returns = dailyReturns.map(r => r.return / 100)
          const meanDaily = returns.reduce((sum, r) => sum + r, 0) / returns.length
          const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanDaily, 2), 0) / returns.length
          const stdDev = Math.sqrt(variance)

          if (stdDev > 0) {
            const annualizedReturn = meanDaily * 252 * 100 // Convert to percentage
            const annualizedStdDev = stdDev * Math.sqrt(252) * 100
            const riskFreeRate = 2.5 // 2.5% annual risk-free rate
            sharpeRatio = (annualizedReturn - riskFreeRate) / annualizedStdDev
          }
        }

        // Calculate Beta using adjusted returns
        let beta: number | null = null
        try {
          // Determine benchmark based on currency
          const benchmarkSymbol = currency === 'PKR' ? 'KSE100' : 'SPX500'
          const benchmarkAssetType = currency === 'PKR' ? 'kse100' : 'spx500'

          // Fetch benchmark data for the same period
          const firstDate = adjustedHistory[0].date
          const lastDate = adjustedHistory[adjustedHistory.length - 1].date

          const benchmarkRes = await fetch(
            `/api/historical-data?assetType=${benchmarkAssetType}&symbol=${benchmarkSymbol}&startDate=${firstDate}&endDate=${lastDate}`
          )

          if (benchmarkRes.ok) {
            const benchmarkData = await benchmarkRes.json()
            const benchmarkPrices = (benchmarkData.data || []).sort((a: any, b: any) =>
              new Date(a.date).getTime() - new Date(b.date).getTime()
            )

            if (benchmarkPrices.length >= 5) {
              // Create maps for aligned date matching
              const adjustedValueMap = new Map(adjustedHistory.map(h => [h.date, h.adjustedValue]))
              const benchmarkMap = new Map(benchmarkPrices.map((p: any) => [p.date, p.close]))

              // Get all dates that exist in both adjusted history and benchmark
              const commonDates = Array.from(adjustedValueMap.keys())
                .filter(date => benchmarkMap.has(date))
                .sort()

              // Calculate returns for consecutive dates (matching portfolio and benchmark)
              const portfolioReturns: number[] = []
              const benchmarkReturns: number[] = []

              for (let i = 1; i < commonDates.length; i++) {
                const prevDate = commonDates[i - 1]
                const currDate = commonDates[i]

                const prevAdjustedValue = adjustedValueMap.get(prevDate) || 0
                const currAdjustedValue = adjustedValueMap.get(currDate) || 0
                const prevBenchmark = benchmarkMap.get(prevDate) || 0
                const currBenchmark = benchmarkMap.get(currDate) || 0

                // Calculate returns from adjusted values (accounting for cash flows)
                if (prevAdjustedValue > 0 && currAdjustedValue > 0 && prevBenchmark > 0 && currBenchmark > 0) {
                  // Portfolio return from adjusted values (already accounts for cash flows)
                  const portfolioReturn = (currAdjustedValue - prevAdjustedValue) / prevAdjustedValue

                  // Benchmark return
                  const benchmarkReturn = (currBenchmark - prevBenchmark) / prevBenchmark

                  portfolioReturns.push(portfolioReturn)
                  benchmarkReturns.push(benchmarkReturn)
                }
              }

              // Calculate beta if we have enough aligned returns
              if (portfolioReturns.length >= 5) {
                const portfolioMean = portfolioReturns.reduce((sum, r) => sum + r, 0) / portfolioReturns.length
                const benchmarkMean = benchmarkReturns.reduce((sum, r) => sum + r, 0) / benchmarkReturns.length

                let covariance = 0
                let benchmarkVariance = 0

                for (let i = 0; i < portfolioReturns.length; i++) {
                  covariance += (portfolioReturns[i] - portfolioMean) * (benchmarkReturns[i] - benchmarkMean)
                  benchmarkVariance += Math.pow(benchmarkReturns[i] - benchmarkMean, 2)
                }

                covariance = covariance / (portfolioReturns.length - 1)
                benchmarkVariance = benchmarkVariance / (portfolioReturns.length - 1)

                if (benchmarkVariance > 0) {
                  beta = covariance / benchmarkVariance
                }
              }
            }
          }
        } catch (error) {
          console.error('[Performance Metrics] Error calculating beta:', error)
        }

        // Performance Highlights using adjusted returns
        const last30DaysReturns = dailyReturns.slice(-30)
        const last90DaysReturns = dailyReturns.slice(-90)

        // Calculate dollar values for best/worst day
        // Create a map of adjusted values by date for easy lookup
        const adjustedValueMap = new Map(adjustedHistory.map(h => [h.date, h.adjustedValue]))

        // Best Day - find the day with highest return percentage, then calculate dollar change
        const bestDayReturn = dailyReturns.length > 0 ? dailyReturns.reduce((best, current) =>
          current.return > (best?.return || -Infinity) ? current : best,
          dailyReturns[0]
        ) : null

        // Worst Day - find the day with lowest return percentage, then calculate dollar change
        const worstDayReturn = dailyReturns.length > 0 ? dailyReturns.reduce((worst, current) =>
          current.return < (worst?.return || Infinity) ? current : worst,
          dailyReturns[0]
        ) : null

        // Calculate dollar values for best/worst day
        let bestDay: { value: number; date: string } | null = null
        let worstDay: { value: number; date: string } | null = null

        if (bestDayReturn) {
          // Find previous day's adjusted value from adjusted history
          const currentIndex = adjustedHistory.findIndex(h => h.date === bestDayReturn.date)
          if (currentIndex > 0) {
            const prevAdjustedValue = adjustedHistory[currentIndex - 1].adjustedValue
            const dollarChange = bestDayReturn.adjustedValue - prevAdjustedValue
            bestDay = { value: dollarChange, date: bestDayReturn.date }
          }
        }

        if (worstDayReturn) {
          // Find previous day's adjusted value from adjusted history
          const currentIndex = adjustedHistory.findIndex(h => h.date === worstDayReturn.date)
          if (currentIndex > 0) {
            const prevAdjustedValue = adjustedHistory[currentIndex - 1].adjustedValue
            const dollarChange = worstDayReturn.adjustedValue - prevAdjustedValue
            worstDay = { value: dollarChange, date: worstDayReturn.date }
          }
        }

        // Winning Days (last 30 days)
        const winningDays = last30DaysReturns.length > 0
          ? (last30DaysReturns.filter(r => r.return > 0).length / last30DaysReturns.length) * 100
          : null

        // Avg Daily Return (last 90 days)
        const avgDailyReturn = last90DaysReturns.length > 0
          ? last90DaysReturns.reduce((sum, r) => sum + r.return, 0) / last90DaysReturns.length
          : null

        setMetrics({
          cagr,
          xirr,
          maxDrawdown,
          volatility,
          sharpeRatio,
          beta,
          bestDay: bestDay ? { value: bestDay.value, date: bestDay.date } : null,
          worstDay: worstDay ? { value: worstDay.value, date: worstDay.date } : null,
          winningDays,
          avgDailyReturn,
        })
      } catch (error) {
        console.error('Error calculating performance metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [currency, unified])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
          <CardDescription>Key risk and return indicators</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* CAGR */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-muted-foreground">CAGR</span>
              </div>
              <div className={`text-xl sm:text-2xl font-bold truncate ${metrics.cagr !== null && metrics.cagr >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {metrics.cagr !== null ? formatPercent(metrics.cagr, 2) : '—'}
              </div>
              <p className="text-xs text-muted-foreground">Portfolio Return (TWR)</p>
            </div>

            {/* Investor Return (IRR) */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium text-muted-foreground">Investor Return</span>
              </div>
              <div className={`text-xl sm:text-2xl font-bold truncate ${metrics.xirr !== null && metrics.xirr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {metrics.xirr !== null ? formatPercent(metrics.xirr, 2) : '—'}
              </div>
              <p className="text-xs text-muted-foreground">Money-weighted (XIRR)</p>
            </div>

            {/* Max Drawdown */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-muted-foreground">Max Drawdown</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold truncate text-red-600 dark:text-red-400">
                {metrics.maxDrawdown !== null ? formatPercent(metrics.maxDrawdown) : '—'}
              </div>
              <p className="text-xs text-muted-foreground">Largest peak-to-trough decline</p>
            </div>

            {/* Volatility */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-muted-foreground">Volatility</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold truncate text-blue-600 dark:text-blue-400">
                {metrics.volatility !== null ? formatPercent(metrics.volatility) : '—'}
              </div>
              <p className="text-xs text-muted-foreground">30-day price volatility</p>
            </div>

            {/* Sharpe Ratio */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-muted-foreground">Sharpe Ratio</span>
              </div>
              <div className={`text-xl sm:text-2xl font-bold truncate ${metrics.sharpeRatio !== null && metrics.sharpeRatio >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {metrics.sharpeRatio !== null ? metrics.sharpeRatio.toFixed(2) : '—'}
              </div>
              <p className="text-xs text-muted-foreground">Risk-adjusted return</p>
            </div>

            {/* Beta */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-medium text-muted-foreground">Beta</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold truncate text-purple-600 dark:text-purple-400">
                {metrics.beta !== null ? metrics.beta.toFixed(2) : '—'}
              </div>
              <p className="text-xs text-muted-foreground">
                {currency === 'PKR' ? 'vs KSE 100' : 'vs S&P 500'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Highlights */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Highlights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Best Day */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Best Day</div>
              {metrics.bestDay ? (
                <>
                  <div className="text-xl font-bold text-green-600 dark:text-green-400 flex items-center gap-1">
                    <ArrowUpRight className="h-4 w-4" />
                    {formatCurrency(metrics.bestDay.value, currency)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(metrics.bestDay.date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </p>
                </>
              ) : (
                <div className="text-xl font-bold text-muted-foreground">—</div>
              )}
            </div>

            {/* Worst Day */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Worst Day</div>
              {metrics.worstDay ? (
                <>
                  <div className="text-xl font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                    <ArrowDownRight className="h-4 w-4" />
                    {formatCurrency(metrics.worstDay.value, currency)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(metrics.worstDay.date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </p>
                </>
              ) : (
                <div className="text-xl font-bold text-muted-foreground">—</div>
              )}
            </div>

            {/* Winning Days */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Winning Days</div>
              <div className={`text-xl font-bold ${metrics.winningDays !== null && metrics.winningDays >= 50 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                {metrics.winningDays !== null ? `${metrics.winningDays.toFixed(0)}%` : '—'}
              </div>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </div>

            {/* Avg Daily Return */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Avg Daily Return</div>
              <div className={`text-xl font-bold flex items-center gap-1 ${metrics.avgDailyReturn !== null && metrics.avgDailyReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {metrics.avgDailyReturn !== null ? (
                  <>
                    {metrics.avgDailyReturn >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    {formatPercent(metrics.avgDailyReturn)}
                  </>
                ) : (
                  '—'
                )}
              </div>
              <p className="text-xs text-muted-foreground">Last 90 days</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


