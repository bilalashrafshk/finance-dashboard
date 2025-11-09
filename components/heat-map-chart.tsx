"use client"

import { useMemo, useRef, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Info } from "lucide-react"
import { Line } from "react-chartjs-2"
import { ChartExplanationDialog } from "./chart-explanation-dialog"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ScatterController,
} from "chart.js"
import "chartjs-adapter-date-fns"
import type { RiskMetrics } from "@/lib/eth-analysis"
import { createTimeSeriesChartOptions } from "@/lib/charts/chart-config"
import { crosshairPlugin } from "@/lib/charts/crosshair-plugin"
import { RISK_THRESHOLDS } from "@/lib/config/app.config"

ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ScatterController,
  crosshairPlugin,
)

interface HeatMapChartProps {
  riskMetrics: RiskMetrics
  hoveredDate: Date | null
  onHoverDate: (date: Date | null) => void
}

/**
 * Get risk band for a risk score (0-1 range)
 * Returns band index (0-9 for 0.0-0.1, 0.1-0.2, ..., 0.9-1.0)
 */
function getRiskBand(risk: number): number {
  return Math.min(9, Math.floor(risk * 10))
}

/**
 * Get color for risk band
 * Green (low risk) -> Yellow (medium risk) -> Red (high risk)
 */
function getRiskBandColor(band: number): string {
  // Color gradient from green (0) to yellow (5) to red (9)
  const colors = [
    "rgba(34, 197, 94, 0.8)",    // 0.0-0.1: Green
    "rgba(74, 222, 128, 0.8)",   // 0.1-0.2: Light Green
    "rgba(163, 230, 53, 0.8)",   // 0.2-0.3: Lime
    "rgba(234, 179, 8, 0.8)",    // 0.3-0.4: Yellow
    "rgba(251, 191, 36, 0.8)",   // 0.4-0.5: Amber
    "rgba(245, 158, 11, 0.8)",  // 0.5-0.6: Orange
    "rgba(249, 115, 22, 0.8)",  // 0.6-0.7: Deep Orange
    "rgba(239, 68, 68, 0.8)",   // 0.7-0.8: Red
    "rgba(220, 38, 38, 0.8)",    // 0.8-0.9: Dark Red
    "rgba(185, 28, 28, 0.8)",    // 0.9-1.0: Very Dark Red
  ]
  return colors[band] || colors[0]
}

/**
 * Get label for risk band
 */
function getRiskBandLabel(band: number): string {
  const min = (band * 0.1).toFixed(1)
  const max = ((band + 1) * 0.1).toFixed(1)
  return `${min}-${max}`
}

