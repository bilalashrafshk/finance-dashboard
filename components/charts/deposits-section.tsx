"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TimeFrameSelector } from "@/components/charts/time-frame-selector"
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

interface DepositsData {
  date: string
  value: number
  series_key: string
  series_name: string
  unit: string
}

interface DepositsResponse {
  seriesKey: string
  seriesName: string
  data: DepositsData[]
  count: number
  latestStoredDate: string | null
  earliestStoredDate: string | null
  source: string
  cached: boolean
}

const SERIES_KEY = 'TS_GP_BAM_M2_W.M000030'

export function DepositsSection() {
  const { theme } = useTheme()
  const colors = getThemeColors()
  const { toast } = useToast()
  const [allData, setAllData] = useState<DepositsData[]>([]) // Store all fetched data
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<{
    seriesName: string
    latestDate: string | null
    cached: boolean
  } | null>(null)
  
  // Time frame selection
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>(getDefaultPeriod('weekly'))
  const [customRange, setCustomRange] = useState<DateRange>({ startDate: null, endDate: null })

  const loadDepositsData = async () => {
    try {
      setLoading(true)
      setError(null)

      const url = `/api/sbp/economic-data?seriesKey=${encodeURIComponent(SERIES_KEY)}`
      const response = await fetch(url)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch deposits data')
      }

      const result: DepositsResponse = await response.json()

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
      setError(err.message || 'Failed to load deposits data')
      toast({
        title: "Error",
        description: err.message || 'Failed to load deposits data',
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDepositsData()
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
      labels: data.map(d => format(new Date(d.date), 'MMM dd, yyyy')),
      datasets: [
        {
          label: 'Total Deposits with Banks',
          data: data.map(d => d.value),
          borderColor: colors.price || 'rgb(59, 130, 246)',
          backgroundColor: `${colors.price || 'rgb(59, 130, 246)'}20`,
          fill: true,
          tension: 0.4,
          pointRadius: 1,
          pointHoverRadius: 4,
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
        text: 'Total Deposits with Scheduled Banks',
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
            return `${context.dataset.label}: ${(context.parsed.y / 1000).toFixed(2)} Billion PKR`
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
          text: 'Million PKR',
          color: colors.foreground,
        },
        ticks: {
          color: colors.foreground,
          callback: function(value: any) {
            return typeof value === 'number' ? `${(value / 1000).toFixed(0)}B` : value
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
  const changePercent = change !== null && previousValue !== null && previousValue !== 0 
    ? (change / previousValue) * 100 
    : null

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Total Deposits with Scheduled Banks</CardTitle>
          <CardDescription>
            Total deposits with scheduled banks (excluding Government deposits)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Time Frame Selector */}
          <TimeFrameSelector
            chartPeriod={chartPeriod}
            customRange={customRange}
            onPeriodChange={setChartPeriod}
            onRangeChange={setCustomRange}
          />

          {/* Current Value Display */}
          {latestValue !== null && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Current Deposits</div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  PKR {(latestValue / 1000).toFixed(2)}B
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {metadata?.latestDate ? format(new Date(metadata.latestDate), 'MMM dd, yyyy') : 'N/A'}
                </div>
              </div>
              {change !== null && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Change</div>
                  <div className={`text-2xl font-bold mt-1 flex items-center gap-2 ${
                    change >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {change >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    {change > 0 ? '+' : ''}PKR {(change / 1000).toFixed(2)}B
                  </div>
                  {changePercent !== null && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {changePercent > 0 ? '+' : ''}{changePercent.toFixed(2)}% from previous week
                    </div>
                  )}
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
                <p>Loading deposits data...</p>
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

