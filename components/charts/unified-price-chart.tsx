"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Loader2, Plus, X, TrendingUp, TrendingDown, ChevronDown, ChevronUp, Search, Settings2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { createChart, IChartApi, ISeriesApi, LineData, Time, LineSeries, PriceScaleMode, ColorType } from "lightweight-charts"
import { format } from "date-fns"
import { getThemeColors } from "@/lib/charts/theme-colors"
import { useTheme } from "next-themes"
import {
    resampleData,
    calculateMovingAverage,
    type PriceDataPoint,
    type Frequency,
    type MovingAverageType,
} from "@/lib/charts/moving-averages"
import {
    calculateDividendAdjustedPrices,
    type DividendRecord
} from "@/lib/asset-screener/dividend-adjusted-prices"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface MovingAverageConfig {
    id: string
    type: MovingAverageType
    input: string // e.g., "50", "50d", "20w"
    enabled: boolean
    color?: string
}

type AssetType = 'pk-equity' | 'us-equity' | 'crypto' | 'metals' | 'kse100' | 'spx500'
type TimeRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'ALL'

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

// Convert date string to TradingView time format
function dateToTime(dateStr: string): Time {
    const date = new Date(dateStr)
    return date.getTime() / 1000 as Time // TradingView uses Unix timestamp in seconds
}

function parseMAInput(input: string, defaultFrequency: Frequency): { length: number, period: Frequency } | null {
    const match = input.trim().match(/^(\d+)([dwmDWM]?)$/)
    if (!match) return null

    const length = parseInt(match[1])
    if (isNaN(length) || length <= 0) return null

    const periodChar = match[2].toLowerCase()
    let period: Frequency = defaultFrequency

    if (periodChar === 'd') period = 'daily'
    else if (periodChar === 'w') period = 'weekly'
    else if (periodChar === 'm') period = 'monthly'

    return { length, period }
}

function filterDataByRange(data: PriceDataPoint[], range: TimeRange): PriceDataPoint[] {
    if (range === 'ALL' || data.length === 0) return data

    const now = new Date()
    let startDate = new Date()

    switch (range) {
        case '1M': startDate.setMonth(now.getMonth() - 1); break;
        case '3M': startDate.setMonth(now.getMonth() - 3); break;
        case '6M': startDate.setMonth(now.getMonth() - 6); break;
        case 'YTD': startDate = new Date(now.getFullYear(), 0, 1); break;
        case '1Y': startDate.setFullYear(now.getFullYear() - 1); break;
        case '3Y': startDate.setFullYear(now.getFullYear() - 3); break;
        case '5Y': startDate.setFullYear(now.getFullYear() - 5); break;
    }

    return data.filter(d => new Date(d.date) >= startDate)
}

