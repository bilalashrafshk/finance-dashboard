"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Loader2, TrendingUp, TrendingDown, DollarSign } from "lucide-react"
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

interface BOPData {
  date: string
  value: number
  series_key: string
  series_name: string
  unit: string
}

interface BOPResponse {
  seriesKey: string
  seriesName: string
  data: BOPData[]
  count: number
  latestStoredDate: string | null
  earliestStoredDate: string | null
  source: string
  cached: boolean
}

const SERIES_OPTIONS = [
  {
    key: 'TS_GP_BOP_BPM6SUM_M.P00010',
    label: 'Current Account Balance',
    description: 'Net current account balance (surplus/deficit)',
    color: 'rgb(59, 130, 246)', // blue
    variableType: 'flow' as const,
  },
  {
    key: 'TS_GP_BOP_BPM6SUM_M.P00030',
    label: 'Exports of Goods',
    description: 'Exports of goods FOB',
    color: 'rgb(34, 197, 94)', // green
    variableType: 'flow' as const,
  },
  {
    key: 'TS_GP_BOP_BPM6SUM_M.P00040',
    label: 'Imports of Goods',
    description: 'Imports of goods FOB',
    color: 'rgb(239, 68, 68)', // red
    variableType: 'flow' as const,
  },
  {
    key: 'TS_GP_BOP_BPM6SUM_M.P00050',
    label: 'Trade Balance (Goods)',
    description: 'Balance on trade in goods',
    color: 'rgb(168, 85, 247)', // purple
    variableType: 'flow' as const,
  },
  {
    key: 'TS_GP_BOP_BPM6SUM_M.P00060',
    label: 'Exports of Services',
    description: 'Exports of services',
    color: 'rgb(20, 184, 166)', // teal
    variableType: 'flow' as const,
  },
  {
    key: 'TS_GP_BOP_BPM6SUM_M.P00070',
    label: 'Imports of Services',
    description: 'Imports of services',
    color: 'rgb(249, 115, 22)', // orange
    variableType: 'flow' as const,
  },
  {
    key: 'TS_GP_BOP_BPM6SUM_M.P00080',
    label: 'Trade Balance (Services)',
    description: 'Balance on trade in services',
    color: 'rgb(236, 72, 153)', // pink
    variableType: 'flow' as const,
  },
  {
    key: 'TS_GP_BOP_BPM6SUM_M.P00140',
    label: 'Workers\' Remittances',
    description: 'Personal transfers (Net)',
    color: 'rgb(14, 165, 233)', // sky blue
    variableType: 'flow' as const,
  },
  {
    key: 'TS_GP_BOP_BPM6SUM_M.P00180',
    label: 'FDI (Net)',
    description: 'Foreign Direct Investment (Net)',
    color: 'rgb(132, 204, 22)', // lime
    variableType: 'flow' as const,
  },
  {
    key: 'TS_GP_BOP_BPM6SUM_M.P00330',
    label: 'Portfolio Investment',
    description: 'Portfolio Investment (Net)',
    color: 'rgb(99, 102, 241)', // indigo
    variableType: 'flow' as const,
  },
  {
    key: 'TS_GP_BOP_BPM6SUM_M.P00680',
    label: 'Overall Balance',
    description: 'Final balance of payments surplus/deficit',
    color: 'rgb(107, 114, 128)', // gray
    variableType: 'flow' as const,
  },
  {
    key: 'TS_GP_BOP_BPM6SUM_M.P00730',
    label: 'SBP Gross Reserves',
    description: 'Total foreign exchange reserves with State Bank',
    color: 'rgb(234, 179, 8)', // yellow
    variableType: 'stock' as const,
  },
]

