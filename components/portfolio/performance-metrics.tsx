"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, TrendingUp, TrendingDown, Activity, Shield, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { formatCurrency, formatPercent } from "@/lib/portfolio/portfolio-utils"

interface PerformanceMetricsProps {
  currency?: string
  unified?: boolean
}

interface PerformanceData {
  cagr: number | null
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
        const history = historyData.history || []

        if (history.length < 2) {
          console.log('[Performance Metrics] Insufficient history data:', history.length)
          setLoading(false)
          return
        }

        // Sort by date ascending
        const sortedHistory = [...history].sort((a: any, b: any) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        )

        // Find first entry where portfolio value > 0 (for winning days calculation)
        const firstPositiveEntryIndex = sortedHistory.findIndex((entry: any) => {
          const value = entry?.invested ?? entry?.bookValue ?? 0
          return value > 0
        })
        
        // Calculate daily returns (only from when portfolio value > 0)
        // Exclude days with cash flows (deposits/withdrawals) to avoid inflating returns
        const dailyReturns: Array<{ date: string; return: number; value: number }> = []
        const startIndex = firstPositiveEntryIndex >= 0 ? firstPositiveEntryIndex : 0
        
        for (let i = startIndex + 1; i < sortedHistory.length; i++) {
          const prev = sortedHistory[i - 1]
          const curr = sortedHistory[i]
          const prevValue = prev.invested || 0
          const currValue = curr.invested || 0
          const currCashFlow = curr.cashFlow || 0
          
          // Skip days with cash flows (deposits/withdrawals) to avoid showing them as returns
          // Cash flows are tracked separately and shouldn't be counted as investment returns
          if (prevValue > 0 && Math.abs(currCashFlow) < 0.01) { // Use small epsilon to handle floating point
            const dailyReturn = ((currValue - prevValue) / prevValue) * 100
            dailyReturns.push({
              date: curr.date,
              return: dailyReturn,
              value: currValue - prevValue,
            })
          }
        }

        if (dailyReturns.length === 0) {
          setLoading(false)
          return
        }

        // Calculate CAGR
        // Standard approach: Annualize using actual time period (even if < 1 year)
        // Formula: CAGR = ((Ending Value / Beginning Value) ^ (1 / years)) - 1
        
        // Find first non-zero entry (portfolio might have started at 0)
        let firstEntry = sortedHistory.find((entry: any) => {
          const value = entry?.invested ?? entry?.bookValue ?? 0
          return value > 0
        })
        
        // If no non-zero entry found, can't calculate CAGR
        if (!firstEntry) {
          firstEntry = sortedHistory[0] // Fallback, but CAGR will be null if value is 0
        }
        
        const lastEntry = sortedHistory[sortedHistory.length - 1]
        const firstValue = firstEntry?.invested ?? firstEntry?.bookValue ?? 0
        const lastValue = lastEntry?.invested ?? lastEntry?.bookValue ?? 0
        const firstDateStr = firstEntry?.date
        const lastDateStr = lastEntry?.date
        
        let cagr: number | null = null
        
        // Only calculate CAGR if we have valid start and end values (both > 0)
        if (firstDateStr && lastDateStr && firstValue > 0 && lastValue > 0) {
          try {
            // Parse dates - handle both YYYY-MM-DD and ISO format
            const firstDate = firstDateStr.includes('T') 
              ? new Date(firstDateStr) 
              : new Date(firstDateStr + 'T00:00:00')
            const lastDate = lastDateStr.includes('T')
              ? new Date(lastDateStr)
              : new Date(lastDateStr + 'T00:00:00')
            
            // Validate dates
            if (isNaN(firstDate.getTime()) || isNaN(lastDate.getTime())) {
              console.warn('[Performance Metrics] Invalid dates:', { firstDateStr, lastDateStr })
              cagr = null
            } else {
              const timeDiff = lastDate.getTime() - firstDate.getTime()
              const years = timeDiff / (365.25 * 24 * 60 * 60 * 1000)
              
              // Calculate CAGR for any time period (standard annualization approach)
              // Minimum: at least 1 day of data (0.00274 years)
              if (years >= 0.00274 && !isNaN(years) && isFinite(years)) {
                const ratio = lastValue / firstValue
                if (ratio > 0 && isFinite(ratio)) {
                  const cagrValue = (Math.pow(ratio, 1 / years) - 1) * 100
                  // Validate result - cap extremely large values but allow reasonable ones
                  // For 0.16% return over 5 days, CAGR should be around 12-13% annualized
                  if (isNaN(cagrValue) || !isFinite(cagrValue)) {
                    cagr = null
                  } else if (cagrValue > 1000000) {
                    // Cap at 1,000,000% to avoid display issues
                    cagr = null
                  } else {
                    cagr = cagrValue
                  }
                }
              }
            }
          } catch (error) {
            console.error('[Performance Metrics] Error calculating CAGR:', error, {
              firstValue,
              lastValue,
              firstDateStr,
              lastDateStr
            })
            cagr = null
          }
        } else {
          console.warn('[Performance Metrics] Missing data for CAGR:', {
            hasFirstDate: !!firstDateStr,
            hasLastDate: !!lastDateStr,
            firstValue,
            lastValue,
            firstEntry,
            lastEntry
          })
        }

