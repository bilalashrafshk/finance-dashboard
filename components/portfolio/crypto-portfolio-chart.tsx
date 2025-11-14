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
import type { BinanceHistoricalDataPoint } from "@/lib/portfolio/binance-historical-api"
import { parseSymbolToBinance } from "@/lib/portfolio/binance-api"
import { getThemeColors } from "@/lib/charts/theme-colors"
import { formatCurrency } from "@/lib/portfolio/portfolio-utils"
import { Loader2 } from "lucide-react"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

interface CryptoPortfolioChartProps {
  holdings: Holding[]
  currency: string
}

type ChartPeriod = '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | 'ALL'

export function CryptoPortfolioChart({ holdings, currency }: CryptoPortfolioChartProps) {
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

  const cryptoHoldings = useMemo(() => {
    return holdings.filter(h => h.assetType === 'crypto')
  }, [holdings])

  useEffect(() => {
    if (cryptoHoldings.length === 0) {
      setLoading(false)
      setChartData(null)
      return
    }

    const loadChartData = async () => {
      setLoading(true)
      try {
        // Fetch historical data for all crypto holdings in parallel (optimized)
        const historicalDataMap = new Map<string, BinanceHistoricalDataPoint[]>()
        
        // Fetch all holdings in parallel instead of sequentially
        const fetchPromises = cryptoHoldings.map(async (holding) => {
          try {
            const binanceSymbol = parseSymbolToBinance(holding.symbol)
            const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
            const response = await deduplicatedFetch(`/api/historical-data?assetType=crypto&symbol=${encodeURIComponent(binanceSymbol)}`)
            if (response.ok) {
              const apiData = await response.json()
              const dbRecords = apiData.data || []
              if (dbRecords && dbRecords.length > 0) {
                // Convert database records to Binance format
                const { dbRecordToBinance } = await import('@/lib/portfolio/db-to-chart-format')
                const data: BinanceHistoricalDataPoint[] = dbRecords.map(dbRecordToBinance)
                    return { symbol: holding.symbol, data }
                  }
            } else {
              console.error(`[Crypto Chart] API error for ${holding.symbol}: ${response.status}`)
            }
          } catch (error) {
            console.error(`[Crypto Chart] Error fetching historical data for ${holding.symbol}:`, error)
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
        const purchaseDates = cryptoHoldings.map(h => new Date(h.purchaseDate))
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
        const startDate = periodStartDate > earliestPurchaseDate ? periodStartDate : earliestPurchaseDate

        // Get all unique dates from all holdings, but only include dates on or after the earliest purchase date
        const allDates = new Set<string>()
        historicalDataMap.forEach(data => {
          data.forEach(point => {
            const pointDate = new Date(point.date)
            if (pointDate >= startDate && pointDate >= earliestPurchaseDate) {
              allDates.add(point.date)
            }
          })
        })

        // Sort dates chronologically (oldest first)
        const sortedDates = Array.from(allDates).sort((a, b) => a.localeCompare(b))
        
        // Ensure we start from at least the earliest purchase date
        if (sortedDates.length > 0 && sortedDates[0] < earliestPurchaseDate.toISOString().split('T')[0]) {
          const filteredDates = sortedDates.filter(date => date >= earliestPurchaseDate.toISOString().split('T')[0])
          sortedDates.length = 0
          sortedDates.push(...filteredDates)
        }

        // Calculate portfolio value for each date
        const portfolioValues: number[] = []
        
        for (const date of sortedDates) {
          const dateObj = new Date(date)
          let totalValue = 0
          
          for (const holding of cryptoHoldings) {
            const purchaseDate = new Date(holding.purchaseDate)
            
            // Only include this holding if the date is on or after the purchase date
            if (dateObj >= purchaseDate) {
              const data = historicalDataMap.get(holding.symbol)
              if (data) {
                // Find price for this date (data is sorted oldest first)
                let datePoint = data.find(d => d.date === date)
                
                if (!datePoint) {
                  // Find closest date before (or equal to) the target date
                  const beforeDates = data.filter(d => d.date <= date)
                  if (beforeDates.length > 0) {
                    // Get the last one (closest before date)
                    datePoint = beforeDates[beforeDates.length - 1]
                  }
                }
                
                if (datePoint) {
                  totalValue += holding.quantity * datePoint.close // Close price
                } else {
                  // If no historical data for this date, use current price as fallback
                  totalValue += holding.quantity * holding.currentPrice
                }
              } else {
                // If no historical data at all, use current price
                totalValue += holding.quantity * holding.currentPrice
              }
            }
          }
          
          portfolioValues.push(totalValue)
        }

        // Create chart data
        setChartData({
          labels: sortedDates.map(date => {
            const d = new Date(date)
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: chartPeriod === 'ALL' ? 'numeric' : undefined })
          }),
          datasets: [
            {
              label: 'Portfolio Value',
              data: portfolioValues,
              borderColor: colors.primary || '#f59e0b',
              backgroundColor: (colors.primary || '#f59e0b') + '20',
              fill: true,
            },
          ],
        })
      } catch (error) {
        console.error('Error loading chart data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadChartData()
  }, [cryptoHoldings, chartPeriod, colors.primary])

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
            return `Value: ${formatCurrency(value, currency)}`
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
            if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M ${currency}`
            if (num >= 1000) return `${(num / 1000).toFixed(1)}K ${currency}`
            return `${num.toFixed(0)} ${currency}`
          },
        },
      },
    },
  }), [colors, currency])

  // Don't render anything if there are no crypto holdings
  if (cryptoHoldings.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Crypto Portfolio Performance</CardTitle>
            <CardDescription>Historical portfolio value over time</CardDescription>
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