export function UnifiedPriceChart() {
    const { theme } = useTheme()
    const colors = useMemo(() => getThemeColors(), [theme])
    const { toast } = useToast()
    const chartContainerRef = useRef<HTMLDivElement>(null)
    const chartRef = useRef<IChartApi | null>(null)
    const priceSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
    const comparisonSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
    const maSeriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())

    // Data Ref for Legend Calculations
    const currentDataRef = useRef<{
        price: LineData[],
        comparison: LineData[],
        mas: Map<string, LineData[]>
    }>({ price: [], comparison: [], mas: new Map() })
    // State
    const [assetType, setAssetType] = useState<AssetType>('pk-equity')
    const [selectedSymbol, setSelectedSymbol] = useState<string>('')
    const [availableSymbols, setAvailableSymbols] = useState<Array<{ symbol: string; name?: string }>>([])
    const [loading, setLoading] = useState(false)
    const [loadingSymbols, setLoadingSymbols] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [allData, setAllData] = useState<PriceDataPoint[]>([])
    const [frequency, setFrequency] = useState<Frequency>('daily')
    const [timeRange, setTimeRange] = useState<TimeRange>('1Y')

    // Chart Settings
    const [useLogScale, setUseLogScale] = useState(false)
    const [showTotalReturn, setShowTotalReturn] = useState(false)
    const [showComparison, setShowComparison] = useState(false)
    const [showSettings, setShowSettings] = useState(false)

    // Search State
    const [openCombobox, setOpenCombobox] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")

    // Moving Averages
    const [movingAverages, setMovingAverages] = useState<MovingAverageConfig[]>([])

    // Load MAs from session storage on mount
    useEffect(() => {
        const savedMAs = sessionStorage.getItem('chart_moving_averages')
        if (savedMAs) {
            try {
                setMovingAverages(JSON.parse(savedMAs))
            } catch (e) {
                console.error("Failed to parse saved moving averages", e)
            }
        }
    }, [])

    // Save MAs to session storage on change
    useEffect(() => {
        sessionStorage.setItem('chart_moving_averages', JSON.stringify(movingAverages))
    }, [movingAverages])

    // Comparison Data
    const [comparisonData, setComparisonData] = useState<PriceDataPoint[]>([])

    // Legend Data
    const [legendData, setLegendData] = useState<{ title: string, value: string, color: string }[]>([])

    // Load available symbols
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
                } else if (assetType === 'metals') {
                    symbols = [
                        { symbol: 'GOLD', name: 'Gold' },
                        { symbol: 'SILVER', name: 'Silver' },
                    ]
                } else if (assetType === 'kse100') {
                    symbols = [{ symbol: 'KSE100', name: 'KSE 100 Index' }]
                } else if (assetType === 'spx500') {
                    symbols = [{ symbol: 'SPX500', name: 'S&P 500 Index' }]
                }

                setAvailableSymbols(symbols)
                if (assetType !== 'us-equity' && symbols.length > 0 && !symbols.find(s => s.symbol === selectedSymbol)) {
                    setSelectedSymbol(symbols[0].symbol)
                }
            } catch (err) {
                console.error('Error loading symbols:', err)
            } finally {
                setLoadingSymbols(false)
            }
        }
        loadSymbols()
    }, [assetType])

    // Data Cache
    const dataCache = useRef<Map<string, PriceDataPoint[]>>(new Map())

    // Load price data
    useEffect(() => {
        if (!selectedSymbol) return

        const loadData = async () => {
            const cacheKey = `${assetType}-${selectedSymbol}-${showTotalReturn}`
            if (dataCache.current.has(cacheKey)) {
                setAllData(dataCache.current.get(cacheKey)!)
                // If comparison is enabled, we might need to fetch it separately if not cached
                // But comparison data is handled separately below
            } else {
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
                    } else if (assetType === 'metals') {
                        apiUrl = `/api/historical-data?assetType=metals&symbol=${encodeURIComponent(selectedSymbol)}`
                    } else if (assetType === 'kse100') {
                        apiUrl = `/api/historical-data?assetType=kse100&symbol=KSE100`
                    } else if (assetType === 'spx500') {
                        apiUrl = `/api/historical-data?assetType=spx500&symbol=SPX500`
                    }

                    const response = await fetch(apiUrl)
                    if (!response.ok) throw new Error('Failed to fetch price data')
                    const result = await response.json()

                    let priceData: PriceDataPoint[] = (result.data || [])
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

                    if (priceData.length === 0) throw new Error('No price data available')

                    if (showTotalReturn && assetType === 'pk-equity') {
                        try {
                            const dividendResponse = await fetch(`/api/pk-equity/dividend?ticker=${encodeURIComponent(selectedSymbol)}`)
                            if (dividendResponse.ok) {
                                const divData = await dividendResponse.json()
                                if (divData.dividends) {
                                    const adjustedPoints = calculateDividendAdjustedPrices(priceData, divData.dividends)
                                    priceData = adjustedPoints.map(p => ({
                                        date: p.date,
                                        close: p.adjustedValue,
                                        open: p.adjustedValue,
                                        high: p.adjustedValue,
                                        low: p.adjustedValue,
                                    }))
                                }
                            }
                        } catch (e) {
                            console.error("Error fetching dividends", e)
                        }
                    }

                    dataCache.current.set(cacheKey, priceData)
                    setAllData(priceData)
                } catch (err: any) {
                    setError(err.message || 'Failed to load price data')
                    toast({
                        title: "Error",
                        description: err.message,
                        variant: "destructive",
                    })
                } finally {
                    setLoading(false)
                }
            }

            if (showComparison) {
                const compSymbol = assetType === 'pk-equity' ? 'KSE100' : 'SPX500'
                const compType = assetType === 'pk-equity' ? 'kse100' : 'spx500'
                const compCacheKey = `comparison-${compType}-${compSymbol}`

                if (dataCache.current.has(compCacheKey)) {
                    setComparisonData(dataCache.current.get(compCacheKey)!)
                } else {
                    try {
                        const compRes = await fetch(`/api/historical-data?assetType=${compType}&symbol=${compSymbol}`)
                        if (compRes.ok) {
                            const compResult = await compRes.json()
                            const compData = (compResult.data || []).map((d: any) => ({
                                date: d.date,
                                close: parseFloat(d.close)
                            })).sort((a: any, b: any) => a.date.localeCompare(b.date))

                            dataCache.current.set(compCacheKey, compData)
                            setComparisonData(compData)
                        }
                    } catch (e) {
                        console.error("Error fetching comparison data", e)
                    }
                }
            } else {
                setComparisonData([])
            }
        }

        loadData()
    }, [selectedSymbol, assetType, showTotalReturn, showComparison])

    // Initialize Chart (Only Once)
    useEffect(() => {
        if (!chartContainerRef.current) return

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#000',
            },
            grid: {
                vertLines: { color: '#e0e0e0' },
                horzLines: { color: '#e0e0e0' },
            },
            width: chartContainerRef.current.clientWidth,
            height: 500,
            timeScale: {
                timeVisible: true,
                borderColor: '#e0e0e0',
            },
            rightPriceScale: {
                borderColor: '#e0e0e0',
            }
        })

        chartRef.current = chart

        const priceSeries = chart.addSeries(LineSeries, {
            lineWidth: 2,
        })
        priceSeriesRef.current = priceSeries

        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth })
            }
        }

        window.addEventListener('resize', handleResize)

        return () => {
            window.removeEventListener('resize', handleResize)
            chart.remove()
            chartRef.current = null
            priceSeriesRef.current = null
            comparisonSeriesRef.current = null
            maSeriesRefs.current.clear()
        }
    }, [])

    // Update Chart Options (Theme, Colors)
    useEffect(() => {
        if (!chartRef.current) return
        const isDark = theme === 'dark'

        chartRef.current.applyOptions({
            layout: {
                background: { type: ColorType.Solid, color: isDark ? colors.background : '#ffffff' },
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
            crosshair: {
                // Hide the horizontal crosshair line and label (cursor position)
                // so the user only sees the labels for the actual data series
                horzLine: {
                    visible: false,
                    labelVisible: false,
                },
                vertLine: {
                    visible: true,
                    style: 0, // Solid line
                    width: 1,
                    color: colors.crosshair,
                    labelBackgroundColor: colors.price,
                },
            },
        })

        if (priceSeriesRef.current) {
            priceSeriesRef.current.applyOptions({
                color: colors.price || '#3b82f6',
                title: selectedSymbol,
                crosshairMarkerVisible: true,
            })
        }
    }, [theme, colors, selectedSymbol])

    // Update Comparison Series
    useEffect(() => {
        if (!chartRef.current) return

        if (showComparison && !comparisonSeriesRef.current) {
            comparisonSeriesRef.current = chartRef.current.addSeries(LineSeries, {
                color: '#a855f7',
                lineWidth: 2,
                lineStyle: 2, // Dashed
                title: assetType === 'pk-equity' ? 'KSE100' : 'SPX500',
                crosshairMarkerVisible: true,
            })
        } else if (!showComparison && comparisonSeriesRef.current) {
            chartRef.current.removeSeries(comparisonSeriesRef.current)
            comparisonSeriesRef.current = null
        }
    }, [showComparison, assetType])

    // Memoize processed data to avoid recalculation on every render
    const processedData = useMemo(() => {
        // Filter data based on time range
        const filteredData = filterDataByRange(allData, timeRange)
        const filteredComparisonData = filterDataByRange(comparisonData, timeRange)

        // Resample data
        const resampled = resampleData(filteredData, frequency)

        // Main Data
        const lineData: LineData[] = resampled.map(d => ({
            time: dateToTime(d.date),
            value: d.close
        }))

        // Comparison Data
        let compLineData: LineData[] = []
        if (showComparison && filteredComparisonData.length > 0) {
            compLineData = filteredComparisonData.map(d => ({
                time: dateToTime(d.date),
                value: d.close
            }))
        }

        // Moving Averages
        const maLines = new Map<string, LineData[]>()
        movingAverages.forEach(ma => {
            if (!ma.enabled) return

            const parsedMA = parseMAInput(ma.input, frequency)
            if (!parsedMA) return

            let dataForMA = resampled
            if (parsedMA.period !== frequency) {
                dataForMA = resampleData(filteredData, parsedMA.period)
            }
            const maValues = calculateMovingAverage(dataForMA, ma.type, parsedMA.length)

            const maLineData: LineData[] = []

            if (parsedMA.period === frequency) {
                resampled.forEach((d, i) => {
                    if (!isNaN(maValues[i])) {
                        maLineData.push({ time: dateToTime(d.date), value: maValues[i] })
                    }
                })
            } else {
                const maMap = new Map<string, number>()
                dataForMA.forEach((d, i) => {
                    if (!isNaN(maValues[i])) maMap.set(d.date, maValues[i])
                })

                resampled.forEach(d => {
                    if (maMap.has(d.date)) {
                        maLineData.push({ time: dateToTime(d.date), value: maMap.get(d.date)! })
                    }
                })
            }
            maLines.set(ma.id, maLineData)
        })

        return { lineData, compLineData, maLines, filteredComparisonData }
    }, [allData, comparisonData, frequency, movingAverages, showComparison, timeRange])

    // Update Data & Log Scale
    useEffect(() => {
        if (!chartRef.current || !priceSeriesRef.current) return

        const { lineData, compLineData, maLines, filteredComparisonData } = processedData

        // Configure Scale
        if (showComparison && filteredComparisonData.length > 0) {
            chartRef.current.priceScale('right').applyOptions({
                mode: PriceScaleMode.Percentage,
            })
        } else {
            chartRef.current.priceScale('right').applyOptions({
                mode: useLogScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
            })
        }

        // Set Main Data
        priceSeriesRef.current.setData(lineData)

        // Set Comparison Data
        if (showComparison && comparisonSeriesRef.current && compLineData.length > 0) {
            comparisonSeriesRef.current.setData(compLineData)
        }

        // Cleanup deleted MAs
        const currentMAIds = new Set(movingAverages.map(ma => ma.id))
        maSeriesRefs.current.forEach((series, id) => {
            if (!currentMAIds.has(id)) {
                chartRef.current?.removeSeries(series)
                maSeriesRefs.current.delete(id)
            }
        })

        const currentMAData = new Map<string, LineData[]>()

        // Moving Averages
        movingAverages.forEach(ma => {
            if (!ma.enabled) {
                const existing = maSeriesRefs.current.get(ma.id)
                if (existing) {
                    chartRef.current?.removeSeries(existing)
                    maSeriesRefs.current.delete(ma.id)
                }
                return
            }

            const maLineData = maLines.get(ma.id)
            if (!maLineData) return

            currentMAData.set(ma.id, maLineData)

            let series = maSeriesRefs.current.get(ma.id)
            if (!series && maLineData.length > 0) {
                series = chartRef.current?.addSeries(LineSeries, {
                    color: ma.color || '#000',
                    lineWidth: 1,
                    title: `${ma.type} ${ma.input}`,
                    crosshairMarkerVisible: true,
                })
                if (series) maSeriesRefs.current.set(ma.id, series)
            }
            if (series) {
                series.setData(maLineData)
                series.applyOptions({
                    title: `${ma.type} ${ma.input}`,
                    color: ma.color,
                    crosshairMarkerVisible: true,
                })
            }
        })

        // Update current data ref
        currentDataRef.current = {
            price: lineData,
            comparison: compLineData,
            mas: currentMAData
        }

        chartRef.current.timeScale().fitContent()

    }, [processedData, showComparison, useLogScale, movingAverages])

    // Crosshair Move Handler for Legend
    useEffect(() => {
        if (!chartRef.current) return

        const handleCrosshairMove = (param: any) => {
            if (
                param.point === undefined ||
                !param.time ||
                param.point.x < 0 ||
                param.point.x > chartContainerRef.current!.clientWidth ||
                param.point.y < 0 ||
                param.point.y > chartContainerRef.current!.clientHeight
            ) {
                // setLegendData([]) // Optional: clear or keep last value
                return
            }

            const newLegendData: { title: string, value: string, color: string }[] = []

            // Determine if we are in percentage mode and find base values
            let isPercentage = false
            let basePrice = 0
            let baseComp = 0
            const baseMAs = new Map<string, number>()

            if (showComparison) {
                const visibleRange = chartRef.current?.timeScale().getVisibleRange()
                if (visibleRange) {
                    isPercentage = true
                    const fromTime = visibleRange.from as number

                    // Find the first data point at or after the start of the visible range
                    const priceBasePoint = currentDataRef.current.price.find(d => (d.time as number) >= fromTime)
                    if (priceBasePoint) basePrice = priceBasePoint.value

                    const compBasePoint = currentDataRef.current.comparison.find(d => (d.time as number) >= fromTime)
                    if (compBasePoint) baseComp = compBasePoint.value

                    currentDataRef.current.mas.forEach((data: LineData[], id: string) => {
                        const maBasePoint = data.find(d => (d.time as number) >= fromTime)
                        if (maBasePoint) {
                            baseMAs.set(id, maBasePoint.value)
                        }
                    })
                }
            }

            // Main Price Series
            if (priceSeriesRef.current) {
                const priceData = param.seriesData.get(priceSeriesRef.current) as any
                if (priceData) {
                    let valueStr = priceData.value.toFixed(2)
                    if (isPercentage && basePrice !== 0) {
                        const pct = ((priceData.value - basePrice) / basePrice) * 100
                        valueStr = (pct > 0 ? '+' : '') + pct.toFixed(2) + '%'
                    }

                    newLegendData.push({
                        title: 'Price',
                        value: valueStr,
                        color: colors.price || '#3b82f6'
                    })
                }
            }

            // Comparison Series
            if (comparisonSeriesRef.current) {
                const compData = param.seriesData.get(comparisonSeriesRef.current) as any
                if (compData) {
                    let valueStr = compData.value.toFixed(2)
                    if (isPercentage && baseComp !== 0) {
                        const pct = ((compData.value - baseComp) / baseComp) * 100
                        valueStr = (pct > 0 ? '+' : '') + pct.toFixed(2) + '%'
                    } else if (isPercentage) {
                        // Fallback if base is 0 or missing, but we are in percentage mode
                        valueStr = ''
                    }

                    newLegendData.push({
                        title: assetType === 'pk-equity' ? 'KSE100' : 'SPX500',
                        value: valueStr,
                        color: '#a855f7'
                    })
                }
            }

            // Moving Averages
            maSeriesRefs.current.forEach((series, id) => {
                const maData = param.seriesData.get(series) as any
                const maConfig = movingAverages.find(m => m.id === id)
                if (maData && maConfig) {
                    let valueStr = maData.value.toFixed(2)
                    if (isPercentage) {
                        // Note: MAs usually share the price scale, but in percentage mode
                        // Lightweight charts indexes each series independently to 0.
                        // So we calculate relative to the MA's own start.
                        const baseMA = baseMAs.get(id)
                        if (baseMA && baseMA !== 0) {
                            const pct = ((maData.value - baseMA) / baseMA) * 100
                            valueStr = (pct > 0 ? '+' : '') + pct.toFixed(2) + '%'
                        }
                    }

                    newLegendData.push({
                        title: `${maConfig.type} ${maConfig.input}`,
                        value: valueStr,
                        color: maConfig.color || '#000'
                    })
                }
            })

            setLegendData(newLegendData)
        }

        chartRef.current.subscribeCrosshairMove(handleCrosshairMove)

        return () => {
            chartRef.current?.unsubscribeCrosshairMove(handleCrosshairMove)
        }
    }, [colors, assetType, movingAverages, showComparison])

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <CardTitle>Unified Price Chart</CardTitle>
                            <CardDescription>Advanced charting with technical indicators</CardDescription>
                        </div>

                        {/* Compact Asset Selector */}
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <Select value={assetType} onValueChange={(v) => setAssetType(v as AssetType)}>
                                <SelectTrigger className="w-[130px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pk-equity">PK Equity</SelectItem>
                                    <SelectItem value="us-equity">US Equity</SelectItem>
                                    <SelectItem value="crypto">Crypto</SelectItem>
                                    <SelectItem value="metals">Metals</SelectItem>
                                    <SelectItem value="kse100">KSE100</SelectItem>
                                    <SelectItem value="spx500">SPX500</SelectItem>
                                </SelectContent>
                            </Select>

                            {assetType === 'us-equity' ? (
                                <div className="relative flex-1 md:w-[200px]">
                                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <input
                                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pl-8"
                                        placeholder="Symbol (e.g. AAPL)"
                                        value={selectedSymbol}
                                        onChange={(e) => setSelectedSymbol(e.target.value.toUpperCase())}
                                    />
                                </div>
                            ) : (
                                <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" role="combobox" aria-expanded={openCombobox} className="flex-1 md:w-[200px] justify-between">
                                            {selectedSymbol || "Select asset..."}
                                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[200px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Search asset..." value={searchQuery} onValueChange={setSearchQuery} />
                                            <CommandList>
                                                <CommandEmpty>No asset found.</CommandEmpty>
                                                <CommandGroup>
                                                    {availableSymbols.filter(s => s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || s.name?.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 50).map((item) => (
                                                        <CommandItem
                                                            key={item.symbol}
                                                            value={item.symbol}
                                                            onSelect={(currentValue) => {
                                                                setSelectedSymbol(currentValue)
                                                                setOpenCombobox(false)
                                                            }}
                                                        >
                                                            <Check className={cn("mr-2 h-4 w-4", selectedSymbol === item.symbol ? "opacity-100" : "opacity-0")} />
                                                            {item.symbol}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            )}
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="space-y-4">
                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center gap-4 p-2 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                            <Label className="text-xs">Log Scale</Label>
                            <Switch checked={useLogScale} onCheckedChange={setUseLogScale} />
                        </div>

                        {assetType === 'pk-equity' && (
                            <div className="flex items-center gap-2">
                                <Label className="text-xs">Total Return (Div. Adj)</Label>
                                <Switch checked={showTotalReturn} onCheckedChange={setShowTotalReturn} />
                            </div>
                        )}

                        {(assetType === 'pk-equity' || assetType === 'us-equity') && (
                            <div className="flex items-center gap-2">
                                <Label className="text-xs">Compare {assetType === 'pk-equity' ? 'KSE100' : 'SPX500'}</Label>
                                <Switch checked={showComparison} onCheckedChange={setShowComparison} />
                            </div>
                        )}

                        <div className="ml-auto flex items-center gap-2">
                            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                                <SelectTrigger className="h-8 w-[80px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1M">1M</SelectItem>
                                    <SelectItem value="3M">3M</SelectItem>
                                    <SelectItem value="6M">6M</SelectItem>
                                    <SelectItem value="YTD">YTD</SelectItem>
                                    <SelectItem value="1Y">1Y</SelectItem>
                                    <SelectItem value="3Y">3Y</SelectItem>
                                    <SelectItem value="5Y">5Y</SelectItem>
                                    <SelectItem value="ALL">ALL</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                                <SelectTrigger className="h-8 w-[100px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="daily">Daily</SelectItem>
                                    <SelectItem value="weekly">Weekly</SelectItem>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Button variant="ghost" size="icon" onClick={() => setShowSettings(!showSettings)} className={showSettings ? "bg-muted" : ""}>
                            <Settings2 className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* MA Settings Collapsible */}
                    <Collapsible open={showSettings} onOpenChange={setShowSettings}>
                        <CollapsibleContent className="space-y-4 border rounded-lg p-4 mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-semibold">Moving Averages</h4>
                                <Button variant="outline" size="sm" onClick={() => setMovingAverages([...movingAverages, { id: Date.now().toString(), type: 'SMA', input: '20', enabled: true, color: MA_COLORS[movingAverages.length % MA_COLORS.length] }])}>
                                    <Plus className="h-3 w-3 mr-1" /> Add
                                </Button>
                            </div>
                            {movingAverages.map((ma, idx) => (
                                <div key={ma.id} className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={ma.enabled} onChange={(e) => {
                                        const newMAs = [...movingAverages]; newMAs[idx].enabled = e.target.checked; setMovingAverages(newMAs)
                                    }} />
                                    <Select value={ma.type} onValueChange={(v) => {
                                        const newMAs = [...movingAverages]; newMAs[idx].type = v as MovingAverageType; setMovingAverages(newMAs)
                                    }}>
                                        <SelectTrigger className="h-7 w-[80px]"><SelectValue /></SelectTrigger>
                                        <SelectContent><SelectItem value="SMA">SMA</SelectItem><SelectItem value="EMA">EMA</SelectItem></SelectContent>
                                    </Select>
                                    <input
                                        className="w-20 h-7 border rounded px-2 text-xs"
                                        type="text"
                                        value={ma.input}
                                        placeholder="e.g. 50w"
                                        onChange={(e) => {
                                            const newMAs = [...movingAverages]; newMAs[idx].input = e.target.value; setMovingAverages(newMAs)
                                        }}
                                    />
                                    <input type="color" value={ma.color} onChange={(e) => {
                                        const newMAs = [...movingAverages]; newMAs[idx].color = e.target.value; setMovingAverages(newMAs)
                                    }} className="h-7 w-7" />
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setMovingAverages(movingAverages.filter(m => m.id !== ma.id))}><X className="h-3 w-3" /></Button>
                                </div>
                            ))}
                        </CollapsibleContent>
                    </Collapsible>

                    {/* Chart Area */}
                    <div className="relative h-[500px] w-full border rounded-lg overflow-hidden bg-card">
                        {loading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-sm">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        )}
                        {error && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
                                <div className="text-destructive font-medium">{error}</div>
                            </div>
                        )}

                        {/* Legend Overlay */}
                        <div className="absolute top-2 left-2 z-20 bg-background/80 backdrop-blur-sm p-2 rounded border shadow-sm text-xs pointer-events-none space-y-1 min-w-[150px]">
                            <div className="font-semibold">{selectedSymbol}</div>
                            {legendData.map((item, i) => (
                                <div key={i} className="flex items-center justify-between gap-4">
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></span>
                                        <span>{item.title}</span>
                                    </span>
                                    <span className="font-mono">{item.value}</span>
                                </div>
                            ))}
                        </div>

                        <div ref={chartContainerRef} className="w-full h-full" />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
