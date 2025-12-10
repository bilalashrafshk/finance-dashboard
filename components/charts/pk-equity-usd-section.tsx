"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Loader2, TrendingUp, TrendingDown, DollarSign } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Line } from "react-chartjs-2"
import { ChartPeriod, filterDataByTimeFrame, getDefaultPeriod, DateRange } from "@/lib/charts/time-frame-filter"
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
import { format } from "date-fns"
import { getThemeColors } from "@/lib/charts/theme-colors"
import { useTheme } from "next-themes"

// Register Chart.js components
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

interface StockInfo {
  symbol: string
  name: string
  sector?: string
  industry?: string
}

interface PriceDataPoint {
  date: string
  close: number
}

interface ExchangeRateData {
  date: string
  value: number
}

interface CombinedDataPoint {
  date: string
  pricePKR: number
  exchangeRate: number
  priceUSD: number
}

const SERIES_KEY = 'TS_GP_ER_FAERPKR_M.E00220'

export function PKEquityUSDSection() {
  const { theme } = useTheme()
  const colors = getThemeColors()
  const { toast } = useToast()

  // Asset selection
  const [pkStocks, setPkStocks] = useState<StockInfo[]>([])
  const [loadingStocks, setLoadingStocks] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState<string>('')
  const [selectedAssetName, setSelectedAssetName] = useState<string>('')
  const [assetType, setAssetType] = useState<'equity' | 'index'>('equity')

  // Time frame selection
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>(getDefaultPeriod('daily'))
  const [customRange, setCustomRange] = useState<DateRange>({ startDate: null, endDate: null })

  // Frequency selection
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily')

  // Data
  const [allCombinedData, setAllCombinedData] = useState<CombinedDataPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cache for exchange rate data (doesn't change often)
  const exchangeRateCacheRef = useRef<{
    data: ExchangeRateData[]
    map: Map<string, number>
    timestamp: number
  } | null>(null)

  const EXCHANGE_RATE_CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

  // Load PK stocks on mount
  useEffect(() => {
    loadPkStocks()
  }, [])

  const loadPkStocks = async () => {
    try {
      setLoadingStocks(true)
      const response = await fetch('/api/screener/stocks')
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          const stocks = data.stocks || []
          // Add KSE100 as an option
          const stocksWithKSE100 = [
            { symbol: 'KSE100', name: 'KSE 100 Index', sector: 'Index', industry: 'Index' },
            ...stocks
          ]
          setPkStocks(stocksWithKSE100)
        }
      }
    } catch (error) {
      // Silently handle error - user will see empty dropdown
    } finally {
      setLoadingStocks(false)
    }
  }

  // Helper function to get week number (memoized)
  const getWeekNumber = useCallback((date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  }, [])

  // Aggregate data by frequency (memoized)
  const aggregateByFrequency = useCallback((data: CombinedDataPoint[], freq: 'daily' | 'weekly' | 'monthly'): CombinedDataPoint[] => {
    if (freq === 'daily' || data.length === 0) {
      return data
    }

    const aggregated: CombinedDataPoint[] = []
    const grouped = new Map<string, CombinedDataPoint[]>()

    // Group data points
    for (const point of data) {
      const date = new Date(point.date)
      let key: string

      if (freq === 'weekly') {
        // Get the start of the week (Monday = 1, Sunday = 0)
        const weekStart = new Date(date)
        const day = weekStart.getDay()
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1) // Adjust to Monday
        weekStart.setDate(diff)
        weekStart.setHours(0, 0, 0, 0)
        // Use year and week number
        const year = weekStart.getFullYear()
        const weekNum = getWeekNumber(weekStart)
        key = `${year}-W${String(weekNum).padStart(2, '0')}`
      } else if (freq === 'monthly') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      } else {
        key = point.date
      }

      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(point)
    }

    // For each group, take the last data point (most recent)
    for (const points of grouped.values()) {
      // Sort by date and take the last one
      if (points.length > 0) {
        const sorted = points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        aggregated.push(sorted[sorted.length - 1])
      }
    }

    // Sort aggregated data by date
    return aggregated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [getWeekNumber])

  // Load exchange rate data with caching
  const loadExchangeRateData = useCallback(async (): Promise<Map<string, number>> => {
    const now = Date.now()

    // Check cache
    if (exchangeRateCacheRef.current &&
      (now - exchangeRateCacheRef.current.timestamp) < EXCHANGE_RATE_CACHE_DURATION) {
      return exchangeRateCacheRef.current.map
    }

    // Fetch exchange rate data
    const exchangeResponse = await fetch(`/api/sbp/economic-data?seriesKey=${encodeURIComponent(SERIES_KEY)}`)
    if (!exchangeResponse.ok) {
      throw new Error('Failed to fetch exchange rate data')
    }
    const exchangeResult = await exchangeResponse.json()
    const exchangeData: ExchangeRateData[] = exchangeResult.data || []

    if (exchangeData.length === 0) {
      throw new Error('No exchange rate data available')
    }

    // Sort exchange data by date
    const sortedExchangeData = [...exchangeData].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Create a map of exchange rates by month (YYYY-MM format)
    const exchangeRateMap = new Map<string, number>()
    for (const item of sortedExchangeData) {
      const date = new Date(item.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      // Store the latest exchange rate for each month
      exchangeRateMap.set(monthKey, item.value)
    }

    // Update cache
    exchangeRateCacheRef.current = {
      data: sortedExchangeData,
      map: exchangeRateMap,
      timestamp: now
    }

    return exchangeRateMap
  }, [])

  // Load data when symbol changes
  useEffect(() => {
    if (!selectedSymbol) {
      setAllCombinedData([])
      return
    }

    let cancelled = false

    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Determine if it's an index or equity
        const isIndex = selectedSymbol === 'KSE100'
        setAssetType(isIndex ? 'index' : 'equity')

        // Fetch price data - fetch all available data from 1970 onwards to ensure we get all historical data
        // Time frame filter will handle filtering on client side
        let priceData: PriceDataPoint[] = []
        if (isIndex) {
          const priceResponse = await fetch(`/api/indices/price?symbol=KSE100&startDate=1970-01-01&endDate=${format(new Date(), 'yyyy-MM-dd')}`)
          if (!priceResponse.ok) {
            throw new Error('Failed to fetch index price data')
          }
          const priceResult = await priceResponse.json()
          priceData = priceResult.data || []
        } else {
          const priceResponse = await fetch(`/api/market/price?type=pk-equity&symbol=${selectedSymbol}&startDate=1970-01-01&endDate=${format(new Date(), 'yyyy-MM-dd')}`)
          if (!priceResponse.ok) {
            throw new Error('Failed to fetch equity price data')
          }
          const priceResult = await priceResponse.json()
          priceData = priceResult.data || []
        }

        if (cancelled) return

        if (priceData.length === 0) {
          throw new Error('No price data available for selected asset')
        }

        // Load exchange rate data (with caching)
        const exchangeRateMap = await loadExchangeRateData()

        if (cancelled) return

        // Combine price data with exchange rates
        const combined: CombinedDataPoint[] = []
        for (const pricePoint of priceData) {
          const priceDate = new Date(pricePoint.date)
          const monthKey = `${priceDate.getFullYear()}-${String(priceDate.getMonth() + 1).padStart(2, '0')}`

          // Find the exchange rate for this month (or closest previous month)
          let exchangeRate: number | null = null
          if (exchangeRateMap.has(monthKey)) {
            exchangeRate = exchangeRateMap.get(monthKey)!
          } else {
            // Find closest previous month's exchange rate
            for (let i = 1; i <= 12; i++) {
              const checkDate = new Date(priceDate)
              checkDate.setMonth(checkDate.getMonth() - i)
              const checkKey = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}`
              if (exchangeRateMap.has(checkKey)) {
                exchangeRate = exchangeRateMap.get(checkKey)!
                break
              }
            }
          }

          if (exchangeRate !== null) {
            combined.push({
              date: pricePoint.date,
              pricePKR: pricePoint.close,
              exchangeRate: exchangeRate,
              priceUSD: pricePoint.close / exchangeRate,
            })
          }
        }

        if (cancelled) return

        // Sort by date
        combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

        setAllCombinedData(combined)
      } catch (err: any) {
        if (cancelled) return
        const errorMessage = err.message || 'Failed to load data'
        setError(errorMessage)
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        })
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      cancelled = true
    }
  }, [selectedSymbol, loadExchangeRateData, toast])


  // Filter data based on selected time frame and aggregate by frequency
  const data = useMemo(() => {
    if (allCombinedData.length === 0) return []
    const filtered = filterDataByTimeFrame(allCombinedData, chartPeriod, customRange)
    return aggregateByFrequency(filtered, frequency)
  }, [allCombinedData, chartPeriod, customRange, frequency, aggregateByFrequency])

  // Prepare chart data
  const chartData = useMemo(() => {
    if (data.length === 0) {
      return null
    }

    // Format labels based on frequency
    const formatLabel = (date: string) => {
      const d = new Date(date)
      if (frequency === 'monthly') {
        return format(d, 'MMM yyyy')
      } else if (frequency === 'weekly') {
        return format(d, 'MMM dd, yyyy')
      } else {
        return format(d, 'MMM dd, yyyy')
      }
    }

    return {
      labels: data.map(d => formatLabel(d.date)),
      datasets: [
        {
          label: `${selectedAssetName || selectedSymbol} (USD)`,
          data: data.map(d => d.priceUSD),
          borderColor: colors.price || 'rgb(59, 130, 246)',
          backgroundColor: `${colors.price || 'rgb(59, 130, 246)'}20`,
          fill: true,
          tension: 0.4,
          pointRadius: frequency === 'daily' ? 2 : 4,
          pointHoverRadius: frequency === 'daily' ? 5 : 7,
        },
      ],
    }
  }, [data, colors, selectedAssetName, selectedSymbol, frequency])

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: colors.foreground,
        },
      },
      title: {
        display: true,
        text: `${selectedAssetName || selectedSymbol} Price in USD`,
        font: {
          size: 16,
          weight: 'bold' as const,
        },
        color: colors.foreground,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: colors.background,
        titleColor: colors.foreground,
        bodyColor: colors.foreground,
        borderColor: colors.border,
        borderWidth: 1,
        callbacks: {
          label: function (context: any) {
            const dataPoint = data[context.dataIndex]
            return [
              `USD: $${context.parsed.y.toFixed(4)}`,
              `PKR: PKR ${dataPoint.pricePKR.toFixed(2)}`,
              `Exchange Rate: PKR ${dataPoint.exchangeRate.toFixed(2)}/USD`,
            ]
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
          color: colors.foreground,
        },
        ticks: {
          color: colors.foreground,
          maxRotation: 45,
          minRotation: 45,
        },
        grid: {
          color: colors.grid,
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Price (USD)',
          color: colors.foreground,
        },
        ticks: {
          color: colors.foreground,
          callback: function (value: any) {
            return typeof value === 'number' ? `$${value.toFixed(2)}` : value
          },
        },
        grid: {
          color: colors.grid,
        },
      },
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
  }), [colors, theme, data, selectedAssetName, selectedSymbol])

  // Calculate change
  const latestValue = data.length > 0 ? data[data.length - 1].priceUSD : null
  const previousValue = data.length > 1 ? data[data.length - 2].priceUSD : null
  const change = latestValue !== null && previousValue !== null ? latestValue - previousValue : null
  const changePercent = change !== null && previousValue !== null && previousValue !== 0
    ? (change / previousValue) * 100
    : null

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>PK Equity/Index Price in USD</CardTitle>
          <CardDescription>
            Convert any Pakistan equity or index price from PKR to USD using historical exchange rates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Asset Selection */}
          <div className="space-y-4">
            {loadingStocks ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading assets...
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="asset-select">Select Asset</Label>
                <Select
                  value={selectedSymbol}
                  onValueChange={(value) => {
                    setSelectedSymbol(value)
                    const stock = pkStocks.find(s => s.symbol === value)
                    setSelectedAssetName(stock ? `${stock.name} (${stock.symbol})` : value)
                  }}
                >
                  <SelectTrigger id="asset-select">
                    <SelectValue placeholder="Select a PK equity or index" />
                  </SelectTrigger>
                  <SelectContent>
                    {pkStocks.map((stock) => (
                      <SelectItem key={stock.symbol} value={stock.symbol}>
                        {stock.symbol} - {stock.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Time Frame and Frequency Selectors */}
          {selectedSymbol && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="time-frame">Time Frame</Label>
                  <Select value={chartPeriod} onValueChange={(value) => {
                    setChartPeriod(value as ChartPeriod)
                    if (value !== 'CUSTOM') {
                      setCustomRange({ startDate: null, endDate: null })
                    }
                  }}>
                    <SelectTrigger id="time-frame">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1M">Last 1 Month</SelectItem>
                      <SelectItem value="3M">Last 3 Months</SelectItem>
                      <SelectItem value="6M">Last 6 Months</SelectItem>
                      <SelectItem value="1Y">Last 1 Year</SelectItem>
                      <SelectItem value="2Y">Last 2 Years</SelectItem>
                      <SelectItem value="5Y">Last 5 Years</SelectItem>
                      <SelectItem value="ALL">All Time</SelectItem>
                      <SelectItem value="CUSTOM">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="frequency">Frequency</Label>
                  <Select value={frequency} onValueChange={(value) => setFrequency(value as 'daily' | 'weekly' | 'monthly')}>
                    <SelectTrigger id="frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {chartPeriod === 'CUSTOM' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start-date">Start Date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={customRange.startDate || ''}
                      onChange={(e) => setCustomRange({ ...customRange, startDate: e.target.value || null })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end-date">End Date</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={customRange.endDate || ''}
                      onChange={(e) => setCustomRange({ ...customRange, endDate: e.target.value || null })}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Current Value Display */}
          {latestValue !== null && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Current Price (USD)</div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  ${latestValue.toFixed(4)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data.length > 0 ? format(new Date(data[data.length - 1].date), 'MMM dd, yyyy') : 'N/A'}
                </div>
              </div>
              {change !== null && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Change</div>
                  <div className={`text-2xl font-bold mt-1 flex items-center gap-2 ${change >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                    {change >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    {change > 0 ? '+' : ''}${change.toFixed(4)}
                  </div>
                  {changePercent !== null && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {changePercent > 0 ? '+' : ''}{changePercent.toFixed(2)}% from previous
                    </div>
                  )}
                </div>
              )}
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Data Points</div>
                <div className="text-2xl font-bold mt-1">{data.length}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data.length > 0 && (
                    <>
                      PKR: {data[data.length - 1].pricePKR.toFixed(2)} @ {data[data.length - 1].exchangeRate.toFixed(2)}/USD
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Chart */}
          {!selectedSymbol ? (
            <div className="flex items-center justify-center h-[500px] border rounded-lg bg-muted/10">
              <div className="text-center text-muted-foreground">
                <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Select an asset to view its price in USD</p>
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-[500px] border rounded-lg bg-muted/10">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p>Loading data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-[500px] border rounded-lg bg-destructive/10">
              <div className="text-center text-destructive">
                <p className="font-medium">Error loading data</p>
                <p className="text-sm mt-2">{error}</p>
              </div>
            </div>
          ) : !chartData ? (
            <div className="flex items-center justify-center h-[500px] border rounded-lg bg-muted/10">
              <div className="text-center text-muted-foreground">
                <p>No data available</p>
              </div>
            </div>
          ) : (
            <div className="h-[500px] w-full">
              <Line data={chartData} options={chartOptions} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

