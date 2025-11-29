"use client"

import { useState, useEffect, useMemo } from "react"
import { useTheme } from "next-themes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Line } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js"
import type { Holding } from "@/lib/portfolio/types"
import type { StockAnalysisDataPoint } from "@/lib/portfolio/stockanalysis-api"
import { getThemeColors } from "@/lib/charts/theme-colors"
import { createYAxisScaleConfig } from "@/lib/charts/portfolio-chart-utils"
import { formatCurrency, calculatePortfolioValueForDate } from "@/lib/portfolio/portfolio-utils"
import { Loader2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

ChartJS.register(CategoryScale, LinearScale, LogarithmicScale, PointElement, LineElement, Tooltip, Legend, Filler)

interface USEquityPortfolioChartProps {
  holdings: Holding[]
  currency: string
}

type ChartPeriod = '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | 'ALL'

export function USEquityPortfolioChart({ holdings, currency }: USEquityPortfolioChartProps) {
  const { theme } = useTheme()
  const colors = getThemeColors()
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1Y')
  const [showSPX500Comparison, setShowSPX500Comparison] = useState(false)
  const [useLogScale, setUseLogScale] = useState(false)
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<{
    labels: string[]
    datasets: Array<{
      label: string
      data: number[]
      borderColor: string
      backgroundColor: string
      fill: boolean
    }>
  } | null>(null)
  const [portfolioStartValue, setPortfolioStartValue] = useState<number>(1)

  const usEquityHoldings = useMemo(() => {
    return holdings.filter(h => h.assetType === 'us-equity')
  }, [holdings])

  useEffect(() => {
    if (usEquityHoldings.length === 0) {
      setLoading(false)
      setChartData(null)
      return
    }

    const loadChartData = async () => {
      setLoading(true)
      try {
        // Fetch historical data for all US equity holdings in parallel (optimized)
        const historicalDataMap = new Map<string, StockAnalysisDataPoint[]>()
        
        // Fetch all holdings in parallel instead of sequentially
        const fetchPromises = usEquityHoldings.map(async (holding) => {
          try {
            const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
            const response = await deduplicatedFetch(`/api/historical-data?assetType=us-equity&symbol=${encodeURIComponent(holding.symbol)}&market=US`)
            if (response.ok) {
              const apiData = await response.json()
              const dbRecords = apiData.data || []
              if (dbRecords && dbRecords.length > 0) {
                // Convert database records to StockAnalysis format
                const { dbRecordToStockAnalysis } = await import('@/lib/portfolio/db-to-chart-format')
                const data: StockAnalysisDataPoint[] = dbRecords.map(dbRecordToStockAnalysis)
                return { symbol: holding.symbol, data }
              }
            }
          } catch (error) {
            console.error(`Error fetching historical data for ${holding.symbol}:`, error)
          }
          return null
        })
        
        // Wait for all fetches to complete
        const results = await Promise.all(fetchPromises)
        results.forEach(result => {
          if (result) {
            historicalDataMap.set(result.symbol, result.data)
          }
        })
        
        // If no historical data found, don't render chart
        if (historicalDataMap.size === 0) {
          setChartData(null)
          setLoading(false)
          return
        }

        // Find the earliest purchase date among all holdings
        const purchaseDates = usEquityHoldings.map(h => new Date(h.purchaseDate))
        const earliestPurchaseDate = new Date(Math.min(...purchaseDates.map(d => d.getTime())))
        
        // Calculate date range based on period
        const today = new Date()
        let periodStartDate: Date
        
        switch (chartPeriod) {
          case '1M':
            periodStartDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
            break
          case '3M':
            periodStartDate = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate())
            break
          case '6M':
            periodStartDate = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate())
            break
          case '1Y':
            periodStartDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
            break
          case '2Y':
            periodStartDate = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate())
            break
          case '5Y':
            periodStartDate = new Date(today.getFullYear() - 5, today.getMonth(), today.getDate())
            break
          case 'ALL':
            periodStartDate = earliestPurchaseDate // Start from earliest purchase
            break
        }
        
        // The actual start date should be the later of: period start or earliest purchase date
        // We don't want to show portfolio value before the user owned any stocks
        const startDate = periodStartDate > earliestPurchaseDate ? periodStartDate : earliestPurchaseDate

        // Get all unique dates from all holdings, but only include dates on or after the earliest purchase date
        const allDates = new Set<string>()
        historicalDataMap.forEach(data => {
          data.forEach(point => {
            const pointDate = new Date(point.t)
            // Only include dates that are:
            // 1. On or after the period start date (if period is selected)
            // 2. On or after the earliest purchase date (user didn't own stocks before this)
            if (pointDate >= startDate && pointDate >= earliestPurchaseDate) {
              allDates.add(point.t)
            }
          })
        })

        // Sort dates chronologically (oldest first)
        const sortedDates = Array.from(allDates).sort((a, b) => a.localeCompare(b))
        
        // Ensure we start from at least the earliest purchase date
        if (sortedDates.length > 0 && sortedDates[0] < earliestPurchaseDate.toISOString().split('T')[0]) {
          // Filter out any dates before earliest purchase
          const filteredDates = sortedDates.filter(date => date >= earliestPurchaseDate.toISOString().split('T')[0])
          sortedDates.length = 0
          sortedDates.push(...filteredDates)
        }

        // Prepare historical price map for centralized calculation
        // US equity data uses 't' for date and 'c' for close price
        const historicalPriceMap = new Map<string, { date: string; price: number }[]>()
        historicalDataMap.forEach((data, symbol) => {
          historicalPriceMap.set(symbol, data.map(d => ({ date: d.t, price: d.c })))
        })
        
        // Calculate portfolio value for each date using centralized function
        const portfolioValues: number[] = []
        for (const date of sortedDates) {
          const value = calculatePortfolioValueForDate(usEquityHoldings, date, historicalPriceMap)
          portfolioValues.push(value)
        }

        // Normalize portfolio values to percentage change from start (for comparison with S&P 500)
        const startValue = portfolioValues[0] || 1
        setPortfolioStartValue(startValue)
        const normalizedPortfolioValues = portfolioValues.map(value => (value / startValue) * 100)

        // Fetch S&P 500 data if comparison is enabled (using same approach as asset screener)
        let spx500Data: number[] | null = null
        let alignedDates = sortedDates
        let alignedPortfolioValues = showSPX500Comparison ? normalizedPortfolioValues : portfolioValues
        
        if (showSPX500Comparison) {
          try {
            // Fetch cash flows from portfolio history API to adjust benchmark
            const token = localStorage.getItem('auth_token')
            let cashFlowsByDate = new Map<string, number>()
            
            try {
              const historyRes = await fetch(`/api/user/portfolio/history?days=ALL&currency=${currency}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
              })
              if (historyRes.ok) {
                const historyData = await historyRes.json()
                const history = historyData.history || []
                // Extract cash flows by date
                history.forEach((point: any) => {
                  if (point.cashFlow && Math.abs(point.cashFlow) > 0.01) {
                    cashFlowsByDate.set(point.date, point.cashFlow)
                  }
                })
              }
            } catch (error) {
              console.error('Error fetching cash flows for benchmark adjustment:', error)
            }

            // Use same simple approach as asset screener - just fetch from API
            const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
            const comparisonResponse = await deduplicatedFetch(`/api/historical-data?assetType=spx500&symbol=SPX500`)
            
            if (comparisonResponse.ok) {
              const comparisonResponseData = await comparisonResponse.json()
              if (comparisonResponseData.data && Array.isArray(comparisonResponseData.data)) {
                // Convert to simple format with date and close price
                const spx500Historical = comparisonResponseData.data
                  .map((record: any) => ({
                    date: record.date,
                    close: parseFloat(record.close)
                  }))
                  .filter((point: any) => !isNaN(point.close))
                  .sort((a: any, b: any) => a.date.localeCompare(b.date))
                
                if (spx500Historical.length > 0) {
                  // Map S&P 500 data to our date range
                  const spx500Mapped: (number | null)[] = sortedDates.map(date => {
                    // Find exact match or closest before
                    let spxPoint = spx500Historical.find((d: any) => d.date === date)
                    
                    if (!spxPoint) {
                      const beforeDates = spx500Historical.filter((d: any) => d.date <= date)
                      if (beforeDates.length > 0) {
                        spxPoint = beforeDates.sort((a: any, b: any) => b.date.localeCompare(a.date))[0]
                      }
                    }
                    
                    return spxPoint ? spxPoint.close : null
                  })
                  
                  // Only use data points that have values for both portfolio and S&P 500
                  const validSpxData: number[] = []
                  const validPortfolioValues: number[] = []
                  const validDates: string[] = []
                  
                  for (let i = 0; i < sortedDates.length; i++) {
                    if (spx500Mapped[i] !== null && normalizedPortfolioValues[i] !== undefined) {
                      validSpxData.push(spx500Mapped[i]!)
                      validPortfolioValues.push(normalizedPortfolioValues[i])
                      validDates.push(sortedDates[i])
                    }
                  }
                  
                  if (validSpxData.length > 0 && validSpxData[0] > 0) {
                    // Calculate benchmark value adjusted for cash flows
                    // Standard approach: When cash is deposited, "buy" benchmark shares; when withdrawn, "sell" shares
                    const benchmarkValues: number[] = []
                    let benchmarkShares = 0 // Track shares of benchmark owned
                    const startDate = validDates[0]
                    const startSpxPrice = validSpxData[0]
                    const startDateIndex = sortedDates.indexOf(startDate)
                    const startPortfolioValue = startDateIndex >= 0 ? portfolioValues[startDateIndex] : portfolioValues[0]
                    
                    // Initial investment: calculate how many benchmark shares the initial portfolio value would buy
                    if (startPortfolioValue > 0 && startSpxPrice > 0) {
                      benchmarkShares = startPortfolioValue / startSpxPrice
                    }

                    for (let i = 0; i < validDates.length; i++) {
                      const date = validDates[i]
                      const spxPrice = validSpxData[i]
                      
                      if (spxPrice <= 0) {
                        benchmarkValues.push(0)
                        continue
                      }

                      // Check if there's a cash flow on this date
                      // Note: Cash flows only come from 'add' (deposit) or 'remove' (withdrawal) transactions
                      // Selling assets ('sell') doesn't create a cash flow unless the proceeds are withdrawn
                      // This ensures fair comparison: internal rebalancing doesn't affect benchmark, only external cash flows do
                      const cashFlow = cashFlowsByDate.get(date) || 0
                      
                      if (Math.abs(cashFlow) > 0.01) {
                        // Adjust benchmark shares based on cash flow
                        // Positive cash flow (deposit) = buy more shares
                        // Negative cash flow (withdrawal) = sell shares proportionally
                        // This handles trimming: if you sell assets and withdraw cash, benchmark also "sells" proportionally
                        const sharesToAdd = cashFlow / spxPrice
                        benchmarkShares += sharesToAdd
                      }

                      // Calculate current benchmark value
                      const benchmarkValue = benchmarkShares * spxPrice
                      benchmarkValues.push(benchmarkValue)
                    }

                    // Normalize benchmark to percentage change from start (same as portfolio)
                    if (benchmarkValues.length > 0 && benchmarkValues[0] > 0) {
                      const benchmarkStartValue = benchmarkValues[0]
                      spx500Data = benchmarkValues.map(value => (value / benchmarkStartValue) * 100)
                      
                      // Use aligned data
                      alignedDates = validDates
                      alignedPortfolioValues = validPortfolioValues
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error fetching S&P 500 data:', error)
          }
        }

        // Create datasets
        const datasets: Array<{
          label: string
          data: number[]
          borderColor: string
          backgroundColor: string
          fill: boolean
        }> = [
          {
            label: 'Portfolio Value',
            data: alignedPortfolioValues,
            borderColor: colors.primary || '#3b82f6',
            backgroundColor: (colors.primary || '#3b82f6') + '20',
            fill: true,
          },
        ]

        // Add S&P 500 comparison line if enabled and data is available
        if (showSPX500Comparison && spx500Data && spx500Data.length > 0) {
          datasets.push({
            label: 'S&P 500 Index',
            data: spx500Data,
            borderColor: '#a855f7', // Purple for S&P 500
            backgroundColor: 'transparent',
            fill: false,
            borderDash: [5, 5], // Dashed line for comparison
          })
        }

        // Create chart data
        setChartData({
          labels: alignedDates.map(date => {
            const d = new Date(date)
            // Show year for periods that span multiple years (1Y, 2Y, 5Y, ALL)
            const showYear = chartPeriod === 'ALL' || chartPeriod === '1Y' || chartPeriod === '2Y' || chartPeriod === '5Y'
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: showYear ? 'numeric' : undefined })
          }),
          datasets,
        })
      } catch (error) {
        console.error('Error loading chart data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadChartData()
    // Re-run when holdings, period, comparison toggle, or log scale changes
    // When comparison toggle changes, we need to re-process the data (but not re-fetch from API)
  }, [usEquityHoldings, chartPeriod, showSPX500Comparison, useLogScale])

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: {
          color: colors.foreground,
        },
      },
      tooltip: {
        backgroundColor: colors.background,
        titleColor: colors.foreground,
        bodyColor: colors.foreground,
        borderColor: colors.border,
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: any) => {
            const value = context.parsed.y || 0
            const datasetLabel = context.dataset.label || ''
            
            if (showSPX500Comparison) {
              // Show percentage change when comparing
              if (datasetLabel === 'S&P 500 Index') {
                return `${datasetLabel}: ${value.toFixed(2)}%`
              } else {
                // For portfolio, show both percentage and actual value
                const actualValue = (value / 100) * portfolioStartValue
                return `${datasetLabel}: ${value.toFixed(2)}% (${formatCurrency(actualValue, currency)})`
              }
            } else {
              return `${datasetLabel}: ${formatCurrency(value, currency)}`
            }
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
          color: colors.grid,
        },
        ticks: {
          color: colors.foreground,
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: createYAxisScaleConfig({
        useLogScale,
        isPercentage: showSPX500Comparison,
        currency,
      }),
    },
  }), [colors, currency, showSPX500Comparison, portfolioStartValue, useLogScale])

  // Don't render anything if there are no US equity holdings
  if (usEquityHoldings.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle>US Equities Portfolio Performance</CardTitle>
            <CardDescription>Historical portfolio value over time</CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="spx500-comparison"
                checked={showSPX500Comparison}
                onCheckedChange={setShowSPX500Comparison}
              />
              <Label htmlFor="spx500-comparison" className="text-sm cursor-pointer">
                Compare with S&P 500
              </Label>
            </div>
            <Select value={chartPeriod} onValueChange={(value) => setChartPeriod(value as ChartPeriod)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1M">1 Month</SelectItem>
                <SelectItem value="3M">3 Months</SelectItem>
                <SelectItem value="6M">6 Months</SelectItem>
                <SelectItem value="1Y">1 Year</SelectItem>
                <SelectItem value="2Y">2 Years</SelectItem>
                <SelectItem value="5Y">5 Years</SelectItem>
                <SelectItem value="ALL">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4">
          <div className="flex flex-col items-start gap-2 pt-2">
            <div className="flex items-center gap-2">
              <Switch
                id="log-scale"
                checked={useLogScale}
                onCheckedChange={setUseLogScale}
              />
              <Label htmlFor="log-scale" className="text-sm cursor-pointer whitespace-nowrap">
                Log Scale
              </Label>
            </div>
          </div>
          <div className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : chartData ? (
              <div className="h-[400px]">
                <Line data={chartData} options={chartOptions} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                Unable to load chart data
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

