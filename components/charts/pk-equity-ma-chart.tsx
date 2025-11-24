"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import type React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Loader2, Plus, X, TrendingUp, TrendingDown, ChevronDown, ChevronUp, RotateCcw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { createChart, IChartApi, ISeriesApi, LineData, Time, LineSeries } from "lightweight-charts"
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

interface MovingAverageConfig {
  id: string
  type: MovingAverageType
  periodType: Frequency
  length: number
  enabled: boolean
  color?: string
}

type AssetType = 'pk-equity' | 'us-equity' | 'crypto' | 'metals' | 'kse100' | 'spx500'

interface PKEquityMAChartProps {
  symbol?: string
  assetType?: AssetType
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

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  'pk-equity': 'PK Equity',
  'us-equity': 'US Equity',
  'crypto': 'Crypto',
  'metals': 'Metals',
  'kse100': 'KSE100 Index',
  'spx500': 'SPX500 Index',
}

// Convert date string to TradingView time format
function dateToTime(dateStr: string): Time {
  const date = new Date(dateStr)
  return date.getTime() / 1000 as Time // TradingView uses Unix timestamp in seconds
}

export function PKEquityMAChart({ symbol: initialSymbol, assetType: initialAssetType }: PKEquityMAChartProps) {
  const { theme } = useTheme()
  const colors = getThemeColors()
  const { toast } = useToast()
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const priceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const maSeriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  
  const [assetType, setAssetType] = useState<AssetType>(initialAssetType || 'pk-equity')
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol || '')
  const [availableSymbols, setAvailableSymbols] = useState<Array<{ symbol: string; name?: string }>>([])
  const [loading, setLoading] = useState(false)
  const [loadingSymbols, setLoadingSymbols] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allData, setAllData] = useState<PriceDataPoint[]>([])
  const [frequency, setFrequency] = useState<Frequency>('daily')
  const [showMASettings, setShowMASettings] = useState(false)
  const [maPeriodInputs, setMaPeriodInputs] = useState<Record<string, string>>({})
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

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return

    // Create chart with theme
    const isDark = theme === 'dark'
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'solid', color: isDark ? colors.background : '#ffffff' },
        textColor: colors.foreground,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: {
        mode: 0, // Normal crosshair
      },
      rightPriceScale: {
        borderColor: colors.border,
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 500,
    })

    chartRef.current = chart

    // Create price series
    const priceSeries = chart.addSeries(LineSeries, {
      color: colors.price || '#3b82f6',
      lineWidth: 2,
      title: selectedSymbol || 'Price',
    })
    priceSeriesRef.current = priceSeries

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        })
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
      priceSeriesRef.current = null
      maSeriesRefs.current.clear()
    }
  }, [theme, colors, selectedSymbol])

  // Load available symbols based on asset type
  useEffect(() => {
    const loadSymbols = async () => {
      setLoadingSymbols(true)
      try {
        let symbols: Array<{ symbol: string; name?: string }> = []

        if (assetType === 'pk-equity') {
          const response = await fetch('/api/screener/stocks')
          if (response.ok) {
            const data = await response.json()
            if (data.success && data.stocks) {
              symbols = data.stocks.map((stock: any) => ({
                symbol: stock.symbol,
                name: stock.name,
              }))
            }
          }
        } else if (assetType === 'us-equity') {
          symbols = []
        } else if (assetType === 'crypto') {
          try {
            const { fetchBinanceSymbols } = await import('@/lib/portfolio/binance-api')
            const binanceSymbols = await fetchBinanceSymbols()
            symbols = binanceSymbols.slice(0, 200).map((sym: string) => ({
              symbol: sym.replace('USDT', ''),
              name: sym.replace('USDT', ''),
            }))
          } catch (err) {
            console.error('Error loading crypto symbols:', err)
          }
        } else if (assetType === 'kse100') {
          symbols = [{ symbol: 'KSE100', name: 'KSE 100 Index' }]
        } else if (assetType === 'spx500') {
          symbols = [{ symbol: 'SPX500', name: 'S&P 500 Index' }]
        } else if (assetType === 'metals') {
          symbols = [
            { symbol: 'GOLD', name: 'Gold' },
            { symbol: 'SILVER', name: 'Silver' },
          ]
        }

        setAvailableSymbols(symbols)
        if (symbols.length > 0 && !selectedSymbol) {
          setSelectedSymbol(symbols[0].symbol)
        } else if (symbols.length === 0) {
          setSelectedSymbol('')
        }
      } catch (err) {
        console.error('Error loading symbols:', err)
      } finally {
        setLoadingSymbols(false)
      }
    }
    loadSymbols()
  }, [assetType])

  // Load price data
  useEffect(() => {
    if (!selectedSymbol || !assetType) {
      setAllData([])
      return
    }

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        let apiUrl = ''

        if (assetType === 'pk-equity') {
          apiUrl = `/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(selectedSymbol)}&market=PSX`
        } else if (assetType === 'us-equity') {
          apiUrl = `/api/historical-data?assetType=us-equity&symbol=${encodeURIComponent(selectedSymbol)}&market=US`
        } else if (assetType === 'crypto') {
          const { parseSymbolToBinance } = await import('@/lib/portfolio/binance-api')
          const binanceSymbol = parseSymbolToBinance(selectedSymbol)
          apiUrl = `/api/historical-data?assetType=crypto&symbol=${encodeURIComponent(binanceSymbol)}`
        } else if (assetType === 'kse100') {
          apiUrl = `/api/historical-data?assetType=kse100&symbol=KSE100`
        } else if (assetType === 'spx500') {
          apiUrl = `/api/historical-data?assetType=spx500&symbol=SPX500`
        } else if (assetType === 'metals') {
          apiUrl = `/api/historical-data?assetType=metals&symbol=${encodeURIComponent(selectedSymbol)}`
        }

        if (!apiUrl) {
          throw new Error('Unsupported asset type')
        }

        const response = await fetch(apiUrl)
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
  }, [selectedSymbol, assetType, toast])

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

      let dataForMA = resampledData
      if (ma.periodType !== frequency) {
        dataForMA = resampleData(allData, ma.periodType)
      }

      const maValues = calculateMovingAverage(dataForMA, ma.type, ma.length)

      if (ma.periodType === frequency) {
        maResults[ma.id] = maValues
      } else {
        const alignedValues: number[] = []
        const maDateMap = new Map<string, number>()
        
        dataForMA.forEach((point, idx) => {
          if (idx < maValues.length && !isNaN(maValues[idx])) {
            maDateMap.set(point.date, maValues[idx])
          }
        })

        const maDates = Array.from(maDateMap.keys()).sort()
        const maDateTimestamps = maDates.map(d => new Date(d).getTime())

        resampledData.forEach((point) => {
          const pointTimestamp = new Date(point.date).getTime()
          
          let left = 0
          let right = maDateTimestamps.length - 1
          let closestIdx = 0
          let minDiff = Infinity

          while (left <= right) {
            const mid = Math.floor((left + right) / 2)
            const diff = Math.abs(maDateTimestamps[mid] - pointTimestamp)
            
            if (diff < minDiff) {
              minDiff = diff
              closestIdx = mid
            }
            
            if (maDateTimestamps[mid] < pointTimestamp) {
              left = mid + 1
            } else {
              right = mid - 1
            }
          }

          alignedValues.push(maDateMap.get(maDates[closestIdx]) ?? NaN)
        })

        maResults[ma.id] = alignedValues
      }
    })
    
    return maResults
  }, [resampledData, movingAverages, frequency, allData])

  // Update chart with data
  useEffect(() => {
    if (!chartRef.current || !priceSeriesRef.current || resampledData.length === 0) return

    // Update price series
    const priceData: LineData[] = resampledData.map(d => ({
      time: dateToTime(d.date),
      value: d.close,
    }))
    priceSeriesRef.current.setData(priceData)

    // Update/create MA series
    movingAverages.forEach((ma) => {
      if (!ma.enabled) {
        // Remove series if disabled
        const existingSeries = maSeriesRefs.current.get(ma.id)
        if (existingSeries && chartRef.current) {
          chartRef.current.removeSeries(existingSeries)
          maSeriesRefs.current.delete(ma.id)
        }
        return
      }

      const values = maData[ma.id]
      if (!values || values.length === 0) return

      const maLineData: LineData[] = resampledData
        .map((d, idx) => ({
          time: dateToTime(d.date),
          value: values[idx] || NaN,
        }))
        .filter(d => !isNaN(d.value))

      if (maLineData.length === 0) return

      let maSeries = maSeriesRefs.current.get(ma.id)
      if (!maSeries && chartRef.current) {
        // Create new series
        maSeries = chartRef.current.addSeries(LineSeries, {
          color: ma.color || MA_COLORS[0],
          lineWidth: 1.5,
          lineStyle: ma.type === 'EMA' ? 1 : 0, // 1 = dashed, 0 = solid
          title: `${ma.type} ${generatePeriodString(ma.length, ma.periodType)}`,
        })
        maSeriesRefs.current.set(ma.id, maSeries)
      }

      if (maSeries) {
        maSeries.setData(maLineData)
      }
    })

    // Remove series that are no longer in movingAverages
    const currentIds = new Set(movingAverages.map(ma => ma.id))
    maSeriesRefs.current.forEach((series, id) => {
      if (!currentIds.has(id) && chartRef.current) {
        chartRef.current.removeSeries(series)
        maSeriesRefs.current.delete(id)
      }
    })

    // Fit content to show all data
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent()
    }
  }, [resampledData, maData, movingAverages])

  // Update chart theme when theme changes
  useEffect(() => {
    if (!chartRef.current) return

    const isDark = theme === 'dark'
    chartRef.current.applyOptions({
      layout: {
        background: { type: 'solid', color: isDark ? colors.background : '#ffffff' },
        textColor: colors.foreground,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: {
        borderColor: colors.border,
      },
      timeScale: {
        borderColor: colors.border,
      },
    })
  }, [theme, colors])

  // Get currency symbol based on asset type
  const getCurrency = () => {
    if (assetType === 'pk-equity' || assetType === 'kse100') return 'PKR'
    if (assetType === 'us-equity' || assetType === 'spx500') return 'USD'
    if (assetType === 'crypto') return 'USD'
    if (assetType === 'metals') return 'USD'
    return 'USD'
  }

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

  // Handle MA period input change
  const handleMAPeriodInputChange = (id: string, value: string) => {
    setMaPeriodInputs(prev => ({ ...prev, [id]: value }))
  }

  // Parse and set MA period when user finishes typing
  const handleMAPeriodInputBlur = (id: string, value: string) => {
    if (!value.trim()) {
      const ma = movingAverages.find(m => m.id === id)
      if (ma) {
        setMaPeriodInputs(prev => ({ ...prev, [id]: generatePeriodString(ma.length, ma.periodType) }))
      }
      return
    }

    try {
      const { length, periodType } = parseMAPeriod(value)
      updateMovingAverage(id, { length, periodType })
      setMaPeriodInputs(prev => ({ ...prev, [id]: generatePeriodString(length, periodType) }))
    } catch (err: any) {
      const ma = movingAverages.find(m => m.id === id)
      if (ma) {
        setMaPeriodInputs(prev => ({ ...prev, [id]: generatePeriodString(ma.length, ma.periodType) }))
        toast({
          title: "Invalid Period Format",
          description: err.message || "Expected format: e.g., 20d, 50w, 200d",
          variant: "destructive",
        })
      }
    }
  }

  // Handle Enter key press
  const handleMAPeriodInputKeyDown = (id: string, value: string, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleMAPeriodInputBlur(id, value)
      ;(e.target as HTMLInputElement).blur()
    }
  }

  // Initialize period inputs when moving averages change
  useEffect(() => {
    const newInputs: Record<string, string> = {}
    movingAverages.forEach(ma => {
      if (!maPeriodInputs[ma.id]) {
        newInputs[ma.id] = generatePeriodString(ma.length, ma.periodType)
      }
    })
    if (Object.keys(newInputs).length > 0) {
      setMaPeriodInputs(prev => ({ ...prev, ...newInputs }))
    }
  }, [movingAverages])

  // Reset zoom function
  const resetZoom = () => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent()
    }
  }

  const currency = getCurrency()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Price Chart with Moving Averages</CardTitle>
            <CardDescription>
              View price charts with customizable moving averages for various asset types
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Asset Type and Symbol Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="asset-type">Asset Type</Label>
              <Select
                value={assetType}
                onValueChange={(value) => setAssetType(value as AssetType)}
              >
                <SelectTrigger id="asset-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pk-equity">PK Equity</SelectItem>
                  <SelectItem value="us-equity">US Equity</SelectItem>
                  <SelectItem value="crypto">Crypto</SelectItem>
                  <SelectItem value="metals">Metals</SelectItem>
                  <SelectItem value="kse100">KSE100 Index</SelectItem>
                  <SelectItem value="spx500">SPX500 Index</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="symbol">Symbol</Label>
              {assetType === 'us-equity' ? (
                <Input
                  id="symbol"
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value.toUpperCase())}
                  placeholder="Enter symbol (e.g., AAPL)"
                  disabled={loadingSymbols}
                />
              ) : (
                <Select
                  value={selectedSymbol}
                  onValueChange={setSelectedSymbol}
                  disabled={loadingSymbols || availableSymbols.length === 0}
                >
                  <SelectTrigger id="symbol">
                    <SelectValue placeholder={loadingSymbols ? "Loading..." : "Select a symbol"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSymbols.map((item) => (
                      <SelectItem key={item.symbol} value={item.symbol}>
                        {item.symbol} {item.name && `(${item.name})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

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
                  {latestPrice.toFixed(currency === 'PKR' ? 2 : 4)} {currency}
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
                    {priceChange > 0 ? '+' : ''}{priceChange.toFixed(currency === 'PKR' ? 2 : 4)} {currency}
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

          {/* Moving Averages Configuration - Collapsible */}
          <Collapsible open={showMASettings} onOpenChange={setShowMASettings}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span>Moving Averages Settings</span>
                {showMASettings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 mt-4">
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
                      value={maPeriodInputs[ma.id] || generatePeriodString(ma.length, ma.periodType)}
                      onChange={(e) => handleMAPeriodInputChange(ma.id, e.target.value)}
                      onBlur={(e) => handleMAPeriodInputBlur(ma.id, e.target.value)}
                      onKeyDown={(e) => handleMAPeriodInputKeyDown(ma.id, e.currentTarget.value, e)}
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
            </CollapsibleContent>
          </Collapsible>

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
          ) : resampledData.length === 0 ? (
            <div className="flex items-center justify-center h-[500px] border rounded-lg bg-muted/10">
              <div className="text-center text-muted-foreground">
                <p>Select a symbol to view the chart</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-4 flex-wrap">
                <span>💡 <strong>Scroll</strong> to zoom in/out</span>
                <span>🖱️ <strong>Click & drag</strong> to pan</span>
                <span>⌨️ <strong>Ctrl + drag</strong> to zoom (box selection)</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetZoom}
                  className="h-6 text-xs"
                  title="Reset zoom to show all data"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              </div>
              <div ref={chartContainerRef} className="h-[500px] w-full" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