export function HeatMapChart({ riskMetrics, hoveredDate, onHoverDate }: HeatMapChartProps) {
  const chartRef = useRef<any>(null)
  const [showExplanation, setShowExplanation] = useState(false)
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [currentHoverIndex, setCurrentHoverIndex] = useState<number | null>(null)

  const chartData = useMemo(() => {
    if (!riskMetrics?.dates || !riskMetrics?.ethUsdPrices || !riskMetrics?.riskEq) {
      return {
        labels: [],
        datasets: [],
      }
    }

    // Format data for time series: {x: Date, y: number}
    const formatTimeSeriesData = (values: number[]) => {
      return riskMetrics.dates.map((date, i) => ({
        x: date,
        y: values[i] || null,
      }))
    }

    // Create price line dataset - only line, no points
    const priceDataset = {
      label: "ETH/USD Price",
      data: formatTimeSeriesData(riskMetrics.ethUsdPrices),
      borderColor: "rgb(59, 130, 246)",
      backgroundColor: "rgba(59, 130, 246, 0.1)",
      borderWidth: 2,
      fill: false,
      pointRadius: 0, // No points on price line
      pointHoverRadius: 6, // Show hover point for tooltip
      pointHoverBorderWidth: 2,
      tension: 0.1,
      order: 2, // Draw on top
    }

    // Group data points by risk band (0-0.1, 0.1-0.2, ..., 0.9-1.0)
    // Store original index with each point for accurate tooltip lookup
    const riskBands: { [key: number]: Array<{ x: Date; y: number; risk: number; originalIndex: number }> } = {}
    
    for (let i = 0; i < riskMetrics.dates.length; i++) {
      const risk = riskMetrics.riskEq[i] || 0
      const band = getRiskBand(risk)
      
      if (!riskBands[band]) {
        riskBands[band] = []
      }
      
      riskBands[band].push({
        x: riskMetrics.dates[i],
        y: riskMetrics.ethUsdPrices[i],
        risk: risk,
        originalIndex: i, // Store original index for accurate lookup
      })
    }

    // Create bubble datasets for each risk band
    // These should be points only, not lines
    const bubbleDatasets = Object.keys(riskBands)
      .map(Number)
      .sort((a, b) => a - b)
      .map((band) => ({
        label: `Risk ${getRiskBandLabel(band)}`,
        data: riskBands[band].map((point) => ({
          x: point.x,
          y: point.y,
          originalIndex: point.originalIndex, // Store original index in data
        })),
        type: "scatter" as const, // Use scatter type to show only points
        backgroundColor: getRiskBandColor(band),
        borderColor: getRiskBandColor(band).replace("0.8", "1.0"),
        borderWidth: 1,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointHoverBorderWidth: 2,
        showLine: false, // No line connecting points
        order: 1, // Draw behind price line
      }))

    const datasets = [...bubbleDatasets, priceDataset]

    return {
      datasets,
    }
  }, [riskMetrics])

  const options = useMemo(() => {
    const opts = createTimeSeriesChartOptions(
      "ETH/USD Price with Risk Heat Map",
      "Price (USD, Log Scale)",
      "logarithmic",
    )

    // Add crosshair plugin
    if (opts.plugins) {
      opts.plugins.crosshair = {
        hoveredDate,
        color: "rgba(0, 0, 0, 0.5)",
        width: 1,
        dash: [5, 5],
      }
    }

    // Add hover handler to update crosshair
    opts.onHover = (event: any, activeElements: any, chart: any) => {
      if (activeElements && activeElements.length > 0) {
        // Get the first active element (could be bubble or price line)
        const element = activeElements[0]
        const datasetIndex = element.datasetIndex
        const priceDatasetIndex = chartData.datasets.length - 1
        
        let pointIndex = -1
        
        if (datasetIndex === priceDatasetIndex) {
          // Price line - use index directly
          pointIndex = element.index
        } else {
          // Bubble - find the date index from the bubble's data
          const bubbleDataset = chartData.datasets[datasetIndex]
          const bubblePoint = bubbleDataset.data[element.index]
          if (bubblePoint && bubblePoint.x) {
            const bubbleDate = new Date(bubblePoint.x)
            const originalIndex = bubblePoint.originalIndex
            
            // Try using originalIndex first if available
            if (originalIndex !== undefined && originalIndex !== null) {
              pointIndex = originalIndex
            } else {
              // Find the exact date match in riskMetrics.dates
              pointIndex = riskMetrics.dates.findIndex((d) => {
                return Math.abs(d.getTime() - bubbleDate.getTime()) < 86400000 // Within 1 day
              })
            }
          }
        }
        
        if (pointIndex >= 0 && pointIndex < riskMetrics.dates.length) {
          const date = riskMetrics.dates[pointIndex]
          
          // Store the index for tooltip use
          setCurrentHoverIndex(pointIndex)
          
          if (date) {
            onHoverDate(date)
            return
          }
        } else {
          setCurrentHoverIndex(null)
        }
      } else {
        setCurrentHoverIndex(null)
      }
      onHoverDate(null)
    }

    // Configure tooltip to show price and risk score
    if (opts.plugins?.tooltip) {
      opts.plugins.tooltip.enabled = true
      opts.plugins.tooltip.mode = "index"
      opts.plugins.tooltip.intersect = false
      opts.plugins.tooltip.filter = (tooltipItem: any) => {
        // Only show tooltip for the price line dataset (last dataset) to avoid duplicates
        const priceDatasetIndex = chartData.datasets.length - 1
        return tooltipItem.datasetIndex === priceDatasetIndex
      }
      opts.plugins.tooltip.callbacks = {
        title: () => "", // No title
        label: (context: any) => {
          // Use the index from hover handler if available, otherwise use context dataIndex
          // This ensures we use the correct index when hovering over bubbles
          const pointIndex = currentHoverIndex !== null ? currentHoverIndex : context.dataIndex
          
          // Validate index and get data
          if (
            pointIndex >= 0 &&
            pointIndex < riskMetrics.dates.length &&
            pointIndex < riskMetrics.ethUsdPrices.length &&
            pointIndex < riskMetrics.riskEq.length
          ) {
            // Get ETH/USD price and risk score for this point
            const price = riskMetrics.ethUsdPrices[pointIndex]
            const risk = riskMetrics.riskEq[pointIndex] || 0
            const date = riskMetrics.dates[pointIndex]
            
            // Return date, price and risk score
            return [
              `Date: ${date.toLocaleDateString()}`,
              `ETH/USD Price: $${price.toLocaleString()}`,
              `Risk Score: ${risk.toFixed(3)}`,
            ]
          }
          return ""
        },
        afterLabel: () => "", // No additional labels
        footer: () => "", // No footer
      }
    }

    // Add custom y-axis ticks
    if (opts.scales?.y && typeof opts.scales.y === "object" && "ticks" in opts.scales.y) {
      opts.scales.y.ticks = {
        callback: (value: any) => "$" + Number(value).toLocaleString(),
      }
    }

    // Configure legend to show all risk bands
    if (opts.plugins?.legend) {
      opts.plugins.legend.display = true
      opts.plugins.legend.filter = (legendItem: any) => {
        // Show all datasets (risk bands and price line)
        return true
      }
    }
    
    // Remove any grid lines or reference lines that might be showing
    if (opts.scales?.x && typeof opts.scales.x === "object") {
      opts.scales.x.grid = {
        display: true, // Keep grid for readability
        color: "rgba(0, 0, 0, 0.05)",
      }
    }
    
    if (opts.scales?.y && typeof opts.scales.y === "object") {
      opts.scales.y.grid = {
        display: true, // Keep grid for readability
        color: "rgba(0, 0, 0, 0.05)",
      }
    }

    return opts
  }, [riskMetrics, hoveredDate, onHoverDate, chartData, currentHoverIndex])

  // Programmatically show tooltip when hoveredDate changes (for crosshair synchronization)
  useEffect(() => {
    if (!chartRef.current || !hoveredDate || !riskMetrics?.dates) return

    const chart = chartRef.current
    const chartInstance = chart?.chartInstance || chart

    if (!chartInstance || !chartInstance.setActiveElements) return

    // Find the index for the hovered date
    let closestIndex = 0
    let minDiff = Math.abs(riskMetrics.dates[0].getTime() - hoveredDate.getTime())

    for (let i = 1; i < riskMetrics.dates.length; i++) {
      const diff = Math.abs(riskMetrics.dates[i].getTime() - hoveredDate.getTime())
      if (diff < minDiff) {
        minDiff = diff
        closestIndex = i
      }
    }

    // Only update crosshair, don't force tooltip
    // The tooltip will show naturally on hover
    chartInstance.update("none")
  }, [hoveredDate, riskMetrics])

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>ETH/USD Price with Risk Heat Map</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowExplanation(true)} className="h-8 w-8">
              <Info className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Price chart with risk score bubbles color-coded by risk bands. Each bubble represents a data point with its
            risk score grouped into bands (0.0-0.1, 0.1-0.2, etc.).
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-64 sm:h-80 md:h-96">
            <Line ref={chartRef} data={chartData} options={options} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((band) => (
              <div key={band} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getRiskBandColor(band) }}
                ></div>
                <span>{getRiskBandLabel(band)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Risk Band Statistics */}
      <RiskBandStatistics
        riskMetrics={riskMetrics}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />
      <ChartExplanationDialog
        open={showExplanation}
        onOpenChange={setShowExplanation}
        chartType="price"
      />
    </>
  )
}

