"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Loader2, TrendingUp, TrendingDown, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
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

interface InterestRateData {
  date: string
  value: number
  series_key: string
  series_name: string
  unit: string
}

interface InterestRateResponse {
  seriesKey: string
  seriesName: string
  data: InterestRateData[]
  count: number
  latestStoredDate: string | null
  earliestStoredDate: string | null
  source: string
  cached: boolean
}

const SERIES_OPTIONS = [
  {
    key: 'TS_GP_IR_SIRPR_AH.SBPOL0030',
    label: 'Policy (Target) Rate',
    description: 'Main policy rate introduced in May 2015',
    color: 'rgb(59, 130, 246)', // blue
  },
  {
    key: 'TS_GP_IR_SIRPR_AH.SBPOL0010',
    label: 'Reverse Repo Rate',
    description: 'Ceiling rate (since 1956)',
    color: 'rgb(239, 68, 68)', // red
  },
  {
    key: 'TS_GP_IR_SIRPR_AH.SBPOL0020',
    label: 'Repo Rate',
    description: 'Floor rate (since 2009)',
    color: 'rgb(34, 197, 94)', // green
  },
]

export function InterestRatesSection() {
  const { toast } = useToast()
  const [selectedSeries, setSelectedSeries] = useState(SERIES_OPTIONS[0].key)
  const [data, setData] = useState<InterestRateData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<{
    seriesName: string
    latestDate: string | null
    cached: boolean
  } | null>(null)

  const selectedSeriesInfo = SERIES_OPTIONS.find(s => s.key === selectedSeries) || SERIES_OPTIONS[0]

  const loadInterestRates = async (refresh = false) => {
    try {
      setLoading(true)
      setError(null)

      const url = `/api/sbp/interest-rates?seriesKey=${encodeURIComponent(selectedSeries)}${refresh ? '&refresh=true' : ''}`
      const response = await fetch(url)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch interest rates')
      }

      const result: InterestRateResponse = await response.json()

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
      console.error('Error loading interest rates:', err)
      setError(err.message || 'Failed to load interest rates')
      toast({
        title: "Error",
        description: err.message || 'Failed to load interest rates',
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInterestRates()
  }, [selectedSeries])

  const handleRefresh = () => {
    loadInterestRates(true)
  }

  // Prepare chart data
  const chartData = {
    labels: data.map(d => format(new Date(d.date), 'MMM yyyy')),
    datasets: [
      {
        label: selectedSeriesInfo.label,
        data: data.map(d => d.value),
        borderColor: selectedSeriesInfo.color,
        backgroundColor: `${selectedSeriesInfo.color}20`,
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: selectedSeriesInfo.color,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
      },
    ],
  }

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
        text: `State Bank of Pakistan - ${selectedSeriesInfo.label}`,
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
          text: 'Interest Rate (%)',
        },
        beginAtZero: false,
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
  const change = latestValue && previousValue ? latestValue - previousValue : null
  const changePercent = change && previousValue ? (change / previousValue) * 100 : null

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>State Bank of Pakistan Interest Rates</CardTitle>
              <CardDescription>
                Historical interest rate data from SBP EasyData API
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Series Selection */}
          <div className="space-y-2">
            <Label htmlFor="series-select">Select Interest Rate Series</Label>
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

          {/* Current Rate Display */}
          {latestValue !== null && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Current Rate</div>
                <div className="text-2xl font-bold mt-1">{latestValue.toFixed(2)}%</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {metadata?.latestDate ? format(new Date(metadata.latestDate), 'MMM dd, yyyy') : 'N/A'}
                </div>
              </div>
              {change !== null && (
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Change</div>
                  <div className={`text-2xl font-bold mt-1 flex items-center gap-2 ${change >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {change >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    {change > 0 ? '+' : ''}{change.toFixed(2)}%
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
                <p>Loading interest rate data...</p>
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

