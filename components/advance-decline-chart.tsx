"use client"

import { useMemo, useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  TimeScale,
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
  TimeScale,
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
  const [kse100Data, setKse100Data] = useState<Array<{ date: string; close: number }>>([])
  const [showKse100, setShowKse100] = useState(true)
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
        // Fetch AD Line data
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

        // Fetch KSE100 data using centralized route
        if (showKse100) {
          const kse100Params = new URLSearchParams()
          kse100Params.append('assetType', 'kse100')
          kse100Params.append('symbol', 'KSE100')
          if (startDate) kse100Params.append('startDate', startDate)
          if (endDate) kse100Params.append('endDate', endDate)
          
          const kse100Response = await fetch(`/api/historical-data?${kse100Params.toString()}`)
          
          if (kse100Response.ok) {
            const kse100Result = await kse100Response.json()
            if (kse100Result.data && Array.isArray(kse100Result.data)) {
              const formatted = kse100Result.data
                .map((record: any) => ({
                  date: record.date,
                  close: parseFloat(record.close || record.adjusted_close || 0)
                }))
                .filter((point: any) => !isNaN(point.close) && point.close > 0)
              setKse100Data(formatted)
            }
          }
        } else {
          setKse100Data([])
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
  }, [startDate, endDate, limit, showKse100, toast])

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

    // Create a date map for KSE100 data (normalize dates to strings for matching)
    const kse100DateMap = new Map<string, number>()
    kse100Data.forEach(d => {
      // Normalize date to string format (YYYY-MM-DD)
      const dateStr = typeof d.date === 'string' ? d.date : new Date(d.date).toISOString().split('T')[0]
      kse100DateMap.set(dateStr, d.close)
    })
    
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
        yAxisID: 'y',
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
        yAxisID: 'y',
      },
    ]

    // Add KSE100 overlay if enabled - use separate y-axis
    if (showKse100 && kse100Data.length > 0) {
      // Map KSE100 values to AD Line dates
      const kse100Values = data.map(point => {
        // Normalize date to string format for matching
        const dateStr = typeof point.date === 'string' ? point.date : new Date(point.date).toISOString().split('T')[0]
        const kse100Value = kse100DateMap.get(dateStr)
        return kse100Value || null
      })

      datasets.push({
        label: 'KSE100',
        data: formatTimeSeriesData(kse100Values),
        borderColor: '#f59e0b',
        backgroundColor: '#f59e0b20',
        fill: false,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 1.5,
        yAxisID: 'y1', // Use separate y-axis
      })
    }

    return {
      datasets,
    }
  }, [data, kse100Data, showKse100, colors])

  const options = useMemo(() => {
    const opts = createTimeSeriesChartOptions(
      "Advance-Decline Line (Top 100 PK Stocks)",
      "AD Line Value",
      "linear"
    )

    // Customize for AD Line - override the 0-1 scale from createTimeSeriesChartOptions
    if (opts.scales?.y) {
      // Calculate min/max from data for proper scaling
      const adLineValues = data.map(d => d.adLine)
      const netAdvanceValues = data.map(d => d.netAdvances)
      const allValues = [...adLineValues, ...netAdvanceValues].filter(v => v !== null && v !== undefined)
      const minValue = allValues.length > 0 ? Math.min(...allValues) : 0
      const maxValue = allValues.length > 0 ? Math.max(...allValues) : 1
      
      // Add padding to the range
      const range = maxValue - minValue
      const padding = range * 0.1 || 10
      
      opts.scales.y = {
        type: "linear",
        position: "left",
        min: minValue - padding,
        max: maxValue + padding,
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

      // Add second y-axis for KSE100 if enabled
      if (showKse100 && kse100Data.length > 0) {
        // Calculate min/max from the actual mapped values that will be displayed
        const kse100DateMap = new Map<string, number>()
        kse100Data.forEach(d => {
          const dateStr = typeof d.date === 'string' ? d.date : new Date(d.date).toISOString().split('T')[0]
          kse100DateMap.set(dateStr, d.close)
        })
        
        const kse100MappedValues = data
          .map(point => {
            const dateStr = typeof point.date === 'string' ? point.date : new Date(point.date).toISOString().split('T')[0]
            return kse100DateMap.get(dateStr)
          })
          .filter((v): v is number => v !== null && v !== undefined && v > 0)
        
        const kse100Min = kse100MappedValues.length > 0 ? Math.min(...kse100MappedValues) : 0
        const kse100Max = kse100MappedValues.length > 0 ? Math.max(...kse100MappedValues) : 1
        const kse100Range = kse100Max - kse100Min
        const kse100Padding = kse100Range * 0.1 || 100

        opts.scales.y1 = {
          type: "linear",
          position: "right",
          min: kse100Min - kse100Padding,
          max: kse100Max + kse100Padding,
          title: {
            display: true,
            text: "KSE100 Index",
            color: '#f59e0b',
          },
          ticks: {
            color: '#f59e0b',
            callback: function(value: any) {
              return typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : value
            },
          },
          grid: {
            drawOnChartArea: false, // Only draw grid for left axis
          },
        }
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
            const labels = [
              `Advancing: ${point.advancing}`,
              `Declining: ${point.declining}`,
              `Unchanged: ${point.unchanged}`,
              `Net Advances: ${point.netAdvances > 0 ? '+' : ''}${point.netAdvances}`,
            ]
            
            // Add KSE100 value if available
            if (showKse100 && kse100Data.length > 0) {
              const kse100Value = kse100Data.find(d => d.date === point.date)?.close
              if (kse100Value) {
                labels.push(`KSE100: ${kse100Value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
              }
            }
            
            return labels
          }
          return []
        },
      }
    }

    // Add click handler for net advances
    opts.onClick = (event: any, elements: any[]) => {
      if (elements && elements.length > 0) {
        const element = elements[0]
        const datasetIndex = element.datasetIndex
        const dataIndex = element.index
        
        // Check if clicked on Net Advances dataset (index 1)
        // Note: datasetIndex 0 = AD Line, 1 = Net Advances, 2 = KSE100 (if enabled)
        if (datasetIndex === 1 && dataIndex >= 0 && dataIndex < data.length) {
          const point = data[dataIndex]
          // Open heatmap page for that date
          window.open(`/market-heatmap?date=${point.date}`, '_blank')
        }
      }
    }
    
    // Ensure interaction mode allows clicking on lines (not just points)
    // This is already set in createTimeSeriesChartOptions, but ensure it's correct
    if (opts.interaction) {
      opts.interaction.mode = 'nearest'
      opts.interaction.intersect = false
    }
    
    // Also add interaction mode to make clicking easier
    opts.interaction = {
      ...opts.interaction,
      mode: 'nearest' as const,
      intersect: false,
    }

    return opts
  }, [data, colors, theme, showKse100, kse100Data])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Advance-Decline Line</CardTitle>
          <CardDescription>Top {limit} stocks by market cap</CardDescription>
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
          <CardDescription>Top {limit} stocks by market cap</CardDescription>
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
          <CardDescription>Top {limit} stocks by market cap</CardDescription>
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
                Top {limit} stocks by market cap
                {data.length > 0 && (
                  <span className="ml-2">
                    ({new Date(data[0].date).toLocaleDateString()} - {new Date(data[data.length - 1].date).toLocaleDateString()})
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-kse100"
                  checked={showKse100}
                  onCheckedChange={(checked) => setShowKse100(checked === true)}
                />
                <label
                  htmlFor="show-kse100"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  KSE100 Overlay
                </label>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowExplanation(true)}
              >
                <Info className="h-4 w-4" />
              </Button>
            </div>
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
          <p className="text-xs mt-2">
            💡 <strong>Tip:</strong> Click on any point in the "Net Advances" line to view the market heatmap for that date.
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