interface RiskBandStatisticsProps {
  riskMetrics: RiskMetrics
  startDate: string
  endDate: string
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void
}

function RiskBandStatistics({
  riskMetrics,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: RiskBandStatisticsProps) {
  const bandCounts = useMemo(() => {
    if (!riskMetrics?.dates || !riskMetrics?.riskEq) {
      return {}
    }

    // Filter dates based on selected range
    let filteredIndices: number[] = []
    for (let i = 0; i < riskMetrics.dates.length; i++) {
      const date = riskMetrics.dates[i]
      const dateStr = date.toISOString().split("T")[0]

      // If no date range selected, include all dates
      if (!startDate && !endDate) {
        filteredIndices.push(i)
      } else {
        // Check if date is within range
        const afterStart = !startDate || dateStr >= startDate
        const beforeEnd = !endDate || dateStr <= endDate
        if (afterStart && beforeEnd) {
          filteredIndices.push(i)
        }
      }
    }

    // Count days in each risk band
    const counts: { [key: number]: number } = {}
    for (let i = 0; i < 10; i++) {
      counts[i] = 0
    }

    filteredIndices.forEach((index) => {
      const risk = riskMetrics.riskEq[index] || 0
      const band = getRiskBand(risk)
      counts[band] = (counts[band] || 0) + 1
    })

    return counts
  }, [riskMetrics, startDate, endDate])

  const totalDays = useMemo(() => {
    return Object.values(bandCounts).reduce((sum, count) => sum + count, 0)
  }, [bandCounts])

  // Get min and max dates for date inputs
  const minDate = riskMetrics?.dates?.[0]?.toISOString().split("T")[0] || ""
  const maxDate =
    riskMetrics?.dates?.[riskMetrics.dates.length - 1]?.toISOString().split("T")[0] || ""

  return (
    <Card>
      <CardHeader>
        <CardTitle>Days in Each Risk Band</CardTitle>
        <div className="mt-4 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-2">
            <Label htmlFor="start-date" className="text-xs">
              Start Date (Optional)
            </Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              min={minDate}
              max={maxDate}
              className="text-xs"
            />
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor="end-date" className="text-xs">
              End Date (Optional)
            </Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              min={minDate}
              max={maxDate}
              className="text-xs"
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onStartDateChange("")
                onEndDateChange("")
              }}
              className="text-xs"
            >
              Clear Filters
            </Button>
          </div>
        </div>
        {totalDays > 0 && (
          <p className="text-sm text-muted-foreground mt-2">
            Total weeks in selected range: <strong>{totalDays}</strong> ({totalDays * 7} days)
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((band) => {
            const weeks = bandCounts[band] || 0
            const days = weeks * 7
            const percentage = totalDays > 0 ? ((weeks / totalDays) * 100).toFixed(1) : "0.0"
            return (
              <div
                key={band}
                className="flex flex-col items-center p-3 rounded-lg border"
                style={{
                  borderColor: getRiskBandColor(band).replace("0.8", "0.3"),
                  backgroundColor: getRiskBandColor(band).replace("0.8", "0.1"),
                }}
              >
                <div
                  className="w-4 h-4 rounded-full mb-2"
                  style={{ backgroundColor: getRiskBandColor(band) }}
                ></div>
                <div className="text-xs text-muted-foreground mb-1">{getRiskBandLabel(band)}</div>
                <div className="text-lg font-semibold">{days}</div>
                <div className="text-xs text-muted-foreground">{percentage}%</div>
                <div className="text-xs text-muted-foreground mt-1">days</div>
                <div className="text-xs text-muted-foreground">({weeks} weeks)</div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

