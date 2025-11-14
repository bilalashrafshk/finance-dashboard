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
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js"
import type { Holding } from "@/lib/portfolio/types"
import type { StockAnalysisDataPoint } from "@/lib/portfolio/stockanalysis-api"
import { getThemeColors } from "@/lib/charts/theme-colors"
import { formatCurrency } from "@/lib/portfolio/portfolio-utils"
import { Loader2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { fetchInvestingHistoricalDataClient, type InvestingHistoricalDataPoint, SPX500_INSTRUMENT_ID } from "@/lib/portfolio/investing-client-api"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

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

        // Calculate portfolio value for each date
        const portfolioValues: number[] = []
        
        for (const date of sortedDates) {
          const dateObj = new Date(date)
          let totalValue = 0
          
          for (const holding of usEquityHoldings) {
            const purchaseDate = new Date(holding.purchaseDate)
            
            // Only include this holding if the date is on or after the purchase date
            if (dateObj >= purchaseDate) {
              const data = historicalDataMap.get(holding.symbol)
              if (data) {
                // Find price for this date (or closest before)
                // Data from API is sorted most recent first, so find exact match or closest before
                let datePoint = data.find(d => d.t === date)
                
                if (!datePoint) {
                  // Find closest date before (or equal to) the target date
                  const beforeDates = data.filter(d => d.t <= date)
                  if (beforeDates.length > 0) {
                    // Sort by date descending to get the closest before date
                    datePoint = beforeDates.sort((a, b) => b.t.localeCompare(a.t))[0]
                  }
                }
                
                if (datePoint) {
                  totalValue += holding.quantity * datePoint.c // Close price
                } else {
                  // If no historical data for this date, use current price as fallback
                  totalValue += holding.quantity * holding.currentPrice
                }
              } else {
                // If no historical data at all, use current price
                totalValue += holding.quantity * holding.currentPrice
              }
            }
            // If date is before purchase date, don't include this holding (value stays 0 for this holding)
          }
          
          portfolioValues.push(totalValue)
        }

        // Normalize portfolio values to percentage change from start (for comparison with S&P 500)
        const startValue = portfolioValues[0] || 1
        setPortfolioStartValue(startValue)
        const normalizedPortfolioValues = portfolioValues.map(value => (value / startValue) * 100)

        // Fetch S&P 500 data if comparison is enabled
        let spx500Data: number[] | null = null
        let alignedDates = sortedDates
        let alignedPortfolioValues = showSPX500Comparison ? normalizedPortfolioValues : portfolioValues
        
        if (showSPX500Comparison) {
          try {
            // First check database
            const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
            let spx500Historical: InvestingHistoricalDataPoint[] | null = null
            
            const dbResponse = await deduplicatedFetch(`/api/historical-data?assetType=spx500&symbol=SPX500`)
            if (dbResponse.ok) {
              const dbData = await dbResponse.json()
              const dbRecords = dbData.data || []
              
              if (dbRecords.length > 0) {
                // Convert database records to Investing format
                const { dbRecordToInvesting } = await import('@/lib/portfolio/db-to-chart-format')
                spx500Historical = dbRecords.map(dbRecordToInvesting)
                
                // Check if today's data is missing - if so, fetch and store it using centralized route
                // Use US market timezone for SPX500
                const { getTodayInMarketTimezone } = await import('@/lib/portfolio/market-hours')
                const today = getTodayInMarketTimezone('US')
                const hasTodayData = spx500Historical.some(d => d.date === today)
                
                if (!hasTodayData) {
                  // Use unified API route to fetch latest price (handles client-side fetch if needed)
                  const { fetchIndicesPrice } = await import('@/lib/portfolio/unified-price-api')
                  const latestPriceData = await fetchIndicesPrice('SPX500', true) // refresh=true to force fetch
                  
                  if (latestPriceData && latestPriceData.price && latestPriceData.date) {
                    // Store the latest price in database
                    const storeResponse = await fetch('/api/historical-data/store', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        assetType: 'spx500',
                        symbol: 'SPX500',
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
                      spx500Historical.push({
                        date: latestPriceData.date,
                        open: latestPriceData.price,
                        high: latestPriceData.price,
                        low: latestPriceData.price,
                        close: latestPriceData.price,
                        volume: null,
                      })
                      // Sort by date
                      spx500Historical.sort((a, b) => a.date.localeCompare(b.date))
                    } else {
                      console.error(`[US Equity Chart] Failed to store today's SPX500 price`)
                      // Don't show comparison if we can't store today's data
                      spx500Historical = null
                    }
                  } else {
                    // Don't show comparison if we can't fetch today's data
                    spx500Historical = null
                  }
                }
              } else {
                // No data in database - fetch it client-side and store it
                try {
                  const { fetchInvestingHistoricalDataClient } = await import('@/lib/portfolio/investing-client-api')
                  const { SPX500_INSTRUMENT_ID } = await import('@/lib/portfolio/investing-client-api')
                  
                  // Fetch all historical data (from 1996 to today)
                  const clientData = await fetchInvestingHistoricalDataClient(
                    SPX500_INSTRUMENT_ID,
                    '1996-01-01',
                    new Date().toISOString().split('T')[0]
                  )
                  
                  if (clientData && clientData.length > 0) {
                    // Store in database
                    const storeResponse = await fetch('/api/historical-data/store', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        assetType: 'spx500',
                        symbol: 'SPX500',
                        data: clientData,
                        source: 'investing',
                      }),
                    })
                    
                    if (storeResponse.ok) {
                      spx500Historical = clientData
                    } else {
                      console.error(`[US Equity Chart] Failed to store SPX500 data`)
                      spx500Historical = clientData // Use it anyway even if storage failed
                    }
                  } else {
                    console.error(`[US Equity Chart] Failed to fetch SPX500 data from Investing.com`)
                    spx500Historical = null
                  }
                } catch (fetchError) {
                  console.error(`[US Equity Chart] Error fetching SPX500 data:`, fetchError)
                  spx500Historical = null
                }
              }
            } else {
              // Database check failed - try to fetch anyway
              try {
                const { fetchInvestingHistoricalDataClient } = await import('@/lib/portfolio/investing-client-api')
                const { SPX500_INSTRUMENT_ID } = await import('@/lib/portfolio/investing-client-api')
                
                const clientData = await fetchInvestingHistoricalDataClient(
                  SPX500_INSTRUMENT_ID,
                  '1996-01-01',
                  new Date().toISOString().split('T')[0]
                )
                
                if (clientData && clientData.length > 0) {
                  spx500Historical = clientData
                  // Try to store it
                  try {
                    await fetch('/api/historical-data/store', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        assetType: 'spx500',
                        symbol: 'SPX500',
                        data: clientData,
                        source: 'investing',
                      }),
                    })
                  } catch (storeError) {
                    console.error(`[US Equity Chart] Failed to store SPX500 data:`, storeError)
                  }
                } else {
                  spx500Historical = null
                }
              } catch (fetchError) {
                console.error(`[US Equity Chart] Error fetching SPX500 data:`, fetchError)
                spx500Historical = null
              }
            }
            
            if (spx500Historical && spx500Historical.length > 0) {
              // Map S&P 500 data to our date range
              const spx500Mapped: (number | null)[] = sortedDates.map(date => {
                // Find exact match or closest before
                let spxPoint = spx500Historical!.find(d => d.date === date)
                
                if (!spxPoint) {
                  const beforeDates = spx500Historical!.filter(d => d.date <= date)
                  if (beforeDates.length > 0) {
                    spxPoint = beforeDates.sort((a, b) => b.date.localeCompare(a.date))[0]
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
                // Normalize S&P 500 to percentage change from start (for comparison)
                const spx500StartValue = validSpxData[0]
                spx500Data = validSpxData.map(value => (value / spx500StartValue) * 100)
                
                // Use aligned data
                alignedDates = validDates
                alignedPortfolioValues = validPortfolioValues
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
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: chartPeriod === 'ALL' ? 'numeric' : undefined })
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
    // Re-run when holdings, period, or comparison toggle changes
    // When comparison toggle changes, we need to re-process the data (but not re-fetch from API)
  }, [usEquityHoldings, chartPeriod, showSPX500Comparison])

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
      y: {
        grid: {
          color: colors.grid,
        },
        ticks: {
          color: colors.foreground,
          callback: (value: any) => {
            const num = Number(value)
            if (showSPX500Comparison) {
              // Show percentage when comparing
              return `${num.toFixed(0)}%`
            } else {
              // Show currency values when not comparing
              if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M ${currency}`
              if (num >= 1000) return `${(num / 1000).toFixed(1)}K ${currency}`
              return `${num.toFixed(0)} ${currency}`
            }
          },
        },
      },
    },
  }), [colors, currency, showSPX500Comparison, portfolioStartValue])

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
      </CardContent>
    </Card>
  )
}

