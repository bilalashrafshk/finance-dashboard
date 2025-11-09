"use client"

import { useEffect, useRef, useState, useMemo, useCallback } from "react"
import { useTheme } from "next-themes"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Info } from "lucide-react"
import { Chart, registerables } from "chart.js"
import { ChartExplanationDialog } from "./chart-explanation-dialog"
import "chartjs-adapter-date-fns"
import type { RiskMetrics } from "@/lib/eth-analysis"
import { METRIC_NAMES } from "@/lib/config/metric-names.config"
import { linearRegression } from "@/lib/algorithms/helpers"
import { detectPeaks, detectTroughs, getTopExtremes } from "@/lib/algorithms/peak-trough-detection"
import { createTimeSeriesChartOptions } from "@/lib/charts/chart-config"
import { createTrendlineDataset, createExtremePointsDataset } from "@/lib/charts/dataset-helpers"
import { crosshairPlugin } from "@/lib/charts/crosshair-plugin"
import { getThemeColors } from "@/lib/charts/theme-colors"

Chart.register(...registerables, crosshairPlugin)

interface EthBtcProperChartProps {
  riskMetrics: RiskMetrics
  hoveredDate: Date | null
  onHoverDate: (date: Date | null) => void
}

export function EthBtcProperChart({ riskMetrics, hoveredDate, onHoverDate }: EthBtcProperChartProps) {
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstance = useRef<Chart | null>(null)
  const [showExplanation, setShowExplanation] = useState(false)
  const { theme } = useTheme()
  
  // Memoize colors to prevent unnecessary re-renders
  const colors = useMemo(() => getThemeColors(), [theme])
  
  // Memoize onHoverDate callback to prevent recreation
  const onHoverDateRef = useRef(onHoverDate)
  useEffect(() => {
    onHoverDateRef.current = onHoverDate
  }, [onHoverDate])
  
  // Store dates ref to use in hover handler
  const datesRef = useRef(riskMetrics?.dates || [])
  useEffect(() => {
    datesRef.current = riskMetrics?.dates || []
  }, [riskMetrics?.dates])
  
  const handleHover = useCallback((event: any, activeElements: any, chart: any) => {
    if (activeElements && activeElements.length > 0) {
      const element = activeElements[0]
      const index = element.index
      const date = datesRef.current[index]
      if (date) {
        onHoverDateRef.current(date)
      }
    } else {
      onHoverDateRef.current(null)
    }
  }, [])

  useEffect(() => {
    if (!chartRef.current || !riskMetrics || !riskMetrics.dates || !riskMetrics.ethBtcPrices) {
      return
    }

    if (riskMetrics.dates.length === 0 || riskMetrics.ethBtcPrices.length === 0) {
      return
    }

    // Destroy existing chart
    if (chartInstance.current) {
      chartInstance.current.destroy()
    }

    const ctx = chartRef.current.getContext("2d")
    if (!ctx) return

    // Calculate ETH/BTC data and trendlines using the extracted algorithms
    const { dates, ethBtcPrices } = riskMetrics

    if (dates.length !== ethBtcPrices.length) {
      return
    }

    // Convert to log space for peak/trough detection
    const logRatio = ethBtcPrices.map((price) => Math.log(price))
    const timeYears = dates.map((date, i) => (date.getTime() - dates[0].getTime()) / (365.25 * 24 * 60 * 60 * 1000))

    // Find peaks and troughs using extracted algorithm
    const peaks = detectPeaks(logRatio)
    const troughs = detectTroughs(logRatio)

    // Get top extremes using extracted algorithm
    const nExtremes = Math.min(5, Math.max(3, Math.floor(peaks.length / 3)))
    const { topPeaks, bottomTroughs } = getTopExtremes(peaks, troughs, logRatio, nExtremes)

    // Convert to linear space for display
    const topPeaksLinear = topPeaks.map((p) => ({ ...p, linearValue: ethBtcPrices[p.index] }))
    const bottomTroughsLinear = bottomTroughs.map((t) => ({ ...t, linearValue: ethBtcPrices[t.index] }))

    // Fit trendlines in LINEAR space for display
    const peakTimes = topPeaksLinear.map((p) => timeYears[p.index])
    const peakLinearValues = topPeaksLinear.map((p) => p.linearValue)
    const troughTimes = bottomTroughsLinear.map((t) => timeYears[t.index])
    const troughLinearValues = bottomTroughsLinear.map((t) => t.linearValue)

    // Linear regression for display trendlines
    const upperCoeff = linearRegression(peakTimes, peakLinearValues)
    const lowerCoeff = linearRegression(troughTimes, troughLinearValues)

    // Calculate trendlines for all time points
    const upperTrendline = timeYears.map((t) => upperCoeff.slope * t + upperCoeff.intercept)
    const lowerTrendline = timeYears.map((t) => lowerCoeff.slope * t + lowerCoeff.intercept)

    // Apply minimum separation
    const minSeparation = (Math.max(...ethBtcPrices) - Math.min(...ethBtcPrices)) * 0.1
    const adjustedUpperTrendline = upperTrendline.map((upper, i) => {
      const gap = upper - lowerTrendline[i]
      return gap < minSeparation ? lowerTrendline[i] + minSeparation : upper
    })

    // Create datasets using chart helpers
    const peakData = dates.map((date, i) => {
      const peak = topPeaksLinear.find((p) => p.index === i)
      return peak ? peak.linearValue : null
    })
    const troughData = dates.map((date, i) => {
      const trough = bottomTroughsLinear.find((t) => t.index === i)
      return trough ? trough.linearValue : null
    })

    const chartOptions = createTimeSeriesChartOptions(`ETH/BTC with ${METRIC_NAMES.sRel.short} Trendlines`, "ETH/BTC Ratio (Log Scale)", "logarithmic")
    
    // Add crosshair plugin
    if (chartOptions.plugins) {
      chartOptions.plugins.crosshair = {
        hoveredDate: null, // Initialize as null, will be updated in separate effect
        color: colors.crosshair,
        width: 1,
        dash: [5, 5],
      }
    }

    // Add hover handler to update crosshair and show tooltip
    chartOptions.onHover = handleHover

    // Enable tooltip to show on hover
    if (chartOptions.plugins?.tooltip) {
      chartOptions.plugins.tooltip.enabled = true
    }

    chartInstance.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: dates,
        datasets: [
          {
            label: "ETH/BTC",
            data: ethBtcPrices,
            borderColor: colors.price,
            backgroundColor: `${colors.price}1A`,
            borderWidth: 2,
            fill: false,
            pointRadius: 0,
          },
          createTrendlineDataset("Upper Trendline", adjustedUpperTrendline, colors.riskEq),
          createTrendlineDataset("Lower Trendline", lowerTrendline, colors.sVal),
          createExtremePointsDataset("Peaks", peakData, colors.riskEq, "triangle", 0),
          createExtremePointsDataset("Troughs", troughData, colors.sVal, "triangle", 180),
        ],
      },
      options: chartOptions,
    })

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy()
      }
    }
  }, [riskMetrics, colors, theme])

  // Update crosshair when hoveredDate changes (without recreating chart)
  useEffect(() => {
    if (!chartInstance.current) return

    const chart = chartInstance.current
    const crosshairPlugin = chart.options.plugins?.crosshair as any
    if (crosshairPlugin) {
      crosshairPlugin.hoveredDate = hoveredDate
      chart.update('none')
    }
  }, [hoveredDate])

  // Programmatically show tooltip when hoveredDate changes
  useEffect(() => {
    if (!chartInstance.current || !hoveredDate || !riskMetrics?.dates) return

    const chart = chartInstance.current
    const dates = riskMetrics.dates

    // Find the index for the hovered date
    let closestIndex = 0
    let minDiff = Math.abs(dates[0].getTime() - hoveredDate.getTime())

    for (let i = 1; i < dates.length; i++) {
      const diff = Math.abs(dates[i].getTime() - hoveredDate.getTime())
      if (diff < minDiff) {
        minDiff = diff
        closestIndex = i
      }
    }

    // Get x position for the date
    const xScale = chart.scales?.x
    if (!xScale) return

    const xValue = hoveredDate.getTime()
    const xPos = xScale.getPixelForValue(xValue)

    // Create active elements for all datasets at this index
    const activeElements: any[] = []
    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex)
      if (meta && meta.data[closestIndex]) {
        activeElements.push({
          datasetIndex,
          index: closestIndex,
          element: meta.data[closestIndex],
        })
      }
    })
    
    if (activeElements.length > 0) {
      // Set active elements to show tooltip
      chart.setActiveElements(activeElements)
      
      // Trigger tooltip update
      const tooltip = chart.tooltip
      if (tooltip && tooltip.setActiveElements) {
        tooltip.setActiveElements(activeElements, { x: xPos, y: chart.chartArea.top })
      }
      
      chart.update('none')
    }
  }, [hoveredDate, riskMetrics])

  if (!riskMetrics || !riskMetrics.dates || !riskMetrics.ethBtcPrices) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>ETH/BTC with {METRIC_NAMES.sRel.short} Trendlines</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center">
            <p className="text-muted-foreground">Loading chart data...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>ETH/BTC with {METRIC_NAMES.sRel.short} Trendlines</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowExplanation(true)}
              className="h-8 w-8"
            >
              <Info className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-96">
            <canvas ref={chartRef} />
          </div>
        </CardContent>
      </Card>
      <ChartExplanationDialog
        open={showExplanation}
        onOpenChange={setShowExplanation}
        chartType="ethbtc"
      />
    </>
  )
}

