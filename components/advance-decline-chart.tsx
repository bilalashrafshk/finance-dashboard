"use client"

import { useMemo, useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Info } from "lucide-react"
import { Line } from "react-chartjs-2"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import "chartjs-adapter-date-fns"
import { createTimeSeriesChartOptions } from "@/lib/charts/chart-config"
import { getThemeColors } from "@/lib/charts/theme-colors"
import { useToast } from "@/hooks/use-toast"

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

export interface AdvanceDeclineDataPoint {
  date: string
  advancing: number
  declining: number
  unchanged: number
  netAdvances: number
  adLine: number
}

interface AdvanceDeclineChartProps {
  startDate?: string
  endDate?: string
  limit?: number
}

export function AdvanceDeclineChart({ 
  startDate, 
  endDate, 
  limit = 100 
}: AdvanceDeclineChartProps) {
  const [data, setData] = useState<AdvanceDeclineDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showExplanation, setShowExplanation] = useState(false)
  const { theme } = useTheme()
  const colors = getThemeColors()
  const { toast } = useToast()

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)
      
      try {
        const params = new URLSearchParams()
        if (startDate) params.append('startDate', startDate)
        if (endDate) params.append('endDate', endDate)
        params.append('limit', limit.toString())
        
        const response = await fetch(`/api/advance-decline?${params.toString()}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch Advance-Decline data')
        }
        
        const result = await response.json()
        
        if (result.success) {
          setData(result.data || [])
        } else {
          throw new Error(result.error || 'Failed to fetch data')
        }
      } catch (err: any) {
        console.error('Error fetching Advance-Decline data:', err)
        setError(err.message || 'Failed to load data')
        toast({
          title: "Error",
          description: err.message || "Failed to load Advance-Decline data",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [startDate, endDate, limit, toast])

  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        labels: [],
        datasets: [],
      }
    }

    // Format data for time series: {x: Date, y: number}
    const formatTimeSeriesData = (values: number[]) => {
      return data.map((point, i) => ({
        x: new Date(point.date),
        y: values[i] || null,
      }))
    }

    const datasets = [
      {
        label: 'Advance-Decline Line',
        data: formatTimeSeriesData(data.map(d => d.adLine)),
        borderColor: colors.price || '#3b82f6',
        backgroundColor: `${colors.price || '#3b82f6'}20`,
        fill: false,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
      {
        label: 'Net Advances',
        data: formatTimeSeriesData(data.map(d => d.netAdvances)),
        borderColor: colors.sRel || '#10b981',
        backgroundColor: `${colors.sRel || '#10b981'}20`,
        fill: false,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 1,
        borderDash: [5, 5],
      },
    ]

    return {
      datasets,
    }
  }, [data, colors])

  const options = useMemo(() => {
    const opts = createTimeSeriesChartOptions(
      "Advance-Decline Line (Top 100 PK Stocks)",
      "AD Line Value",
      "linear"
    )

    // Customize for AD Line
    if (opts.scales?.y) {
      opts.scales.y = {
        ...opts.scales.y,
        type: "linear",
        title: {
          display: true,
          text: "AD Line Value",
          color: colors.foreground,
        },
        ticks: {
          color: colors.foreground,
          callback: function(value: any) {
            return typeof value === 'number' ? value.toLocaleString() : value
          },
        },
        grid: {
          color: (context: any) => {
            // Highlight zero line
            if (context.tick.value === 0) {
              return colors.gridStrong
            }
            return colors.grid
          },
          lineWidth: (context: any) => {
            return context.tick.value === 0 ? 2 : 1
          },
        },
      }
    }

    // Note: Zero line annotation would require chartjs-plugin-annotation
    // For now, we'll rely on the grid line at y=0

    // Custom tooltip
    if (opts.plugins?.tooltip) {
      opts.plugins.tooltip.callbacks = {
        ...opts.plugins.tooltip.callbacks,
        afterLabel: (context: any) => {
          const index = context.dataIndex
          if (index >= 0 && index < data.length) {
            const point = data[index]
            return [
              `Advancing: ${point.advancing}`,
              `Declining: ${point.declining}`,
              `Unchanged: ${point.unchanged}`,
              `Net Advances: ${point.netAdvances > 0 ? '+' : ''}${point.netAdvances}`,
            ]
          }
          return []
        },
      }
    }

    return opts
  }, [data, colors, theme])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Advance-Decline Line</CardTitle>
          <CardDescription>Top 100 PK Stocks by Market Cap</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Advance-Decline Line</CardTitle>
          <CardDescription>Top 100 PK Stocks by Market Cap</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[400px] text-destructive">
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Advance-Decline Line</CardTitle>
          <CardDescription>Top 100 PK Stocks by Market Cap</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[400px] text-muted-foreground">
            <p>No data available</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Advance-Decline Line</CardTitle>
            <CardDescription>
              Top {limit} PK Stocks by Market Cap
              {data.length > 0 && (
                <span className="ml-2">
                  ({new Date(data[0].date).toLocaleDateString()} - {new Date(data[data.length - 1].date).toLocaleDateString()})
                </span>
              )}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowExplanation(true)}
          >
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[500px] w-full">
          <Line data={chartData} options={options} />
        </div>
        <div className="mt-4 text-sm text-muted-foreground space-y-1">
          <p>
            <strong>Formula:</strong> AD Line = Previous AD Line + (Advancing Stocks - Declining Stocks)
          </p>
          <p>
            The Advance-Decline Line is a cumulative indicator that tracks the net difference between advancing and declining stocks over time.
          </p>
        </div>
      </CardContent>
      <Dialog open={showExplanation} onOpenChange={setShowExplanation}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Info className="h-5 w-5" />
              Advance-Decline Line
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Track market breadth using the cumulative Advance-Decline Line
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm sm:text-base space-y-4">
            <div>
              <h4 className="font-semibold mb-2">What is the Advance-Decline Line?</h4>
              <p className="text-sm text-muted-foreground">
                The Advance-Decline Line (A/D Line) is a breadth indicator that measures the number of advancing stocks minus the number of declining stocks. It's calculated cumulatively, meaning each day's net advances are added to the previous day's total.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Formula:</h4>
              <p className="text-sm text-muted-foreground font-mono bg-muted p-2 rounded">
                AD Line = Previous AD Line + (Advancing Stocks - Declining Stocks)
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Interpretation:</h4>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li><strong>Rising A/D Line:</strong> More stocks are advancing than declining, indicating broad market strength</li>
                <li><strong>Falling A/D Line:</strong> More stocks are declining than advancing, indicating broad market weakness</li>
                <li><strong>Divergence:</strong> If the market index is rising but A/D Line is falling, it suggests the rally is narrow and may not be sustainable</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Data Source:</h4>
              <p className="text-sm text-muted-foreground">
                This chart uses the top {limit} Pakistan Stock Exchange (PSX) stocks by market capitalization. A stock is considered "advancing" if its price increased from the previous trading day, "declining" if it decreased, and "unchanged" if the price remained the same.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

