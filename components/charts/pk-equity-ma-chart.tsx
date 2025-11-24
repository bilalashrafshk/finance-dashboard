"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, Plus, X, TrendingUp, TrendingDown } from "lucide-react"
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
import { getThemeColors } from "@/lib/charts/theme-colors"
import { useTheme } from "next-themes"
import {
  resampleData,
  calculateMovingAverage,
  parseMAPeriod,
  generatePeriodString,
  type PriceDataPoint,
  type Frequency,
  type MovingAverageType,
} from "@/lib/charts/moving-averages"

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

interface MovingAverageConfig {
  id: string
  type: MovingAverageType
  periodType: Frequency
  length: number
  enabled: boolean
  color?: string
}

interface PKEquityMAChartProps {
  symbol?: string
}

// Predefined color palette for moving averages
const MA_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
]

export function PKEquityMAChart({ symbol: initialSymbol }: PKEquityMAChartProps) {
  const { theme } = useTheme()
  const colors = getThemeColors()
  const { toast } = useToast()
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol || '')
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingSymbols, setLoadingSymbols] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allData, setAllData] = useState<PriceDataPoint[]>([])
  const [frequency, setFrequency] = useState<Frequency>('daily')
  const [movingAverages, setMovingAverages] = useState<MovingAverageConfig[]>([
    {
      id: '1',
      type: 'SMA',
      periodType: 'daily',
      length: 50,
      enabled: true,
      color: MA_COLORS[0],
    },
    {
      id: '2',
      type: 'SMA',
      periodType: 'daily',
      length: 200,
      enabled: true,
      color: MA_COLORS[1],
    },
  ])

  // Load available PK equity symbols
  useEffect(() => {
    const loadSymbols = async () => {
      setLoadingSymbols(true)
      try {
        const response = await fetch('/api/screener/stocks')
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.stocks) {
            const symbols = data.stocks
              .map((stock: any) => stock.symbol)
              .filter((s: string) => s && s.length > 0)
              .sort() || []
            setAvailableSymbols(symbols)
            if (symbols.length > 0 && !selectedSymbol) {
              setSelectedSymbol(symbols[0])
            }
          }
        }
      } catch (err) {
        console.error('Error loading symbols:', err)
      } finally {
        setLoadingSymbols(false)
      }
    }
    loadSymbols()
  }, [])

  // Load price data
  useEffect(() => {
    if (!selectedSymbol) {
      setAllData([])
      return
    }

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(
          `/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(selectedSymbol)}&market=PSX`
        )
        if (!response.ok) {
          throw new Error('Failed to fetch price data')
        }
        const result = await response.json()
        const priceData: PriceDataPoint[] = (result.data || [])
          .map((record: any) => ({
            date: record.date,
            close: parseFloat(record.close) || 0,
            open: parseFloat(record.open) || parseFloat(record.close) || 0,
            high: parseFloat(record.high) || parseFloat(record.close) || 0,
            low: parseFloat(record.low) || parseFloat(record.close) || 0,
            volume: record.volume ? parseFloat(record.volume) : undefined,
          }))
          .filter((point: PriceDataPoint) => point.close > 0)
          .sort((a: PriceDataPoint, b: PriceDataPoint) => a.date.localeCompare(b.date))

        if (priceData.length === 0) {
          throw new Error('No price data available')
        }

        setAllData(priceData)
      } catch (err: any) {
        setError(err.message || 'Failed to load price data')
        toast({
          title: "Error",
          description: err.message || 'Failed to load price data',
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [selectedSymbol, toast])

  // Resample data based on frequency
  const resampledData = useMemo(() => {
    if (allData.length === 0) return []
    return resampleData(allData, frequency)
  }, [allData, frequency])

  // Calculate moving averages
  const maData = useMemo(() => {
    const maResults: Record<string, number[]> = {}
    movingAverages.forEach((ma) => {
      if (!ma.enabled) return

      // Resample data to the MA period type if different from chart frequency
      let dataForMA = resampledData
      if (ma.periodType !== frequency) {
        // Resample to MA period type
        dataForMA = resampleData(allData, ma.periodType)
      }

      // Calculate the moving average
      const maValues = calculateMovingAverage(dataForMA, ma.type, ma.length)

      // Align with resampledData dates
      const alignedValues: number[] = []
      const maDateMap = new Map<string, number>()
      dataForMA.forEach((point, idx) => {
        if (idx < maValues.length && !isNaN(maValues[idx])) {
          maDateMap.set(point.date, maValues[idx])
        }
      })

      // For each date in resampledData, find the closest MA value
      resampledData.forEach((point) => {
        const pointDate = new Date(point.date)
        let closestValue = NaN
        let closestDateDiff = Infinity

        // Find the closest MA date
        maDateMap.forEach((value, maDate) => {
          const maDateObj = new Date(maDate)
          const diff = Math.abs(pointDate.getTime() - maDateObj.getTime())
          if (diff < closestDateDiff) {
            closestDateDiff = diff
            closestValue = value
          }
        })

        alignedValues.push(closestValue)
      })

      maResults[ma.id] = alignedValues
    })
    return maResults
  }, [resampledData, movingAverages, frequency, allData])

  // Prepare chart data
  const chartData = useMemo(() => {
    if (resampledData.length === 0) {
      return null
    }

    const datasets: any[] = [
      {
        label: `${selectedSymbol} Price`,
        data: resampledData.map(d => d.close),
        borderColor: colors.price || 'rgb(59, 130, 246)',
        backgroundColor: `${colors.price || 'rgb(59, 130, 246)'}20`,
        fill: false,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
    ]

    // Add moving averages
    movingAverages.forEach((ma) => {
      if (!ma.enabled) return
      const values = maData[ma.id] || []
      if (values.length > 0) {
        datasets.push({
          label: `${ma.type} ${generatePeriodString(ma.length, ma.periodType)}`,
          data: values,
          borderColor: ma.color || MA_COLORS[0],
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 1.5,
          borderDash: ma.type === 'EMA' ? [5, 5] : undefined,
        })
      }
    })

    // Format labels based on frequency
    const formatLabel = (dateStr: string) => {
      const date = new Date(dateStr)
      if (frequency === 'daily') {
        return format(date, 'MMM dd, yyyy')
      } else if (frequency === 'weekly') {
        return format(date, 'MMM dd, yyyy')
      } else {
        return format(date, 'MMM yyyy')
      }
    }

    return {
      labels: resampledData.map(d => formatLabel(d.date)),
      datasets,
    }
  }, [resampledData, movingAverages, maData, selectedSymbol, colors])

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: colors.foreground,
          usePointStyle: true,
        },
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
          label: function(context: any) {
            const value = context.parsed.y
            if (isNaN(value)) return `${context.dataset.label}: N/A`
            return `${context.dataset.label}: ${value.toFixed(2)}`
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
          text: 'Price (PKR)',
          color: colors.foreground,
        },
        ticks: {
          color: colors.foreground,
          callback: function(value: any) {
            return typeof value === 'number' ? value.toFixed(2) : value
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
  }), [colors, theme])

  // Calculate current price and change
  const latestPrice = resampledData.length > 0 ? resampledData[resampledData.length - 1].close : null
  const previousPrice = resampledData.length > 1 ? resampledData[resampledData.length - 2].close : null
  const priceChange = latestPrice !== null && previousPrice !== null ? latestPrice - previousPrice : null
  const priceChangePercent = latestPrice !== null && previousPrice !== null && previousPrice !== 0
    ? ((latestPrice - previousPrice) / previousPrice) * 100
    : null

  // Add new moving average
  const addMovingAverage = () => {
    const newId = String(Date.now())
    const usedColors = new Set(movingAverages.map(ma => ma.color))
    const availableColor = MA_COLORS.find(c => !usedColors.has(c)) || MA_COLORS[0]
    
    setMovingAverages([
      ...movingAverages,
      {
        id: newId,
        type: 'SMA',
        periodType: frequency,
        length: 20,
        enabled: true,
        color: availableColor,
      },
    ])
  }

  // Remove moving average
  const removeMovingAverage = (id: string) => {
    setMovingAverages(movingAverages.filter(ma => ma.id !== id))
  }

  // Update moving average
  const updateMovingAverage = (id: string, updates: Partial<MovingAverageConfig>) => {
    setMovingAverages(
      movingAverages.map(ma => ma.id === id ? { ...ma, ...updates } : ma)
    )
  }

  // Parse and set MA period from string input
  const handleMAPeriodInput = (id: string, value: string) => {
    try {
      const { length, periodType } = parseMAPeriod(value)
      updateMovingAverage(id, { length, periodType })
    } catch (err: any) {
      toast({
        title: "Invalid Period Format",
        description: err.message,
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>PK Equity Price Chart with Moving Averages</CardTitle>
          <CardDescription>
            View price charts for Pakistani equities with customizable moving averages
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Symbol Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="symbol">Stock Symbol</Label>
              <Select
                value={selectedSymbol}
                onValueChange={setSelectedSymbol}
                disabled={loadingSymbols}
              >
                <SelectTrigger id="symbol">
                  <SelectValue placeholder={loadingSymbols ? "Loading..." : "Select a symbol"} />
                </SelectTrigger>
                <SelectContent>
                  {availableSymbols.map((sym) => (
                    <SelectItem key={sym} value={sym}>
                      {sym}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Frequency Selection */}
            <div className="space-y-2">
              <Label htmlFor="frequency">Data Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(value) => setFrequency(value as Frequency)}
              >
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

          {/* Current Price Display */}
          {latestPrice !== null && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Current Price</div>
                <div className="text-2xl font-bold mt-1">
                  {latestPrice.toFixed(2)} PKR
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {resampledData.length > 0 && format(new Date(resampledData[resampledData.length - 1].date), 'MMM dd, yyyy')}
                </div>
              </div>
              {priceChange !== null && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Change</div>
                  <div className={`text-2xl font-bold mt-1 flex items-center gap-2 ${
                    priceChange >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {priceChange >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)} PKR
                  </div>
                  {priceChangePercent !== null && (
                    <div className={`text-sm mt-1 ${
                      priceChangePercent >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {priceChangePercent > 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
                    </div>
                  )}
                </div>
              )}
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Data Points</div>
                <div className="text-2xl font-bold mt-1">{resampledData.length}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {frequency} frequency
                </div>
              </div>
            </div>
          )}

          {/* Moving Averages Configuration */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Moving Averages</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addMovingAverage}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add MA
              </Button>
            </div>

            {movingAverages.map((ma) => (
              <div key={ma.id} className="grid grid-cols-1 md:grid-cols-6 gap-4 p-4 border rounded-lg">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ma.enabled}
                    onChange={(e) => updateMovingAverage(ma.id, { enabled: e.target.checked })}
                    className="rounded"
                  />
                  <Label className="text-sm">Enable</Label>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <Select
                    value={ma.type}
                    onValueChange={(value) => updateMovingAverage(ma.id, { type: value as MovingAverageType })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SMA">SMA</SelectItem>
                      <SelectItem value="EMA">EMA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Period (e.g., 20d, 50w, 200d)</Label>
                  <Input
                    type="text"
                    value={generatePeriodString(ma.length, ma.periodType)}
                    onChange={(e) => handleMAPeriodInput(ma.id, e.target.value)}
                    placeholder="20d"
                    className="h-9"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={ma.color || MA_COLORS[0]}
                      onChange={(e) => updateMovingAverage(ma.id, { color: e.target.value })}
                      className="h-9 w-full rounded border"
                    />
                  </div>
                </div>

                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMovingAverage(ma.id)}
                    className="text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
          {loading ? (
            <div className="flex items-center justify-center h-[500px] border rounded-lg bg-muted/10">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p>Loading price data...</p>
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
                <p>Select a symbol to view the chart</p>
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

