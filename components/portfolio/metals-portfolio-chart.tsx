"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Line } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js"
import { Loader2 } from "lucide-react"
import type { Holding } from "@/lib/portfolio/types"
import type { InvestingHistoricalDataPoint } from "@/lib/portfolio/investing-client-api"
import { formatCurrency } from "@/lib/portfolio/portfolio-utils"
import { useTheme } from "next-themes"
import { getThemeColors } from "@/lib/charts/theme-colors"

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

interface MetalsPortfolioChartProps {
  holdings: Holding[]
  currency: string
}

type ChartPeriod = '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | 'ALL'

export function MetalsPortfolioChart({ holdings, currency }: MetalsPortfolioChartProps) {
  const { theme } = useTheme()
  const colors = getThemeColors()
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1Y')
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

  const metalsHoldings = useMemo(() => {
    return holdings.filter(h => h.assetType === 'metals')
  }, [holdings])

  // Track if effect has run to prevent duplicate calls in StrictMode
  const hasRunRef = useRef(false)
  const effectIdRef = useRef(0)

  useEffect(() => {
    if (metalsHoldings.length === 0) {
      setLoading(false)
      setChartData(null)
      return
    }

    // Prevent duplicate calls in React StrictMode (development)
    if (hasRunRef.current) {
      return
    }
    hasRunRef.current = true

    const loadChartData = async () => {
      setLoading(true)
      try {
        // Fetch historical data for all metals holdings in parallel (optimized)
        const historicalDataMap = new Map<string, InvestingHistoricalDataPoint[]>()
        
        // Fetch all holdings in parallel instead of sequentially
        const fetchPromises = metalsHoldings.map(async (holding) => {
          try {
            const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
            // First check database - use uppercase symbol to match database storage
            const symbolUpper = holding.symbol.toUpperCase()
            let response = await deduplicatedFetch(`/api/historical-data?assetType=metals&symbol=${encodeURIComponent(symbolUpper)}`)
            if (response.ok) {
              const apiData = await response.json()
              const dbRecords = apiData.data || []
              
              // ONLY read from database - NO automatic API calls
              // Charts should only display what's already stored
              if (dbRecords.length > 0) {
                // Convert database records to Investing format
                const { dbRecordToInvesting } = await import('@/lib/portfolio/db-to-chart-format')
                const data: InvestingHistoricalDataPoint[] = dbRecords.map(dbRecordToInvesting)
                return { symbol: holding.symbol, data }
              } else {
                // No data in database - chart will show "No data" message
                return null
              }
            } else {
              console.error(`[Metals Chart] Database check failed for ${symbolUpper}: ${response.status} ${response.statusText}`)
            }
          } catch (error) {
            console.error(`[Metals Chart] Error fetching historical data for ${holding.symbol}:`, error)
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
        const purchaseDates = metalsHoldings.map(h => new Date(h.purchaseDate))
        const earliestPurchaseDate = new Date(Math.min(...purchaseDates.map(d => d.getTime())))

        // Calculate date range based on chart period
        const today = new Date()
        let startDate: Date
        
        switch (chartPeriod) {
          case '1M':
            startDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
            break
          case '3M':
            startDate = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate())
            break
          case '6M':
            startDate = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate())
            break
          case '1Y':
            startDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
            break
          case '2Y':
            startDate = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate())
            break
          case '5Y':
            startDate = new Date(today.getFullYear() - 5, today.getMonth(), today.getDate())
            break
          case 'ALL':
            startDate = earliestPurchaseDate
            break
          default:
            startDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
        }

        // Ensure start date is not before earliest purchase date
        if (startDate < earliestPurchaseDate) {
          startDate = earliestPurchaseDate
        }

        // Get all unique dates from all holdings' historical data
        const allDates = new Set<string>()
        historicalDataMap.forEach((data) => {
          data.forEach((point) => {
            const pointDate = new Date(point.date)
            if (pointDate >= startDate && pointDate <= today) {
              allDates.add(point.date)
            }
          })
        })

        // Sort dates
        const sortedDates = Array.from(allDates).sort((a, b) => a.localeCompare(b))

        // Calculate portfolio value over time
        const portfolioValues: number[] = []
        
        sortedDates.forEach((dateStr) => {
          const dateObj = new Date(dateStr)
          let totalValue = 0

          metalsHoldings.forEach((holding) => {
            // Only include holdings purchased on or before this date
            const purchaseDate = new Date(holding.purchaseDate)
            if (dateObj >= purchaseDate) {
              const historicalData = historicalDataMap.get(holding.symbol)
              if (historicalData) {
                // Find price for this date (or closest before)
                let pricePoint = historicalData.find((d) => d.date === dateStr)
                if (!pricePoint) {
                  const beforeDates = historicalData.filter((d) => d.date <= dateStr)
                  if (beforeDates.length > 0) {
                    pricePoint = beforeDates.sort((a, b) => b.date.localeCompare(a.date))[0]
                  }
                }
                
                if (pricePoint) {
                  totalValue += holding.quantity * pricePoint.close
                }
              }
            }
          })

          portfolioValues.push(totalValue)
        })

        // Use notional values (actual dollar amounts) instead of normalized percentages
        if (portfolioValues.length > 0 && portfolioValues[0] > 0) {
          const startValue = portfolioValues[0]
          setPortfolioStartValue(startValue)
          // Don't normalize - use actual notional values
          const notionalValues = portfolioValues

          setChartData({
            labels: sortedDates.map(date => {
              const d = new Date(date)
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: chartPeriod === 'ALL' ? 'numeric' : undefined })
            }),
            datasets: [
              {
                label: 'Portfolio Value',
                data: notionalValues,
                borderColor: colors.primary || '#f97316',
                backgroundColor: `${colors.primary || '#f97316'}20`,
                fill: true,
              },
            ],
          })
        } else {
          setChartData(null)
        }
      } catch (error) {
        console.error('Error loading metals portfolio chart data:', error)
        setChartData(null)
      } finally {
        setLoading(false)
      }
    }

    loadChartData()
  }, [metalsHoldings, chartPeriod]) // Removed colors.primary to prevent unnecessary re-renders

  if (metalsHoldings.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Metals Portfolio Performance</CardTitle>
            <CardDescription>
              Historical portfolio value for metals holdings
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : chartData ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <ToggleGroup
                type="single"
                value={chartPeriod}
                onValueChange={(value) => {
                  if (value) setChartPeriod(value as ChartPeriod)
                }}
                className="flex-wrap"
              >
                <ToggleGroupItem value="1M" aria-label="1 Month">
                  1M
                </ToggleGroupItem>
                <ToggleGroupItem value="3M" aria-label="3 Months">
                  3M
                </ToggleGroupItem>
                <ToggleGroupItem value="6M" aria-label="6 Months">
                  6M
                </ToggleGroupItem>
                <ToggleGroupItem value="1Y" aria-label="1 Year">
                  1Y
                </ToggleGroupItem>
                <ToggleGroupItem value="2Y" aria-label="2 Years">
                  2Y
                </ToggleGroupItem>
                <ToggleGroupItem value="5Y" aria-label="5 Years">
                  5Y
                </ToggleGroupItem>
                <ToggleGroupItem value="ALL" aria-label="All Time">
                  ALL
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="h-64">
              <Line
                data={chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: true,
                      position: 'top' as const,
                    },
                    tooltip: {
                      mode: 'index',
                      intersect: false,
                      callbacks: {
                        label: function (context) {
                          const value = context.parsed.y
                          // Show notional value (actual dollar amount)
                          return `${context.dataset.label}: ${formatCurrency(value, currency)}`
                        },
                      },
                    },
                  },
                  scales: {
                    x: {
                      display: true,
                      title: {
                        display: true,
                        text: 'Date',
                      },
                    },
                    y: {
                      display: true,
                      title: {
                        display: true,
                        text: 'Portfolio Value',
                      },
                      ticks: {
                        callback: function (value) {
                          return formatCurrency(Number(value), currency)
                        },
                      },
                    },
                  },
                }}
              />
            </div>

            <div className="text-sm text-muted-foreground">
              <p>
                Starting value: {formatCurrency(portfolioStartValue, currency)}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            No historical data available
          </div>
        )}
      </CardContent>
    </Card>
  )
}

