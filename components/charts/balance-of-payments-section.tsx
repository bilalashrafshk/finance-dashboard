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
    key: 'TS_GP_ES_PKBOPSTND_M.BOPSNA01810',
    label: 'Current Account - Net',
    description: 'Net current account balance (surplus/deficit)',
    color: 'rgb(59, 130, 246)', // blue
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
    cached: boolean
  } | null>(null)

  const selectedSeriesInfo = SERIES_OPTIONS.find(s => s.key === selectedSeries) || SERIES_OPTIONS[0]

  const loadBOPData = async (refresh = false) => {
    try {
      setLoading(true)
      setError(null)

      const url = `/api/sbp/balance-of-payments?seriesKey=${encodeURIComponent(selectedSeries)}${refresh ? '&refresh=true' : ''}`
      const response = await fetch(url)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch Balance of Payments data')
      }

      const result: BOPResponse = await response.json()

      if (!result.data || result.data.length === 0) {
        throw new Error('No data available for this series')
      }

      // Sort by date ascending for chart
      const sortedData = [...result.data].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      )

      setData(sortedData)
      setMetadata({
        seriesName: result.seriesName,
        latestDate: result.latestStoredDate,
        cached: result.cached,
      })
    } catch (err: any) {
      console.error('Error loading Balance of Payments data:', err)
      setError(err.message || 'Failed to load Balance of Payments data')
      toast({
        title: "Error",
        description: err.message || 'Failed to load Balance of Payments data',
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBOPData()
  }, [selectedSeries])

  // Prepare chart data with color coding: green for surplus (>=0), red for deficit (<0)
  const chartData = useMemo(() => {
    if (data.length === 0) {
      return null
    }

    return {
      labels: data.map(d => format(new Date(d.date), 'MMM yyyy')),
      datasets: [
        {
          label: selectedSeriesInfo.label,
          data: data.map(d => d.value),
          borderColor: 'rgb(34, 197, 94)', // default, overridden by segment
          backgroundColor: (ctx: any) => {
            const value = ctx.parsed?.y ?? ctx.raw
            return value >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'
          },
          segment: {
            borderColor: (ctx: any) => {
              // Color each segment based on the second point (destination)
              const p2 = ctx.p2.parsed.y
              return p2 >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'
            },
          },
          fill: {
            target: 'origin',
            above: 'rgba(34, 197, 94, 0.2)', // green fill above zero
            below: 'rgba(239, 68, 68, 0.2)', // red fill below zero
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
        },
      ],
    }
  }, [data, selectedSeriesInfo.label])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
      },
      title: {
        display: true,
        text: `Pakistan's Balance of Payments - ${selectedSeriesInfo.label}`,
        font: {
          size: 16,
          weight: 'bold' as const,
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: function(context: any) {
            const value = context.parsed.y
            const sign = value >= 0 ? '+' : ''
            const status = value >= 0 ? ' (Surplus)' : ' (Deficit)'
            return `${context.dataset.label}: ${sign}${value.toFixed(2)} Million USD${status}`
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
        // Add zero line to distinguish surplus/deficit
        grid: {
          color: function(context: any) {
            if (context.tick.value === 0) {
              return 'rgba(0, 0, 0, 0.5)'
            }
            return 'rgba(0, 0, 0, 0.1)'
          },
        },
      },
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
  }

  // Calculate change
  const latestValue = data.length > 0 ? data[data.length - 1].value : null
  const previousValue = data.length > 1 ? data[data.length - 2].value : null
  const change = latestValue !== null && previousValue !== null ? latestValue - previousValue : null
  const changePercent = change !== null && previousValue !== null && previousValue !== 0 
    ? (change / Math.abs(previousValue)) * 100 
    : null

  // Determine if current value is surplus or deficit
  const isSurplus = latestValue !== null && latestValue >= 0
  const isDeficit = latestValue !== null && latestValue < 0

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Pakistan's Balance of Payments</CardTitle>
            <CardDescription>
              Current account balance data from SBP EasyData API
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Series Selection */}
          <div className="space-y-2">
            <Label htmlFor="series-select">Select Series</Label>
            <Select value={selectedSeries} onValueChange={setSelectedSeries}>
              <SelectTrigger id="series-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERIES_OPTIONS.map(series => (
                  <SelectItem key={series.key} value={series.key}>
                    <div className="flex flex-col">
                      <span className="font-medium">{series.label}</span>
                      <span className="text-xs text-muted-foreground">{series.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Current Value Display */}
          {latestValue !== null && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Current Account</div>
                <div className={`text-2xl font-bold mt-1 flex items-center gap-2 ${
                  isSurplus ? 'text-green-600' : 'text-red-600'
                }`}>
                  {isSurplus ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                  {latestValue >= 0 ? '+' : ''}{latestValue.toFixed(2)}
                  <span className="text-sm font-normal text-muted-foreground ml-1">M USD</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {isSurplus ? 'Surplus' : 'Deficit'}
                </div>
                <div className="text-xs text-muted-foreground">
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
                    {change > 0 ? '+' : ''}{change.toFixed(2)}
                    <span className="text-sm font-normal text-muted-foreground ml-1">M USD</span>
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
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center h-[500px] border rounded-lg bg-muted/10">
              <div className="text-center text-muted-foreground">
                <p>No data available</p>
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
                <Line data={chartData} options={chartOptions} />
              </div>
              
              {/* Visual indicator below chart */}
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
        </CardContent>
      </Card>
    </div>
  )
}

