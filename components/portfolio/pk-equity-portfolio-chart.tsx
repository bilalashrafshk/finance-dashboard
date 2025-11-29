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
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { type InvestingHistoricalDataPoint } from "@/lib/portfolio/investing-client-api"
import { calculateDividendAdjustedPrices, normalizeToPercentage, normalizeOriginalPricesToPercentage } from "@/lib/asset-screener/dividend-adjusted-prices"
import type { PriceDataPoint } from "@/lib/asset-screener/metrics-calculations"
import { convertDividendToRupees, filterDividendsByPurchaseDate } from "@/lib/portfolio/dividend-utils"

ChartJS.register(CategoryScale, LinearScale, LogarithmicScale, PointElement, LineElement, Tooltip, Legend, Filler)

interface PKEquityPortfolioChartProps {
  holdings: Holding[]
  currency: string
}

type ChartPeriod = '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | 'ALL'

export function PKEquityPortfolioChart({ holdings, currency }: PKEquityPortfolioChartProps) {
  const { theme } = useTheme()
  const colors = getThemeColors()
  const { toast } = useToast()
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1Y')
  const [showKSE100Comparison, setShowKSE100Comparison] = useState(false)
  const [showTotalReturn, setShowTotalReturn] = useState(false)
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

  const pkEquityHoldings = useMemo(() => {
    return holdings.filter(h => h.assetType === 'pk-equity')
  }, [holdings])

  useEffect(() => {
    if (pkEquityHoldings.length === 0) {
      setLoading(false)
      setChartData(null)
      return
    }

    const loadChartData = async () => {
      setLoading(true)
      try {
        // Fetch historical data for all PK equity holdings in parallel (optimized)
        const historicalDataMap = new Map<string, StockAnalysisDataPoint[]>()

        // Fetch all holdings in parallel instead of sequentially
        const fetchPromises = pkEquityHoldings.map(async (holding) => {
          try {
            const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
            const response = await deduplicatedFetch(`/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(holding.symbol)}&market=PSX`)
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
            console.error(`[PK Equity Chart] Error fetching historical data for ${holding.symbol}:`, error)
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
        const purchaseDates = pkEquityHoldings.map(h => new Date(h.purchaseDate))
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
            periodStartDate = earliestPurchaseDate // Start from earliest purchase, not 2000
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

        // Fetch dividend data for all holdings if total return is enabled
        const dividendDataMap = new Map<string, Array<{ date: string; dividend_amount: number }>>()
        if (showTotalReturn) {
          const dividendPromises = pkEquityHoldings.map(async (holding) => {
            try {
              const response = await fetch(`/api/pk-equity/dividend?ticker=${encodeURIComponent(holding.symbol)}`)
              if (response.ok) {
                const data = await response.json()
                if (data.dividends && Array.isArray(data.dividends)) {
                  // Filter dividends that occurred on or after purchase date and convert to rupees
                  const relevantDividends = filterDividendsByPurchaseDate(data.dividends, holding.purchaseDate)
                    .map((d: any) => {
                      // Convert dividend_amount (percent/10) to rupees
                      const dividendAmountRupees = convertDividendToRupees(d.dividend_amount)
                      return {
                        date: d.date,
                        dividend_amount: dividendAmountRupees // Now in rupees
                      }
                    })
                  dividendDataMap.set(holding.symbol, relevantDividends)
                }
              }
            } catch (error) {
              console.error(`Error fetching dividends for ${holding.symbol}:`, error)
            }
          })
          await Promise.all(dividendPromises)
        }

        // Prepare historical price map for centralized calculation
        // PK equity data uses 't' for date and 'c' for close price
        const historicalPriceMap = new Map<string, { date: string; price: number }[]>()
        historicalDataMap.forEach((data, symbol) => {
          historicalPriceMap.set(symbol, data.map(d => ({ date: d.t, price: d.c })))
        })

        // Calculate base portfolio value for each date using centralized function
        const portfolioValues: number[] = []
        const portfolioValuesWithDividends: number[] = []

        for (const date of sortedDates) {
          // Use centralized function for base value (ensures consistency with summary)
          const baseValue = calculatePortfolioValueForDate(pkEquityHoldings, date, historicalPriceMap)
          portfolioValues.push(baseValue)

          // Calculate dividend-adjusted value if total return is enabled
          if (showTotalReturn) {
            let totalValueWithDividends = 0

            for (const holding of pkEquityHoldings) {
              const purchaseDate = new Date(holding.purchaseDate)
              const dateObj = new Date(date)

              // Only include holdings purchased on or before this date
              if (dateObj >= purchaseDate) {
                const data = historicalDataMap.get(holding.symbol)
                const dividends = dividendDataMap.get(holding.symbol) || []

                if (data && dividends.length > 0) {
                  // Convert historical data to PriceDataPoint format
                  const priceData: PriceDataPoint[] = data
                    .filter(d => d.t >= holding.purchaseDate && d.t <= date)
                    .map(d => ({ date: d.t, close: d.c }))
                    .sort((a, b) => a.date.localeCompare(b.date))

                  if (priceData.length > 0) {
                    // Calculate dividend-adjusted prices for this holding
                    const adjustedPoints = calculateDividendAdjustedPrices(priceData, dividends)
                    if (adjustedPoints.length > 0) {
                      // Get the last adjusted point (most recent)
                      const lastAdjusted = adjustedPoints[adjustedPoints.length - 1]
                      // The adjusted value is for 1 share, so multiply by our holding quantity
                      totalValueWithDividends += lastAdjusted.adjustedValue * holding.quantity
                    } else {
                      // Fallback to base value for this holding
                      const holdingBaseValue = calculatePortfolioValueForDate([holding], date, historicalPriceMap)
                      totalValueWithDividends += holdingBaseValue
                    }
                  } else {
                    // Fallback to base value for this holding
                    const holdingBaseValue = calculatePortfolioValueForDate([holding], date, historicalPriceMap)
                    totalValueWithDividends += holdingBaseValue
                  }
                } else {
                  // No dividends or no data, use base value for this holding
                  const holdingBaseValue = calculatePortfolioValueForDate([holding], date, historicalPriceMap)
                  totalValueWithDividends += holdingBaseValue
                }
              }
            }

            portfolioValuesWithDividends.push(totalValueWithDividends)
          } else {
            portfolioValuesWithDividends.push(baseValue)
          }
        }

        // Use dividend-adjusted values if total return is enabled
        const valuesToUse = showTotalReturn ? portfolioValuesWithDividends : portfolioValues

        // Normalize portfolio values to percentage change from start (for comparison with KSE 100)
        const startValue = valuesToUse[0] || 1
        setPortfolioStartValue(startValue)
        const normalizedPortfolioValues = valuesToUse.map(value => (value / startValue) * 100)

        // Fetch KSE 100 data if comparison is enabled
        let kse100Data: number[] | null = null
        let alignedDates = sortedDates
        let alignedPortfolioValues = showKSE100Comparison ? normalizedPortfolioValues : valuesToUse

        if (showKSE100Comparison) {
          try {
            // Fetch PK equity trades (buy/sell) to adjust benchmark
            // Since PK equity chart doesn't include cash, we track actual buy/sell transactions
            const token = localStorage.getItem('auth_token')
            let tradesByDate = new Map<string, Array<{ type: 'buy' | 'sell', amount: number }>>()
            
            try {
              const tradesRes = await fetch(`/api/user/trades?limit=10000`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
              })
              if (tradesRes.ok) {
                const tradesData = await tradesRes.json()
                const trades = tradesData.trades || []
                // Filter for PK equity trades only
                const pkEquityTrades = trades.filter((t: any) => 
                  t.assetType === 'pk-equity' && 
                  (t.tradeType === 'buy' || t.tradeType === 'sell') &&
                  t.currency.toUpperCase() === currency.toUpperCase()
                )
                
                // Group trades by date
                pkEquityTrades.forEach((trade: any) => {
                  const date = trade.tradeDate
                  if (!tradesByDate.has(date)) {
                    tradesByDate.set(date, [])
                  }
                  const tradeType = trade.tradeType === 'buy' ? 'buy' : 'sell'
                  tradesByDate.get(date)!.push({
                    type: tradeType,
                    amount: trade.totalAmount || 0
                  })
                })
              }
            } catch (error) {
              console.error('Error fetching trades for benchmark adjustment:', error)
            }

            // First check database
            const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
            let kse100Historical: InvestingHistoricalDataPoint[] | null = null

            const dbResponse = await deduplicatedFetch(`/api/historical-data?assetType=kse100&symbol=KSE100`)
            if (dbResponse.ok) {
              const dbData = await dbResponse.json()
              const dbRecords = dbData.data || []

              if (dbRecords.length > 0) {
                // Convert database records to Investing format
                const { dbRecordToInvesting } = await import('@/lib/portfolio/db-to-chart-format')
                kse100Historical = dbRecords.map(dbRecordToInvesting)

                // Check if today's data is missing - if so, try to fetch it
                // The API now handles server-side fetching for KSE100, so we just need to call it
                const { getTodayInMarketTimezone } = await import('@/lib/portfolio/market-hours')
                const today = getTodayInMarketTimezone('PSX')
                const hasTodayData = kse100Historical.some(d => d.date === today)

                if (!hasTodayData && kse100Historical) {
                  // Call API to ensure latest data is fetched (server-side now)
                  // We don't need to handle client-side fetch for KSE100 anymore
                  try {
                    const { fetchIndicesPrice } = await import('@/lib/portfolio/unified-price-api')
                    const latestPriceData = await fetchIndicesPrice('KSE100', true) // refresh=true to force check/fetch

                    if (latestPriceData && latestPriceData.price && latestPriceData.date) {
                      // Add to our local data if it's new
                      if (kse100Historical && !kse100Historical.some(d => d.date === latestPriceData.date)) {
                        kse100Historical.push({
                          date: latestPriceData.date,
                          open: latestPriceData.price,
                          high: latestPriceData.price,
                          low: latestPriceData.price,
                          close: latestPriceData.price,
                          volume: null,
                        })
                        kse100Historical.sort((a, b) => a.date.localeCompare(b.date))
                      }
                    }
                  } catch (e) {
                    console.error("Error refreshing KSE100 data", e)
                  }
                }
              }
            }

            if (kse100Historical && kse100Historical.length > 0) {
              // Map KSE 100 data to our date range
              const kse100Mapped: (number | null)[] = sortedDates.map(date => {
                // Find exact match or closest before
                let ksePoint = kse100Historical!.find(d => d.date === date)

                if (!ksePoint) {
                  const beforeDates = kse100Historical!.filter(d => d.date <= date)
                  if (beforeDates.length > 0) {
                    ksePoint = beforeDates.sort((a, b) => b.date.localeCompare(a.date))[0]
                  }
                }

                return ksePoint ? ksePoint.close : null
              })

              // Only use data points that have values for both portfolio and KSE 100
              const validKseData: number[] = []
              const validPortfolioValues: number[] = [] // Will store actual values, not normalized
              const validDates: string[] = []

              for (let i = 0; i < sortedDates.length; i++) {
                if (kse100Mapped[i] !== null && valuesToUse[i] !== undefined) {
                  validKseData.push(kse100Mapped[i]!)
                  validPortfolioValues.push(valuesToUse[i]) // Use actual values, not normalized
                  validDates.push(sortedDates[i])
                }
              }

              if (validKseData.length > 0 && validKseData[0] > 0) {
                // Calculate benchmark value adjusted for buy/sell transactions
                // When you buy: add that amount to benchmark shares
                // When you sell: calculate percentage of portfolio sold, and sell that percentage from benchmark
                const benchmarkValues: number[] = []
                let benchmarkShares = 0 // Track shares of benchmark owned
                const startDate = validDates[0]
                const startKsePrice = validKseData[0]
                const startPortfolioValue = validPortfolioValues[0] // Use the first valid portfolio value
                
                // Initial investment: calculate how many benchmark shares the initial portfolio value would buy
                // This ensures both portfolio and benchmark start from the exact same value on day 1
                if (startPortfolioValue > 0 && startKsePrice > 0) {
                  benchmarkShares = startPortfolioValue / startKsePrice
                }

                for (let i = 0; i < validDates.length; i++) {
                  const date = validDates[i]
                  const ksePrice = validKseData[i]
                  
                  if (ksePrice <= 0) {
                    benchmarkValues.push(0)
                    continue
                  }

                  // Get actual portfolio value for this date (market value of all holdings)
                  const portfolioValueOnThisDate = validPortfolioValues[i]
                  
                  // Get portfolio value from previous day
                  const portfolioValuePreviousDay = i > 0 ? validPortfolioValues[i - 1] : startPortfolioValue
                  
                  // Get previous benchmark value and KSE price for price movement calculation
                  const previousBenchmarkValue = i > 0 ? benchmarkValues[i - 1] : startPortfolioValue
                  const previousKsePrice = i > 0 ? validKseData[i - 1] : startKsePrice

                  // Check if there are trades on this date
                  const tradesOnDate = tradesByDate.get(date) || []
                  
                  // Calculate what benchmark value would be from price movements alone (before trades)
                  // This accounts for the fact that benchmarkShares * ksePrice already includes price movements
                  const benchmarkValueFromPriceMovement = previousKsePrice > 0 
                    ? previousBenchmarkValue * (ksePrice / previousKsePrice)
                    : previousBenchmarkValue
                  
                  // Update benchmark shares to reflect price movement first
                  if (previousKsePrice > 0) {
                    benchmarkShares = benchmarkValueFromPriceMovement / ksePrice
                  }
                  
                  // Calculate portfolio value change
                  const portfolioValueChange = portfolioValueOnThisDate - portfolioValuePreviousDay
                  
                  if (tradesOnDate.length > 0) {
                    // There are trades on this date
                    // Calculate total trade amounts
                    const totalBuyAmount = tradesOnDate
                      .filter(t => t.type === 'buy')
                      .reduce((sum, t) => sum + t.amount, 0)
                    const totalSellAmount = tradesOnDate
                      .filter(t => t.type === 'sell')
                      .reduce((sum, t) => sum + t.amount, 0)
                    
                    if (totalBuyAmount > 0) {
                      // Buy: Estimate portfolio value change from price movements
                      // Then the remaining change is from the new position
                      const estimatedPriceMovement = portfolioValuePreviousDay * (ksePrice / previousKsePrice - 1)
                      const newPositionValue = portfolioValueChange - estimatedPriceMovement
                      
                      // Add shares based on the market value of the new position
                      if (newPositionValue > 0 && ksePrice > 0) {
                        const sharesToAdd = newPositionValue / ksePrice
                        benchmarkShares += sharesToAdd
                      }
                    } else if (totalSellAmount > 0 && portfolioValuePreviousDay > 0) {
                      // Sell: calculate percentage based on market value of sold position
                      const estimatedPriceMovement = portfolioValuePreviousDay * (ksePrice / previousKsePrice - 1)
                      const soldPositionValue = Math.abs(portfolioValueChange - estimatedPriceMovement)
                      
                      if (soldPositionValue > 0 && benchmarkValueFromPriceMovement > 0) {
                        const sellPercentage = soldPositionValue / benchmarkValueFromPriceMovement
                        const sharesToRemove = benchmarkShares * sellPercentage
                        benchmarkShares = Math.max(0, benchmarkShares - sharesToRemove)
                      }
                    }
                  }

                  // Calculate current benchmark value (notional, not percentage)
                  let benchmarkValue = benchmarkShares * ksePrice
                  
                  // Ensure first day starts from exact same value as portfolio
                  if (i === 0) {
                    // Force benchmark to match portfolio on day 1 exactly
                    benchmarkValue = startPortfolioValue
                    // Recalculate shares to maintain consistency for future days
                    if (ksePrice > 0) {
                      benchmarkShares = startPortfolioValue / ksePrice
                    }
                  }
                  
                  benchmarkValues.push(benchmarkValue)
                }

                // Use notional values instead of percentages
                if (benchmarkValues.length > 0) {
                  kse100Data = benchmarkValues // Keep as notional values
                  
                  // Use actual portfolio values (already in notional form from valuesToUse)
                  alignedPortfolioValues = validPortfolioValues

                // Use aligned data
                alignedDates = validDates
                }
              }
            }
          } catch (error) {
            console.error('Error fetching KSE 100 data:', error)
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
              borderColor: colors.primary || '#10b981',
              backgroundColor: (colors.primary || '#10b981') + '20',
              fill: true,
            },
          ]

        // Add KSE 100 comparison line if enabled and data is available
        if (showKSE100Comparison && kse100Data && kse100Data.length > 0) {
          datasets.push({
            label: 'KSE 100 Index',
            data: kse100Data,
            borderColor: '#6366f1', // Indigo for KSE 100
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
    // Re-run when holdings, period, comparison toggle, total return toggle, or log scale changes
    // When comparison toggle changes, we need to re-process the data (but not re-fetch from API)
  }, [pkEquityHoldings, chartPeriod, showKSE100Comparison, showTotalReturn, useLogScale])

  // Show warning when comparing with KSE100 using price return only
  useEffect(() => {
    if (showKSE100Comparison && !showTotalReturn) {
      toast({
        title: "Comparison Warning",
        description: "KSE100 is dividend-adjusted. For accurate comparison, consider using total return (dividend-adjusted).",
        variant: "default",
      })
    }
  }, [showKSE100Comparison, showTotalReturn, toast])

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

            if (showKSE100Comparison) {
              // Show percentage change when comparing
              if (datasetLabel === 'KSE 100 Index') {
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
        isPercentage: false, // Always show notional values when comparison is enabled
        currency,
      }),
    },
  }), [colors, currency, showKSE100Comparison, portfolioStartValue, useLogScale])

  // Don't render anything if there are no PK equity holdings
  if (pkEquityHoldings.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle>PK Equities Portfolio Performance</CardTitle>
            <CardDescription>Historical portfolio value over time</CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="total-return"
                checked={showTotalReturn}
                onCheckedChange={setShowTotalReturn}
              />
              <Label htmlFor="total-return" className="text-sm cursor-pointer">
                Total Return (with dividends)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="kse100-comparison"
                checked={showKSE100Comparison}
                onCheckedChange={setShowKSE100Comparison}
              />
              <Label htmlFor="kse100-comparison" className="text-sm cursor-pointer">
                Compare with KSE 100
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
        {showKSE100Comparison && !showTotalReturn && (
          <Alert className="mb-4">
            <AlertDescription>
              KSE100 is dividend-adjusted. For accurate comparison, consider using total return (dividend-adjusted).
            </AlertDescription>
          </Alert>
        )}
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