        // Calculate Max Drawdown
        let maxDrawdown: number | null = null
        let peak = sortedHistory[0].invested || 0
        let maxDD = 0

        for (let i = 1; i < sortedHistory.length; i++) {
          const value = sortedHistory[i].invested || 0
          if (value > peak) {
            peak = value
          }
          const drawdown = peak > 0 ? ((value - peak) / peak) * 100 : 0
          if (drawdown < maxDD) {
            maxDD = drawdown
          }
        }
        maxDrawdown = maxDD

        // Calculate 30-day Volatility (lowered minimum to 5 days for portfolios with less data)
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

        // Calculate Sharpe Ratio (annualized, assuming 2.5% risk-free rate)
        // Lowered minimum to 5 days for portfolios with less data (same as volatility and beta)
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

        // Calculate Beta (against benchmark)
        let beta: number | null = null
        try {
          // Determine benchmark based on currency
          const benchmarkSymbol = currency === 'PKR' ? 'KSE100' : 'SPX500'
          const benchmarkAssetType = currency === 'PKR' ? 'kse100' : 'spx500'
          
          // Fetch benchmark data for the same period
          const benchmarkRes = await fetch(
            `/api/historical-data?assetType=${benchmarkAssetType}&symbol=${benchmarkSymbol}&startDate=${sortedHistory[0].date}&endDate=${sortedHistory[sortedHistory.length - 1].date}`
          )
          
          if (benchmarkRes.ok) {
            const benchmarkData = await benchmarkRes.json()
            const benchmarkPrices = (benchmarkData.data || []).sort((a: any, b: any) => 
              new Date(a.date).getTime() - new Date(b.date).getTime()
            )

            // Lowered minimum to 5 days for portfolios with less data (same as volatility)
            if (benchmarkPrices.length >= 5) {
              // Calculate portfolio and benchmark returns
              const portfolioReturns: number[] = []
              const benchmarkReturns: number[] = []
              
              // Align dates
              const portfolioMap = new Map(sortedHistory.map((h: any) => [h.date, h.invested]))
              const benchmarkMap = new Map(benchmarkPrices.map((p: any) => [p.date, p.close]))
              
              const commonDates = Array.from(portfolioMap.keys()).filter(date => benchmarkMap.has(date))
              commonDates.sort()

              for (let i = 1; i < commonDates.length; i++) {
                const prevDate = commonDates[i - 1]
                const currDate = commonDates[i]
                const prevPortfolio = portfolioMap.get(prevDate) || 0
                const currPortfolio = portfolioMap.get(currDate) || 0
                const prevBenchmark = benchmarkMap.get(prevDate) || 0
                const currBenchmark = benchmarkMap.get(currDate) || 0

                if (prevPortfolio > 0 && prevBenchmark > 0) {
                  portfolioReturns.push((currPortfolio - prevPortfolio) / prevPortfolio)
                  benchmarkReturns.push((currBenchmark - prevBenchmark) / prevBenchmark)
                }
              }

              // Lowered minimum to 5 aligned returns for portfolios with less data
              if (portfolioReturns.length >= 5) {
                // Calculate covariance and variance
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
          console.error('Error calculating beta:', error)
        }

        // Performance Highlights
        const last30DaysReturns = dailyReturns.slice(-30)
        const last90DaysReturns = dailyReturns.slice(-90)

        // Best Day
        const bestDay = dailyReturns.length > 0 ? dailyReturns.reduce((best, current) => 
          current.value > (best?.value || -Infinity) ? current : best,
          dailyReturns[0]
        ) : null

        // Worst Day
        const worstDay = dailyReturns.length > 0 ? dailyReturns.reduce((worst, current) => 
          current.value < (worst?.value || Infinity) ? current : worst,
          dailyReturns[0]
        ) : null

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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {/* CAGR */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-muted-foreground">CAGR</span>
              </div>
              <div className={`text-xl sm:text-2xl font-bold truncate ${metrics.cagr !== null && metrics.cagr >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {metrics.cagr !== null ? formatPercent(metrics.cagr, 2) : '—'}
              </div>
              <p className="text-xs text-muted-foreground">Compound Annual Growth Rate</p>
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