export function BalanceOfPaymentsSection() {
  const { toast } = useToast()
  const [selectedSeries, setSelectedSeries] = useState(SERIES_OPTIONS[0].key)
  const [data, setData] = useState<BOPData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<{
    seriesName: string
    latestDate: string | null
    earliestDate: string | null
    cached: boolean
  } | null>(null)

  // Range & View Selection State
  const [rangeStart, setRangeStart] = useState<string | null>(null)
  const [rangeEnd, setRangeEnd] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'monthly' | 'quarterly'>('monthly')
  const [showYoY, setShowYoY] = useState(false)

  const selectedSeriesInfo = SERIES_OPTIONS.find(s => s.key === selectedSeries) || SERIES_OPTIONS[0]

  // --- Helper: Fiscal Quarter Label ---
  const getQuarterLabel = (dateStr: string) => {
    const d = new Date(dateStr)
    const year = d.getFullYear()
    const month = d.getMonth() // 0-indexed

    // PK Fiscal Year: Q1 (Jul-Sep), Q2 (Oct-Dec), Q3 (Jan-Mar), Q4 (Apr-Jun)
    if (month >= 6 && month <= 8) return `Q1 FY${year + 1}`
    if (month >= 9 && month <= 11) return `Q2 FY${year + 1}`
    if (month >= 0 && month <= 2) return `Q3 FY${year}`
    return `Q4 FY${year}`
  }

  // --- Helper: Aggregate Data ---
  const getAggregatedData = (rawData: BOPData[], mode: 'monthly' | 'quarterly') => {
    if (mode === 'monthly') return rawData

    const quarters: Record<string, { date: string, value: number, count: number }> = {}

    rawData.forEach(d => {
      const label = getQuarterLabel(d.date)
      if (!quarters[label]) {
        quarters[label] = { date: d.date, value: 0, count: 0 }
      }

      if (selectedSeriesInfo.variableType === 'stock') {
        // For stock, take the latest value in the quarter
        quarters[label].value = d.value
        quarters[label].date = d.date
      } else {
        // For flow, sum the values
        quarters[label].value += d.value
        quarters[label].count += 1
      }
    })

    return Object.entries(quarters).map(([label, q]) => ({
      ...rawData[0], // Copy other fields
      date: q.date,
      value: q.value,
      displayLabel: label
    } as any))
  }

  // --- Helper: YoY Logic ---
  const getYoyBaseline = (currentData: any[], allData: BOPData[]) => {
    return currentData.map(curr => {
      const currDate = new Date(curr.date)
      const targetDate = new Date(currDate)
      targetDate.setFullYear(currDate.getFullYear() - 1)

      const targetMonthStr = targetDate.toISOString().slice(0, 7) // "YYYY-MM"

      // Find matching month in all data
      const match = allData.find(d => d.date.startsWith(targetMonthStr))
      return match ? match.value : null
    })
  }

  const loadBOPData = async (refresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        seriesKey: selectedSeries,
        refresh: refresh ? 'true' : 'false',
        startDate: '2013-07-01'
      })
      const res = await fetch(`/api/sbp/balance-of-payments?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch data')
      const json = await res.json()

      setData(json.data)
      setMetadata({
        seriesName: json.seriesName,
        latestDate: json.latestStoredDate,
        earliestDate: json.earliestStoredDate,
        cached: json.cached
      })

      // Default to "Last 1 Year" (12 months) on first load
      if (!rangeEnd || refresh) {
        setRangeEnd(json.latestStoredDate)
        const latestDate = new Date(json.latestStoredDate)
        const oneYearAgo = new Date(latestDate)
        oneYearAgo.setFullYear(latestDate.getFullYear() - 1)
        const startStr = oneYearAgo.toISOString().slice(0, 10)
        const startMatch = json.data.find((d: any) => d.date >= startStr) || json.data[0]
        setRangeStart(startMatch.date)
      }
    } catch (err: any) {
      setError(err.message)
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBOPData()
  }, [selectedSeries])

  // Create a lookup map for YoY data once to avoid O(N^2)
  const dataLookupMap = useMemo(() => {
    const map = new Map<string, number>()
    data.forEach(d => {
      const monthStr = d.date.slice(0, 7) // "YYYY-MM"
      map.set(monthStr, d.value)
    })
    return map
  }, [data])

  // Filter and Aggregate Data
  const processedData = useMemo(() => {
    if (data.length === 0) return []

    // 1. Initial filter by raw range
    let workingSet = data
    if (rangeStart && rangeEnd) {
      const start = rangeStart
      const end = rangeEnd
      workingSet = data.filter(d => d.date >= start && d.date <= end)
    }

    // 2. Aggregate by viewMode
    return getAggregatedData(workingSet, viewMode)
  }, [data, rangeStart, rangeEnd, viewMode, selectedSeriesInfo.variableType])

  // YoY Dataset
  const yoyBaselineData = useMemo(() => {
    if (!showYoY || processedData.length === 0) return []

    // 1. Calculate YoY baseline for the current processed set
    if (viewMode === 'monthly') {
      return processedData.map(curr => {
        const currDate = new Date(curr.date)
        const targetDate = new Date(currDate)
        targetDate.setFullYear(currDate.getFullYear() - 1)
        const targetMonthStr = targetDate.toISOString().slice(0, 7)
        return dataLookupMap.get(targetMonthStr) ?? null
      })
    }

    // 2. For Quarterly: We need to aggregate the PREVIOUS year's data by the same quarters
    // Construct a synthetic set of YoY data
    const syntheticYoy = data.map(d => {
      const dDate = new Date(d.date)
      const targetDate = new Date(dDate)
      targetDate.setFullYear(dDate.getFullYear() - 1)
      const targetMonthStr = targetDate.toISOString().slice(0, 7)
      return { ...d, value: dataLookupMap.get(targetMonthStr) ?? 0 }
    })

    // Filter raw synthetic set by same range
    let filteredSynthetic = syntheticYoy
    if (rangeStart && rangeEnd) {
      filteredSynthetic = syntheticYoy.filter(d => d.date >= rangeStart && d.date <= rangeEnd)
    }

    // Aggregate the synthetic set
    return getAggregatedData(filteredSynthetic, 'quarterly').map(d => d.value)
  }, [showYoY, processedData, data, dataLookupMap, viewMode, rangeStart, rangeEnd])

  // Calculate Aggregated Value for Summary Card
  const aggregateValue = useMemo(() => {
    if (processedData.length === 0) return null
    if (selectedSeriesInfo.variableType === 'stock') {
      return processedData[processedData.length - 1].value
    } else {
      return processedData.reduce((sum, d) => sum + d.value, 0)
    }
  }, [processedData, selectedSeriesInfo.variableType])

  // Generate Month/Year options for selection
  const monthOptions = useMemo(() => {
    if (data.length === 0) return []
    return data.map(d => ({
      value: d.date,
      label: format(new Date(d.date), 'MMM yyyy')
    }))
  }, [data])

  // Presets Handlers
  const applyPreset = (months: number | 'FYTD' | 'FULL') => {
    if (data.length === 0) return

    const latest = data[data.length - 1].date
    const latestDate = new Date(latest)
    setRangeEnd(latest)

    if (months === 'FULL') {
      setRangeStart(data[0].date)
    } else if (months === 'FYTD') {
      // Pakistan Fiscal Year starts July 1st
      // If current month >= July, start is July of this year
      // If current month < July, start is July of last year
      const year = latestDate.getMonth() >= 6 ? latestDate.getFullYear() : latestDate.getFullYear() - 1
      const fyStart = `${year}-07-01`

      // Find closest available date to July 1st
      const closest = data.find(d => d.date >= fyStart) || data[0]
      setRangeStart(closest.date)
    } else {
      // Last X months
      const startIdx = Math.max(0, data.length - months)
      setRangeStart(data[startIdx].date)
    }
  }

  // Prepare chart data using processed data
  const chartData = useMemo(() => {
    if (processedData.length === 0) {
      return null
    }

    const labels = processedData.map(d =>
      viewMode === 'quarterly' ? d.displayLabel : format(new Date(d.date), 'MMM yyyy')
    )

    const datasets: any[] = [
      {
        label: `${selectedSeriesInfo.label} (Current)`,
        data: processedData.map(d => d.value),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: (ctx: any) => {
          const value = ctx.parsed?.y ?? ctx.raw
          return value >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'
        },
        fill: {
          target: 'origin',
          above: 'rgba(34, 197, 94, 0.2)',
          below: 'rgba(239, 68, 68, 0.2)',
        },
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: (ctx: any) => {
          const value = ctx.parsed?.y ?? ctx.raw
          return value >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'
        },
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        order: 1,
      },
    ]

    // Add YoY Comparison Line
    if (showYoY && yoyBaselineData.length > 0) {
      datasets.push({
        label: 'Previous Year (YoY)',
        data: yoyBaselineData,
        borderColor: 'rgba(156, 163, 175, 0.8)', // slate-400
        borderDash: [5, 5],
        borderWidth: 2,
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.4,
        pointRadius: 0, // No points for baseline
        pointHoverRadius: 4,
        order: 2,
      })
    }

    return { labels, datasets }
  }, [processedData, yoyBaselineData, showYoY, selectedSeriesInfo.label, viewMode])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20,
        }
      },
      title: {
        display: true,
        text: `Pakistan's Balance of Payments - ${selectedSeriesInfo.label} (${viewMode === 'quarterly' ? 'Quarterly' : 'Monthly'})`,
        font: {
          size: 16,
          weight: 'bold' as const,
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        callbacks: {
          label: function (context: any) {
            const value = context.parsed.y
            if (value === null || value === undefined) return ''
            const sign = value >= 0 ? '+' : ''
            const status = value >= 0 ? ' (Surplus)' : ' (Deficit)'
            return `${context.dataset.label}: ${sign}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M USD${status}`
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Million USD',
        },
        beginAtZero: false,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
        },
      },
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
  }

  // Calculate change based on processed data (Monthly or Quarterly)
  const latestVal = processedData.length > 0 ? processedData[processedData.length - 1].value : null
  const previousVal = processedData.length > 1 ? processedData[processedData.length - 2].value : null
  const changeVal = latestVal !== null && previousVal !== null ? latestVal - previousVal : null
  const changePct = changeVal !== null && previousVal !== null && previousVal !== 0
    ? (changeVal / Math.abs(previousVal)) * 100
    : null

  // --- UI Logic ---
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>Pakistan's Balance of Payments</CardTitle>
            <CardDescription>
              Comprehensive BPM6 Summary Data (Since 2013)
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            {/* Interval Selector */}
            <div className="flex bg-muted rounded-md p-1 items-center">
              <button
                onClick={() => setViewMode('monthly')}
                className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${viewMode === 'monthly' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setViewMode('quarterly')}
                className={`px-3 py-1 text-xs font-medium rounded-sm transition-all ${viewMode === 'quarterly' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Quarterly
              </button>
            </div>

            {/* YoY Toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div className="relative inline-flex h-5 w-10 items-center rounded-full bg-muted transition-colors">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={showYoY}
                  onChange={(e) => setShowYoY(e.target.checked)}
                />
                <div className={`h-4 w-4 transform rounded-full bg-white transition-transform ${showYoY ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">YoY Comp</span>
            </label>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Range Selection & Presets */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-end">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => applyPreset(12)}
                  className="px-3 py-1 text-xs font-medium border rounded hover:bg-muted transition-colors"
                >
                  Last 1 Year
                </button>
                <button
                  onClick={() => applyPreset(36)}
                  className="px-3 py-1 text-xs font-medium border rounded hover:bg-muted transition-colors"
                >
                  Last 3 Years
                </button>
                <button
                  onClick={() => applyPreset('FYTD')}
                  className="px-3 py-1 text-xs font-medium border rounded hover:bg-muted transition-colors"
                >
                  FYTD
                </button>
                <button
                  onClick={() => applyPreset('FULL')}
                  className="px-3 py-1 text-xs font-medium border rounded hover:bg-muted transition-colors"
                >
                  Full History
                </button>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <Label>From</Label>
                  <Select value={rangeStart || ""} onValueChange={setRangeStart}>
                    <SelectTrigger>
                      <SelectValue placeholder="Start Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-2">
                  <Label>To</Label>
                  <Select value={rangeEnd || ""} onValueChange={setRangeEnd}>
                    <SelectTrigger>
                      <SelectValue placeholder="End Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Aggregated Summary Card */}
            {aggregateValue !== null && (
              <div className="p-4 border rounded-xl bg-muted/20 border-blue-500/20 shadow-sm flex flex-col justify-center h-full">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  {selectedSeriesInfo.variableType === 'stock' ? 'End of Period Value (Stock)' : `Range Total (${viewMode === 'quarterly' ? 'Sum of Quarters' : 'Sum of Months'})`}
                </div>
                <div className="text-3xl font-bold tracking-tight">
                  <span className={aggregateValue >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {aggregateValue >= 0 ? '+' : ''}{aggregateValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-sm font-normal text-muted-foreground ml-2">Million USD</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 font-medium">
                  {rangeStart && rangeEnd ? (
                    `${format(new Date(rangeStart), 'MMM yyyy')} - ${format(new Date(rangeEnd), 'MMM yyyy')}`
                  ) : 'Selected Period'}
                </div>
              </div>
            )}
          </div>

          <div className="border-t pt-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="series-select">Select Series</Label>
              <Select value={selectedSeries} onValueChange={setSelectedSeries}>
                <SelectTrigger id="series-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERIES_OPTIONS.map(series => (
                    <SelectItem key={series.key} value={series.key}>
                      <div className="flex flex-col text-left">
                        <span className="font-medium">{series.label}</span>
                        <span className="text-xs text-muted-foreground">{series.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Current Value Display (Contextual to Selected Data) */}
            {latestVal !== null && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Latest Observation</div>
                  <div className={`text-2xl font-bold mt-1 flex items-center gap-2 ${latestVal >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                    {latestVal >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    {latestVal >= 0 ? '+' : ''}{latestVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="text-sm font-normal text-muted-foreground ml-1">M USD</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {metadata?.latestDate ? format(new Date(metadata.latestDate), 'MMM dd, yyyy') : 'N/A'}
                  </div>
                </div>
                {changeVal !== null && (
                  <div className="p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground">
                      {viewMode === 'quarterly' ? 'Quarterly Change' : 'Monthly Change'}
                    </div>
                    <div className={`text-2xl font-bold mt-1 flex items-center gap-2 ${changeVal >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                      {changeVal >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                      {changeVal > 0 ? '+' : ''}{changeVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="text-sm font-normal text-muted-foreground ml-1">M USD</span>
                    </div>
                    {changePct !== null && (
                      <div className="text-xs text-muted-foreground mt-1 font-medium">
                        {changePct > 0 ? '+' : ''}{changePct.toFixed(2)}% from previous
                      </div>
                    )}
                  </div>
                )}
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Range Details</div>
                  <div className="text-2xl font-bold mt-1">{processedData.length} <span className="text-sm font-normal text-muted-foreground">{viewMode === 'quarterly' ? 'Quarters' : 'Months'}</span></div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {metadata?.cached ? 'Cached' : 'Fresh from API'}
                  </div>
                </div>
              </div>
            )}

            {/* Chart */}
            {loading ? (
              <div className="flex items-center justify-center h-[500px] border rounded-lg bg-muted/10">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p>Loading Balance of Payments data...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-[500px] border rounded-lg bg-destructive/10">
                <div className="text-center text-destructive">
                  <p className="font-medium">Error loading data</p>
                  <p className="text-sm mt-2">{error}</p>
                </div>
              </div>
            ) : processedData.length === 0 ? (
              <div className="flex items-center justify-center h-[500px] border rounded-lg bg-muted/10">
                <div className="text-center text-muted-foreground">
                  <p>No data available for the selected range</p>
                </div>
              </div>
            ) : !chartData ? (
              <div className="flex items-center justify-center h-[500px] border rounded-lg bg-muted/10">
                <div className="text-center text-muted-foreground">
                  <p>No data available</p>
                </div>
              </div>
            ) : (
              <>
                <div className="h-[500px] w-full">
                  <Line data={chartData} options={chartOptions as any} />
                </div>

                <div className="mt-4 p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-center justify-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded bg-green-500"></div>
                      <span className="text-muted-foreground">Surplus (≥ 0)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded bg-red-500"></div>
                      <span className="text-muted-foreground">Deficit (&lt; 0)</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

