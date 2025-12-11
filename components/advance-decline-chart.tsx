"use client"

import { useMemo, useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Loader2, Info, Settings, ExternalLink, List } from "lucide-react"
import Link from "next/link"
import { Line } from "react-chartjs-2"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { useRef } from "react"

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
  const [sectorIndexData, setSectorIndexData] = useState<Array<{ date: string; index: number }>>([])
  const [showKse100, setShowKse100] = useState(true)
  const [showSectorIndex, setShowSectorIndex] = useState(false)
  const [includeDividends, setIncludeDividends] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showExplanation, setShowExplanation] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedSector, setSelectedSector] = useState<string>("all")
  const [availableSectors, setAvailableSectors] = useState<string[]>([])
  const [topN, setTopN] = useState(limit)
  const [totalStocksInSector, setTotalStocksInSector] = useState<number | null>(null)

  // Initialize dates: use props if provided, otherwise default to 1 year ago to today
  const getDefaultStartDate = (): string => {
    if (startDate) return startDate
    const date = new Date()
    date.setFullYear(date.getFullYear() - 1)
    return date.toISOString().split('T')[0]
  }
  const getDefaultEndDate = (): string => {
    if (endDate) return endDate
    return new Date().toISOString().split('T')[0]
  }

  const [internalStartDate, setInternalStartDate] = useState<string>(getDefaultStartDate())
  const [internalEndDate, setInternalEndDate] = useState<string>(getDefaultEndDate())
  const { theme } = useTheme()
  const colors = useMemo(() => {
    return getThemeColors()
  }, [theme])

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [replayKey, setReplayKey] = useState(0)

  const { toast } = useToast()

  // Update internal dates when props change
  useEffect(() => {
    if (startDate) setInternalStartDate(startDate)
    if (endDate) setInternalEndDate(endDate)
  }, [startDate, endDate])

  // Fetch available sectors on mount
  useEffect(() => {
    async function fetchSectors() {
      try {
        const response = await fetch('/api/screener/stocks')
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.stocks) {
            // Extract unique sectors, filter out 'Unknown' and null values
            const sectors = Array.from(
              new Set(
                result.stocks
                  .map((stock: any) => stock.sector)
                  .filter((sector: string | null) => sector && sector !== 'Unknown')
              )
            ).sort() as string[]
            setAvailableSectors(sectors)
          }
        }
      } catch (err) {
        // Silently fail - sectors will remain empty
      }
    }
    fetchSectors()
  }, [])

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        // Fetch AD Line data
        const params = new URLSearchParams()
        if (internalStartDate) params.append('startDate', internalStartDate)
        if (internalEndDate) params.append('endDate', internalEndDate)
        params.append('limit', topN.toString())
        if (selectedSector && selectedSector !== 'all') {
          params.append('sector', selectedSector)
        }

        const response = await fetch(`/api/advance-decline?${params.toString()}`)

        if (!response.ok) {
          throw new Error('Failed to fetch Advance-Decline data')
        }

        const result = await response.json()

        if (result.success) {
          setData(result.data || [])
          setTotalStocksInSector(result.totalStocksInSector || null)
        } else {
          throw new Error(result.error || 'Failed to fetch data')
        }

        // Always fetch sector index if sector is selected (fetch regardless of showSectorIndex toggle for better UX)
        if (selectedSector && selectedSector !== 'all' && internalStartDate) {
          try {
            const sectorIndexParams = new URLSearchParams()
            sectorIndexParams.append('sector', selectedSector)
            sectorIndexParams.append('startDate', internalStartDate)
            if (internalEndDate) sectorIndexParams.append('endDate', internalEndDate)
            sectorIndexParams.append('includeDividends', includeDividends.toString())

            const sectorIndexResponse = await fetch(`/api/sector-index?${sectorIndexParams.toString()}`)

            if (sectorIndexResponse.ok) {
              const sectorIndexResult = await sectorIndexResponse.json()
              if (sectorIndexResult.success && sectorIndexResult.data && sectorIndexResult.data.length > 0) {
                const mappedData = sectorIndexResult.data.map((d: any) => ({
                  date: typeof d.date === 'string' ? d.date.split('T')[0] : new Date(d.date).toISOString().split('T')[0],
                  index: parseFloat(d.index) || 0
                })).filter((d: any) => d.index > 0)

                if (mappedData.length > 0) {
                  setSectorIndexData(mappedData)
                } else {
                  setSectorIndexData([])
                }
              } else {
                setSectorIndexData([])
              }
            } else {
              setSectorIndexData([])
            }
          } catch (err: any) {
            setSectorIndexData([])
          }
        } else {
          setSectorIndexData([])
        }

        // Fetch KSE100 data using centralized route
        if (showKse100) {
          const kse100Params = new URLSearchParams()
          kse100Params.append('assetType', 'kse100')
          kse100Params.append('symbol', 'KSE100')
          if (internalStartDate) kse100Params.append('startDate', internalStartDate)
          if (internalEndDate) kse100Params.append('endDate', internalEndDate)

          const kse100Response = await fetch(`/api/historical-data?${kse100Params.toString()}`)

          if (kse100Response.ok) {
            const kse100Result = await kse100Response.json()
            if (kse100Result.data && Array.isArray(kse100Result.data)) {
              // Filter by date range if provided (API might not filter properly)
              let filtered = kse100Result.data
              if (startDate || endDate) {
                filtered = kse100Result.data.filter((record: any) => {
                  const recordDate = typeof record.date === 'string'
                    ? record.date.split('T')[0]
                    : new Date(record.date).toISOString().split('T')[0]
                  if (startDate && recordDate < startDate) return false
                  if (endDate && recordDate > endDate) return false
                  return true
                })
              }

              const formatted = filtered
                .map((record: any) => {
                  // Normalize date to YYYY-MM-DD format
                  const dateStr = typeof record.date === 'string'
                    ? record.date.split('T')[0]
                    : new Date(record.date).toISOString().split('T')[0]
                  return {
                    date: dateStr,
                    close: parseFloat(record.close || record.adjusted_close || 0)
                  }
                })
                .filter((point: any) => !isNaN(point.close) && point.close > 0)

              setKse100Data(formatted)
            }
          }
        }
      } catch (err: any) {
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
  }, [internalStartDate, internalEndDate, topN, showKse100, selectedSector, includeDividends, toast])

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

    // Create a date map for sector index data
    const sectorIndexDateMap = new Map<string, number>()
    sectorIndexData.forEach(d => {
      const dateStr = typeof d.date === 'string' ? d.date : new Date(d.date).toISOString().split('T')[0]
      sectorIndexDateMap.set(dateStr, d.index)
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
        borderDash: [],
        spanGaps: true,
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
        spanGaps: true, // Join lines across gaps (weekends)
      },
    ]

    // Add KSE100 overlay if enabled - use separate y-axis
    if (showKse100 && kse100Data.length > 0) {
      // Map KSE100 values to AD Line dates, forward-filling to avoid breaks over weekends
      let lastKse100Value: number | null = null
      const kse100Values = data.map(point => {
        // Normalize date to string format for matching
        const dateStr = typeof point.date === 'string'
          ? point.date.split('T')[0]
          : new Date(point.date).toISOString().split('T')[0]
        const kse100Value = kse100DateMap.get(dateStr)

        // If we have a value, use it and update last known value
        if (kse100Value !== undefined) {
          lastKse100Value = kse100Value
          return kse100Value
        }

        // If no value (weekend/holiday), use last known value to keep line continuous
        return lastKse100Value || 0
      })

      const matchedCount = kse100Values.filter(v => v !== null).length

      datasets.push({
        label: 'KSE100',
        data: formatTimeSeriesData(kse100Values.map(v => v !== null ? v : 0)), // Ensure no nulls
        borderColor: '#f59e0b',
        backgroundColor: '#f59e0b20',
        fill: false,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2, // Changed from 1.5 to 2
        borderDash: [], // Added
        yAxisID: 'y3', // Changed from y1 to y3
        spanGaps: true, // Connect across gaps (weekends)
      })
    }

    // Add sector index overlay if enabled
    if (showSectorIndex && sectorIndexData.length > 0) {
      let lastSectorIndexValue: number | null = null
      const sectorIndexValues = data.map(point => {
        const dateStr = typeof point.date === 'string'
          ? point.date.split('T')[0]
          : new Date(point.date).toISOString().split('T')[0]
        const sectorIndexValue = sectorIndexDateMap.get(dateStr)

        if (sectorIndexValue !== undefined && sectorIndexValue !== null) {
          lastSectorIndexValue = sectorIndexValue
          return sectorIndexValue
        }

        // Forward-fill with last known value to keep line continuous
        return lastSectorIndexValue || 0
      })

      // Only add dataset if we have at least some valid values
      const validValues = sectorIndexValues.filter(v => v !== null && v !== undefined)
      if (validValues.length > 0) {
        datasets.push({
          label: `${selectedSector} Index${includeDividends ? ' (Total Return)' : ' (Price Return)'}`,
          data: formatTimeSeriesData(sectorIndexValues.map(v => v !== null ? v : 0)), // Ensure no nulls if strictly typed
          borderColor: '#8b5cf6',
          backgroundColor: '#8b5cf620',
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 1.5,
          borderDash: [3, 3],
          yAxisID: 'y2', // Use third y-axis
          spanGaps: true,
        })
      }
    }

    return {
      datasets,
    }
  }, [data, kse100Data, sectorIndexData, showKse100, showSectorIndex, selectedSector, includeDividends, colors])

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
          callback: function (value: any) {
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
        const kse100Values = kse100Data.map(d => d.close).filter(v => v !== null && v !== undefined && v > 0)
        const kse100Min = kse100Values.length > 0 ? Math.min(...kse100Values) : 0
        const kse100Max = kse100Values.length > 0 ? Math.max(...kse100Values) : 1
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
            callback: function (value: any) {
              return typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : value
            },
          },
          grid: {
            drawOnChartArea: false, // Only draw grid for left axis
          },
        }
      }

      // Add or remove third y-axis for sector index
      if (showSectorIndex && sectorIndexData.length > 0) {
        const sectorIndexValues = sectorIndexData.map(d => d.index).filter(v => v !== null && v !== undefined)
        const sectorIndexMin = sectorIndexValues.length > 0 ? Math.min(...sectorIndexValues) : 0
        const sectorIndexMax = sectorIndexValues.length > 0 ? Math.max(...sectorIndexValues) : 1
        const sectorIndexRange = sectorIndexMax - sectorIndexMin
        const sectorIndexPadding = sectorIndexRange * 0.1 || 10

        opts.scales.y2 = {
          type: "linear",
          position: "right",
          min: sectorIndexMin - sectorIndexPadding,
          max: sectorIndexMax + sectorIndexPadding,
          title: {
            display: true,
            text: `${selectedSector} Index${includeDividends ? ' (TR)' : ' (PR)'}`,
            color: '#8b5cf6',
          },
          ticks: {
            color: '#8b5cf6',
            callback: function (value: any) {
              return typeof value === 'number' ? value.toFixed(1) : value
            },
          },
          grid: {
            drawOnChartArea: false,
          },
        }
      } else {
        // Explicitly remove y2 axis when sector index is disabled
        delete opts.scales.y2
      }
    }

    // Note: Zero line annotation would require chartjs-plugin-annotation
    // For now, we'll rely on the grid line at y=0

    // Disable legend click interaction - only use the checkbox to toggle KSE100
    if (opts.plugins?.legend) {
      opts.plugins.legend.onClick = () => {
        // Disable legend clicks - use checkbox instead
      }
    }

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

            // Add sector index value if available
            if (showSectorIndex && sectorIndexData.length > 0) {
              const sectorIndexValue = sectorIndexData.find(d => d.date === point.date)?.index
              if (sectorIndexValue !== undefined) {
                labels.push(`${selectedSector} Index: ${sectorIndexValue.toFixed(2)}`)
              }
            }

            return labels
          }
          return []
        },
      }
    }

    // Add click handler for net advances - only trigger on Net Advances dataset
    // Chart.js onClick signature: (event, elements, chart) => void
    opts.onClick = (event: any, elements: any[], chart: any) => {
      if (!elements || elements.length === 0) {
        return
      }

      // Find the Net Advances dataset by label
      const netAdvancesDatasetIndex = chart.data.datasets.findIndex((ds: any) => ds.label === 'Net Advances')
      if (netAdvancesDatasetIndex === -1) {
        return
      }

      // Check ALL elements to see if any are from Net Advances dataset
      const netAdvancesElement = elements.find((el: any) => el.datasetIndex === netAdvancesDatasetIndex)

      if (!netAdvancesElement) {
        // Click was not on Net Advances - ignore
        return
      }

      const dataIndex = netAdvancesElement.index

      if (dataIndex < 0 || dataIndex >= data.length) {
        return
      }

      const point = data[dataIndex]
      // Normalize date to YYYY-MM-DD format
      const dateStr = typeof point.date === 'string'
        ? point.date.split('T')[0]
        : new Date(point.date).toISOString().split('T')[0]

      // Link to charts page with market heatmap section
      const url = `/charts#market-heatmap`

      try {
        const newWindow = window.open(url, '_blank')
        if (!newWindow) {
          window.location.href = url
        }
      } catch (err) {
        window.location.href = url
      }
    }

    // Ensure interaction mode allows clicking on lines (not just points)
    opts.interaction = {
      ...opts.interaction,
      mode: 'nearest' as const,
      intersect: false,
    }

    return opts
  }, [data, colors, theme, showKse100, kse100Data, showSectorIndex, sectorIndexData, selectedSector, includeDividends])

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Advance-Decline Line</CardTitle>
            <CardDescription>Loading...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-[400px]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Advance-Decline Line</CardTitle>
            <CardDescription>Error loading data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-[400px] text-destructive">
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Advance-Decline Line</CardTitle>
            <CardDescription>No data available</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-[400px] text-muted-foreground">
              <p>No data available</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Calculate max slider value based on total stocks in sector
  const maxSliderValue = totalStocksInSector ? Math.min(totalStocksInSector, 500) : 500
  const minSliderValue = 10

  return (
    <div className="space-y-4">
      {/* Settings Panel */}
      <Card className="h-full w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Chart Settings
              </CardTitle>
              <CardDescription>Configure date range, filters and overlays</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
              >
                {showSettings ? 'Hide' : 'Show'} Settings
              </Button>
            </div>
          </div>
        </CardHeader>
        {showSettings && (
          <CardContent className="space-y-4">
            <form onSubmit={(e) => e.preventDefault()} onKeyDown={(e) => {
              // Prevent form submission on Enter key
              if (e.key === 'Enter') {
                e.preventDefault()
              }
            }}>
              {/* Date Range */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={internalStartDate}
                    onChange={(e) => {
                      const newValue = e.target.value
                      // Only update if we have a complete date (YYYY-MM-DD format)
                      if (newValue && newValue.length === 10) {
                        setInternalStartDate(newValue)
                      }
                    }}
                    max={internalEndDate}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={internalEndDate}
                    onChange={(e) => {
                      const newValue = e.target.value
                      // Only update if we have a complete date (YYYY-MM-DD format)
                      if (newValue && newValue.length === 10) {
                        setInternalEndDate(newValue)
                      }
                    }}
                    min={internalStartDate}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              {/* Sector Filter */}
              <div className="space-y-2">
                <Label htmlFor="sector-filter">Sector</Label>
                <Select value={selectedSector} onValueChange={setSelectedSector}>
                  <SelectTrigger id="sector-filter">
                    <SelectValue placeholder="All Sectors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sectors</SelectItem>
                    {availableSectors.map((sector) => (
                      <SelectItem key={sector} value={sector}>
                        {sector}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {totalStocksInSector !== null && (
                  <p className="text-sm text-muted-foreground">
                    Total stocks in {selectedSector === 'all' ? 'market' : selectedSector}: {totalStocksInSector}
                  </p>
                )}
              </div>

              {/* Options */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-kse100"
                    checked={showKse100}
                    onCheckedChange={(checked) => setShowKse100(checked as boolean)}
                  />
                  <Label htmlFor="show-kse100">Show KSE100 Overlay</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="show-sector-index"
                    checked={showSectorIndex}
                    disabled={!selectedSector || selectedSector === 'all'}
                    onCheckedChange={(checked) => setShowSectorIndex(checked as boolean)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="show-sector-index" className={(!selectedSector || selectedSector === 'all') ? 'text-muted-foreground' : ''}>
                      Show Sector Index Overlay
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Only available when a specific sector is selected
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-dividends"
                    checked={includeDividends}
                    onCheckedChange={(checked) => setIncludeDividends(checked as boolean)}
                  />
                  <Label htmlFor="include-dividends">Include Dividends in Sector Index (Total Return)</Label>
                </div>
              </div>

              {/* Top N Slider */}
              <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Number of Stocks</Label>
                    <div className="text-xs text-muted-foreground">
                      Analyzing top {topN} stocks by market cap in each period
                    </div>
                  </div>
                  <span className="w-12 rounded-md border border-transparent px-2 py-0.5 text-right text-sm text-muted-foreground hover:border-border">
                    {topN}
                  </span>
                </div>
                <Slider
                  value={[topN]}
                  min={minSliderValue}
                  max={maxSliderValue}
                  step={10}
                  onValueChange={(value) => setTopN(value[0])}
                  className="[&_[role=slider]]:h-4 [&_[role=slider]]:w-4"
                  aria-label="Number of stocks"
                />
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      {/* Chart Card */}
      <div ref={chartContainerRef}>
        <Card className="h-full w-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Advance-Decline Line - {selectedSector === 'all' ? 'All Sectors' : selectedSector}</CardTitle>
                <CardDescription>
                  Cumulative Net Advances ({internalStartDate} to {internalEndDate})
                </CardDescription>
              </div>
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-blue-500 mr-2"></div>
                  <span>AD Line</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-emerald-500 mr-2 opacity-50 border border-emerald-500 border-dashed"></div>
                  <span>Net Advances</span>
                </div>
                {showKse100 && (
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-amber-500 mr-2"></div>
                    <span>KSE100</span>
                  </div>
                )}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 ml-2">
                      <Info className="h-4 w-4" />
                      <span className="sr-only">About AD Line</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>About Advance-Decline Line</DialogTitle>
                      <DialogDescription>
                        Understanding market breadth indicators
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 text-sm">
                      <p>
                        The <strong>Advance-Decline Line (AD Line)</strong> is a market breadth indicator that represents the cumulative difference between the number of advancing and declining stocks.
                      </p>
                      <div>
                        <h4 className="font-semibold mb-2">Formula:</h4>
                        <p className="font-mono bg-muted p-2 rounded text-xs">
                          AD Line = Previous AD Line + (Advancing - Declining)
                        </p>
                      </div>
                      <ul className="list-disc pl-5 space-y-2">
                        <li>
                          <strong>Rising AD Line:</strong> Suggests broad market participation in an uptrend.
                        </li>
                        <li>
                          <strong>Falling AD Line:</strong> Indicates market weakness. Divergence with index suggests a narrow rally.
                        </li>
                      </ul>
                      {selectedSector && selectedSector !== 'all' && (
                        <div>
                          <h4 className="font-semibold mb-1">Sector Index:</h4>
                          <p>
                            Market-cap weighted index of all stocks in the sector (normalized to 100).
                          </p>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {showSectorIndex && sectorIndexData.length === 0 && selectedSector !== 'all' && (
              <Alert className="mb-4">
                <AlertDescription>
                  No index data available for this sector in the selected timeframe. Try expanding the date range.
                </AlertDescription>
              </Alert>
            )}
            <div className="h-[400px] w-full">
              <Line key={replayKey} data={chartData} options={options} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

