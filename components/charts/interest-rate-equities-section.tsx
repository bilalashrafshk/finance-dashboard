"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Search, TrendingUp } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
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
import { format } from "date-fns"
import { calculateEffectiveRates } from "@/lib/portfolio/sbp-interest-rate-calculator"
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

interface InterestRateData {
  date: string
  value: number
}

type ChartPeriod = '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | 'ALL'

const SERIES_KEYS = {
  target: 'TS_GP_IR_SIRPR_AH.SBPOL0030',
  reverseRepo: 'TS_GP_IR_SIRPR_AH.SBPOL0010', // ceiling
  repo: 'TS_GP_IR_SIRPR_AH.SBPOL0020', // floor
}

export function InterestRateEquitiesSection() {
  const { theme } = useTheme()
  const colors = getThemeColors()
  const { toast } = useToast()
  
  // Asset selection
  const [searchQuery, setSearchQuery] = useState('')
  const [pkStocks, setPkStocks] = useState<StockInfo[]>([])
  const [loadingStocks, setLoadingStocks] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState<string>('')
  const [selectedAssetName, setSelectedAssetName] = useState<string>('')
  
  // Time frame
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1Y')
  
  // Data
  const [allPriceData, setAllPriceData] = useState<PriceDataPoint[]>([])
  const [allInterestRateData, setAllInterestRateData] = useState<InterestRateData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      console.error('Error loading PK stocks:', error)
    } finally {
      setLoadingStocks(false)
    }
  }

  // Filter stocks by search
  const filteredStocks = useMemo(() => {
    if (!searchQuery.trim()) {
      return pkStocks.slice(0, 20)
    }
    
    const query = searchQuery.toLowerCase()
    return pkStocks.filter(stock =>
      stock.symbol.toLowerCase().includes(query) ||
      stock.name.toLowerCase().includes(query)
    ).slice(0, 20)
  }, [pkStocks, searchQuery])

  // Load chart data when symbol is selected
  useEffect(() => {
    if (selectedSymbol) {
      loadChartData()
    } else {
      setAllPriceData([])
      setAllInterestRateData([])
    }
  }, [selectedSymbol])

  const loadChartData = async () => {
    if (!selectedSymbol) return

    try {
      setLoading(true)
      setError(null)

      // Determine asset type
      const assetType = selectedSymbol === 'KSE100' ? 'kse100' : 'pk-equity'
      const symbol = selectedSymbol === 'KSE100' ? 'KSE100' : selectedSymbol

      // Fetch price data
      const priceResponse = await fetch(
        `/api/historical-data?assetType=${assetType}&symbol=${encodeURIComponent(symbol)}&market=PSX`
      )

      if (!priceResponse.ok) {
        throw new Error('Failed to fetch price data')
      }

      const priceResult = await priceResponse.json()
      const prices: PriceDataPoint[] = (priceResult.data || [])
        .map((r: any) => ({
          date: r.date,
          close: parseFloat(r.close)
        }))
        .filter((p: PriceDataPoint) => !isNaN(p.close))
        .sort((a: PriceDataPoint, b: PriceDataPoint) => a.date.localeCompare(b.date))

      // Fetch all three interest rate series
      const [targetResponse, reverseRepoResponse, repoResponse] = await Promise.all([
        fetch(`/api/sbp/interest-rates?seriesKey=${SERIES_KEYS.target}`),
        fetch(`/api/sbp/interest-rates?seriesKey=${SERIES_KEYS.reverseRepo}`),
        fetch(`/api/sbp/interest-rates?seriesKey=${SERIES_KEYS.repo}`),
      ])

      if (!targetResponse.ok || !reverseRepoResponse.ok || !repoResponse.ok) {
        throw new Error('Failed to fetch interest rate data')
      }

      const targetData = await targetResponse.json()
      const reverseRepoData = await reverseRepoResponse.json()
      const repoData = await repoResponse.json()

      // Calculate effective interest rates
      const effectiveRates = calculateEffectiveRates(
        (targetData.data || []).map((d: any) => ({ date: d.date, value: d.value })),
        (reverseRepoData.data || []).map((d: any) => ({ date: d.date, value: d.value })),
        (repoData.data || []).map((d: any) => ({ date: d.date, value: d.value }))
      )

      setAllPriceData(prices)
      setAllInterestRateData(effectiveRates.map(r => ({ date: r.date, value: r.rate })))
    } catch (err: any) {
      console.error('Error loading chart data:', err)
      setError(err.message || 'Failed to load chart data')
      toast({
        title: "Error",
        description: err.message || 'Failed to load chart data',
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Filter data based on selected time frame
  const { priceData, interestRateData } = useMemo(() => {
    if (allPriceData.length === 0 || allInterestRateData.length === 0) {
      return { priceData: [], interestRateData: [] }
    }

    const now = new Date()
    const periodCutoffs: Record<ChartPeriod, Date> = {
      '1M': new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
      '3M': new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()),
      '6M': new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
      '1Y': new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
      '2Y': new Date(now.getFullYear() - 2, now.getMonth(), now.getDate()),
      '5Y': new Date(now.getFullYear() - 5, now.getMonth(), now.getDate()),
      'ALL': new Date(0),
    }

    const cutoffDate = periodCutoffs[chartPeriod]
    
    const filteredPrices = allPriceData.filter(point => {
      const pointDate = new Date(point.date)
      return pointDate >= cutoffDate
    })

    const filteredRates = allInterestRateData.filter(point => {
      const pointDate = new Date(point.date)
      return pointDate >= cutoffDate
    })

    return {
      priceData: filteredPrices,
      interestRateData: filteredRates
    }
  }, [allPriceData, allInterestRateData, chartPeriod])

  // Prepare chart data
  const chartData = useMemo(() => {
    if (priceData.length === 0 || interestRateData.length === 0) {
      return null
    }

    // Align data by date - use price dates as base
    // Interest rates are "as-needed" (not daily), so we forward-fill the rate until next change
    const priceDates = priceData.map(p => p.date)
    const sortedRates = [...interestRateData].sort((a, b) => a.date.localeCompare(b.date))
    
    // Create aligned rates: for each price date, use the most recent interest rate
    const alignedRates = priceDates.map(date => {
      // Find the most recent interest rate that is <= current price date
      let latestRate: number | null = null
      
      for (let i = sortedRates.length - 1; i >= 0; i--) {
        if (sortedRates[i].date <= date) {
          latestRate = sortedRates[i].value
          break
        }
      }
      
      return latestRate
    })

    return {
      labels: priceDates.map(d => format(new Date(d), 'MMM dd, yyyy')),
      datasets: [
        {
          label: selectedSymbol,
          data: priceData.map(p => p.close),
          borderColor: colors.price || 'rgb(59, 130, 246)',
          backgroundColor: `${colors.price || 'rgb(59, 130, 246)'}20`,
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5,
          yAxisID: 'y',
        },
        {
          label: 'SBP Interest Rate',
          data: alignedRates,
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5,
          borderDash: [5, 5],
          yAxisID: 'y1',
        },
      ],
    }
  }, [priceData, interestRateData, selectedSymbol, colors, theme])

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
        text: `${selectedSymbol} Price vs SBP Interest Rate`,
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
          label: (context: any) => {
            const value = context.parsed.y
            if (value === null || value === undefined) return ''
            
            if (context.datasetIndex === 0) {
              // Price data
              return `${context.dataset.label}: PKR ${value.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            } else {
              // Interest rate
              return `${context.dataset.label}: ${value.toFixed(2)}%`
            }
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
        type: 'linear' as const,
        position: 'left' as const,
        display: true,
        title: {
          display: true,
          text: `${selectedSymbol} Price (PKR)`,
          color: colors.price || colors.foreground,
        },
        ticks: {
          color: colors.price || colors.foreground,
          callback: function(value: any) {
            return typeof value === 'number' ? value.toLocaleString('en-PK', { maximumFractionDigits: 0 }) : value
          },
        },
        grid: {
          color: colors.grid,
        },
      },
      y1: {
        type: 'linear' as const,
        position: 'right' as const,
        display: true,
        title: {
          display: true,
          text: 'Interest Rate (%)',
          color: 'rgb(239, 68, 68)',
        },
        ticks: {
          color: 'rgb(239, 68, 68)',
          callback: function(value: any) {
            return typeof value === 'number' ? `${value.toFixed(1)}%` : value
          },
        },
        grid: {
          drawOnChartArea: false, // Only draw grid for left axis
        },
      },
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
  }), [selectedSymbol, colors, theme])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Interest Rate and Equities</CardTitle>
          <CardDescription>
            Compare PK equity prices with SBP interest rates over time
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Asset Selector */}
            <div className="space-y-2">
              <Label htmlFor="asset-search">Select PK Equity or KSE100</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="asset-search"
                  placeholder="Search for stock symbol or name (e.g., PTC, HBL, KSE100)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              {/* Search Results */}
              {searchQuery && filteredStocks.length > 0 && (
                <div className="border rounded-lg max-h-60 overflow-y-auto">
                  {filteredStocks.map((stock) => (
                    <button
                      key={stock.symbol}
                      onClick={() => {
                        setSelectedSymbol(stock.symbol)
                        setSelectedAssetName(stock.name)
                        setSearchQuery('')
                      }}
                      className={`w-full text-left px-4 py-2 hover:bg-muted transition-colors ${
                        selectedSymbol === stock.symbol ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="font-medium">{stock.symbol}</div>
                      <div className="text-sm text-muted-foreground">{stock.name}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* Selected Asset */}
              {selectedSymbol && (
                <div className="p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{selectedSymbol}</div>
                      <div className="text-sm text-muted-foreground">{selectedAssetName}</div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedSymbol('')
                        setSelectedAssetName('')
                        setAllPriceData([])
                        setAllInterestRateData([])
                      }}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Time Frame Selector */}
            <div className="space-y-2">
              <Label htmlFor="time-frame">Time Frame</Label>
              <Select value={chartPeriod} onValueChange={(value) => setChartPeriod(value as ChartPeriod)}>
                <SelectTrigger id="time-frame">
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
          </div>

          {/* Chart */}
          {loading ? (
            <div className="flex items-center justify-center h-[500px] border rounded-lg bg-muted/10">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p>Loading chart data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-[500px] border rounded-lg bg-destructive/10">
              <div className="text-center text-destructive">
                <p className="font-medium">Error loading data</p>
                <p className="text-sm mt-2">{error}</p>
              </div>
            </div>
          ) : !selectedSymbol ? (
            <div className="flex items-center justify-center h-[500px] border rounded-lg bg-muted/10">
              <div className="text-center text-muted-foreground">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Select an asset to view chart</p>
                <p className="text-sm mt-2">Search for a PK equity or select KSE100</p>
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

