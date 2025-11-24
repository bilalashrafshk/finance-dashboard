"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Loader2, TrendingUp, TrendingDown } from "lucide-react"
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

interface GDPData {
  date: string
  value: number
  series_key: string
  series_name: string
  unit: string
}

interface GDPResponse {
  seriesKey: string
  seriesName: string
  data: GDPData[]
  count: number
  latestStoredDate: string | null
  earliestStoredDate: string | null
  source: string
  cached: boolean
}

const SERIES_KEY = 'TS_GP_RLS_PAKGDP15_Y.GDP00160000'

export function GDPSection() {
  const { theme } = useTheme()
  const colors = getThemeColors()
  const { toast } = useToast()
  const [allData, setAllData] = useState<GDPData[]>([]) // Store all fetched data
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<{
    seriesName: string
    latestDate: string | null
    cached: boolean
  } | null>(null)
  
  // Time frame selection
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>(getDefaultPeriod('annual'))
  const [customRange, setCustomRange] = useState<DateRange>({ startDate: null, endDate: null })

  const loadGDPData = async () => {
    try {
      setLoading(true)
      setError(null)

      const url = `/api/sbp/economic-data?seriesKey=${encodeURIComponent(SERIES_KEY)}`
      
      // Add timeout to prevent hanging
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout
      
      const response = await fetch(url, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId))

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }))
        throw new Error(errorData.error || errorData.details || 'Failed to fetch GDP data')
      }

      const result: GDPResponse = await response.json()

      if (!result.data || result.data.length === 0) {
        throw new Error('No data available for this series')
      }

      // Sort by date ascending for chart
      const sortedData = [...result.data].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      )

      setAllData(sortedData) // Store all data
      setMetadata({
        seriesName: result.seriesName,
        latestDate: result.latestStoredDate,
        cached: result.cached,
      })
    } catch (err: any) {
      console.error('Error loading GDP data:', err)
      const errorMessage = err.name === 'AbortError' 
        ? 'Request timed out. Please try again.'
        : err.message || 'Failed to load GDP data'
      setError(errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGDPData()
  }, [])

  // Filter data based on selected time frame
  const data = useMemo(() => {
    return filterDataByTimeFrame(allData, chartPeriod, customRange)
  }, [allData, chartPeriod, customRange])

  // Prepare chart data
  const chartData = useMemo(() => {
    if (data.length === 0) {
      return null
    }

    return {
      labels: data.map(d => format(new Date(d.date), 'yyyy')),
      datasets: [
        {
          label: 'Real GDP Growth Rate (%)',
          data: data.map(d => d.value),
          borderColor: colors.price || 'rgb(59, 130, 246)',
          backgroundColor: `${colors.price || 'rgb(59, 130, 246)'}20`,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    }
  }, [data, colors])

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
        text: 'Pakistan Real GDP Growth Rate',
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
          label: function(context: any) {
            return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}%`
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Year',
          color: colors.foreground,
        },
        ticks: {
          color: colors.foreground,
        },
        grid: {
          color: colors.grid,
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Growth Rate (%)',
          color: colors.foreground,
        },
        ticks: {
          color: colors.foreground,
          callback: function(value: any) {
            return typeof value === 'number' ? `${value.toFixed(1)}%` : value
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

  // Calculate change
  const latestValue = data.length > 0 ? data[data.length - 1].value : null
  const previousValue = data.length > 1 ? data[data.length - 2].value : null
  const change = latestValue !== null && previousValue !== null ? latestValue - previousValue : null

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Real GDP Growth Rate</CardTitle>
          <CardDescription>
            Growth rate of Real Gross Domestic Product (annual)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Time Frame Selector */}
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
            {chartPeriod === 'CUSTOM' && (
              <>
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
              </>
            )}
          </div>

          {/* Current Value Display */}
          {latestValue !== null && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Current GDP Growth</div>
                <div className={`text-2xl font-bold mt-1 flex items-center gap-2 ${
                  latestValue >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {latestValue >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                  {latestValue.toFixed(2)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {metadata?.latestDate ? format(new Date(metadata.latestDate), 'yyyy') : 'N/A'}
                </div>
              </div>
              {change !== null && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Change</div>
                  <div className={`text-2xl font-bold mt-1 flex items-center gap-2 ${
                    change >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {change >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    {change > 0 ? '+' : ''}{change.toFixed(2)}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    from previous year
                  </div>
                </div>
              )}
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Data Points</div>
                <div className="text-2xl font-bold mt-1">{data.length}</div>
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
                <p>Loading GDP data...</p>
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

