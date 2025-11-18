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
import { fetchInvestingHistoricalDataClient, type InvestingHistoricalDataPoint, KSE100_INSTRUMENT_ID } from "@/lib/portfolio/investing-client-api"
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
                
                // Check if today's data is missing - if so, fetch and store it using centralized route
                // Use PSX market timezone for KSE100
                const { getTodayInMarketTimezone } = await import('@/lib/portfolio/market-hours')
                const today = getTodayInMarketTimezone('PSX')
                const hasTodayData = kse100Historical.some(d => d.date === today)
                
                if (!hasTodayData) {
                  // Use unified API route to fetch latest price (handles client-side fetch if needed)
                  const { fetchIndicesPrice } = await import('@/lib/portfolio/unified-price-api')
                  const latestPriceData = await fetchIndicesPrice('KSE100', true) // refresh=true to force fetch
                  
                  if (latestPriceData && latestPriceData.price && latestPriceData.date) {
                    // Store the latest price in database
                    const storeResponse = await fetch('/api/historical-data/store', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        assetType: 'kse100',
                        symbol: 'KSE100',
                        data: [{
                          date: latestPriceData.date,
                          open: latestPriceData.price,
                          high: latestPriceData.price,
                          low: latestPriceData.price,
                          close: latestPriceData.price,
                          volume: null,
                        }],
                        source: 'investing',
                      }),
                    })
                    
                    if (storeResponse.ok) {
                      // Add today's data to historical array
                      kse100Historical.push({
                        date: latestPriceData.date,
                        open: latestPriceData.price,
                        high: latestPriceData.price,
                        low: latestPriceData.price,
                        close: latestPriceData.price,
                        volume: null,
                      })
                      // Sort by date
                      kse100Historical.sort((a, b) => a.date.localeCompare(b.date))
                    } else {
                      console.error(`[PK Equity Chart] Failed to store today's KSE100 price`)
                      // Don't show comparison if we can't store today's data
                      kse100Historical = null
                    }
                  } else {
                    // Don't show comparison if we can't fetch today's data
                    kse100Historical = null
                  }
                }
              } else {
                // No data in database - fetch it client-side and store it
                try {
                  const { fetchInvestingHistoricalDataClient } = await import('@/lib/portfolio/investing-client-api')
                  const { KSE100_INSTRUMENT_ID } = await import('@/lib/portfolio/investing-client-api')
                  
                  // Fetch all historical data (from 2000 to today)
                  const clientData = await fetchInvestingHistoricalDataClient(
                    KSE100_INSTRUMENT_ID,
                    '2000-01-01',
                    new Date().toISOString().split('T')[0]
                  )
                  
                  if (clientData && clientData.length > 0) {
                    // Store in database
                    const storeResponse = await fetch('/api/historical-data/store', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        assetType: 'kse100',
                        symbol: 'KSE100',
                        data: clientData,
                        source: 'investing',
                      }),
                    })
                    
                    if (storeResponse.ok) {
                      kse100Historical = clientData
                    } else {
                      console.error(`[PK Equity Chart] Failed to store KSE100 data`)
                      kse100Historical = clientData // Use it anyway even if storage failed
                    }
                  } else {
                    console.error(`[PK Equity Chart] Failed to fetch KSE100 data from Investing.com`)
                    kse100Historical = null
                  }
                } catch (fetchError) {
                  console.error(`[PK Equity Chart] Error fetching KSE100 data:`, fetchError)
                  kse100Historical = null
                }
              }
            } else {
              // Database check failed - try to fetch anyway
              try {
                const { fetchInvestingHistoricalDataClient } = await import('@/lib/portfolio/investing-client-api')
                const { KSE100_INSTRUMENT_ID } = await import('@/lib/portfolio/investing-client-api')
                
                const clientData = await fetchInvestingHistoricalDataClient(
                  KSE100_INSTRUMENT_ID,
                  '2000-01-01',
                  new Date().toISOString().split('T')[0]
                )
                
                if (clientData && clientData.length > 0) {
                  kse100Historical = clientData
                  // Try to store it
                  try {
                    await fetch('/api/historical-data/store', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        assetType: 'kse100',
                        symbol: 'KSE100',
                        data: clientData,
                        source: 'investing',
                      }),
                    })
                  } catch (storeError) {
                    console.error(`[PK Equity Chart] Failed to store KSE100 data:`, storeError)
                  }
                } else {
                  kse100Historical = null
                }
              } catch (fetchError) {
                console.error(`[PK Equity Chart] Error fetching KSE100 data:`, fetchError)
                kse100Historical = null
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
              const validPortfolioValues: number[] = []
              const validDates: string[] = []
              
              for (let i = 0; i < sortedDates.length; i++) {
                if (kse100Mapped[i] !== null && normalizedPortfolioValues[i] !== undefined) {
                  validKseData.push(kse100Mapped[i]!)
                  validPortfolioValues.push(normalizedPortfolioValues[i])
                  validDates.push(sortedDates[i])
                }
              }
              
              if (validKseData.length > 0 && validKseData[0] > 0) {
                // Normalize KSE 100 to percentage change from start (for comparison)
                const kse100StartValue = validKseData[0]
                kse100Data = validKseData.map(value => (value / kse100StartValue) * 100)
                
                // Use aligned data
                alignedDates = validDates
                alignedPortfolioValues = validPortfolioValues
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
        isPercentage: showKSE100Comparison,
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

