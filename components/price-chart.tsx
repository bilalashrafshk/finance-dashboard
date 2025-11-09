"use client"

import { useMemo, useRef, useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
} from "chart.js"
import "chartjs-adapter-date-fns"
import type { RiskMetrics } from "@/lib/eth-analysis"
import { createTimeSeriesChartOptions } from "@/lib/charts/chart-config"
import { createPriceDataset, createFairValueDataset, createSigmaBandDataset } from "@/lib/charts/dataset-helpers"
import { crosshairPlugin } from "@/lib/charts/crosshair-plugin"
import { getThemeColors } from "@/lib/charts/theme-colors"

ChartJS.register(CategoryScale, LinearScale, LogarithmicScale, PointElement, LineElement, Title, Tooltip, Legend, crosshairPlugin)

interface PriceChartProps {
  riskMetrics: RiskMetrics
  hoveredDate: Date | null
  onHoverDate: (date: Date | null) => void
}

export function PriceChart({ riskMetrics, hoveredDate, onHoverDate }: PriceChartProps) {
  const chartRef = useRef<any>(null)
  const [showExplanation, setShowExplanation] = useState(false)
  const { theme } = useTheme()
  const colors = getThemeColors()

  const chartData = useMemo(() => {
    if (!riskMetrics?.dates || !riskMetrics?.ethUsdPrices) {
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

    const datasets = [
      {
        ...createPriceDataset(riskMetrics.ethUsdPrices, riskMetrics.dates),
        data: formatTimeSeriesData(riskMetrics.ethUsdPrices),
        borderColor: colors.price,
      },
      {
        ...createFairValueDataset(riskMetrics.bands?.fair || []),
        data: formatTimeSeriesData(riskMetrics.bands?.fair || []),
        borderColor: colors.fairValue,
      },
      ...createSigmaBandDataset("+1σ", riskMetrics.bands?.upper1s || [], riskMetrics.bands?.lower1s || [], colors.sRel, [2, 2]).map((ds, idx) => ({
        ...ds,
        data: formatTimeSeriesData(idx === 0 ? riskMetrics.bands?.upper1s || [] : riskMetrics.bands?.lower1s || []),
      })),
      ...createSigmaBandDataset("+2σ", riskMetrics.bands?.upper2s || [], riskMetrics.bands?.lower2s || [], colors.riskEq, [2, 2]).map((ds, idx) => ({
        ...ds,
        data: formatTimeSeriesData(idx === 0 ? riskMetrics.bands?.upper2s || [] : riskMetrics.bands?.lower2s || []),
      })),
    ]

    return {
      datasets,
    }
  }, [riskMetrics, colors, theme])

  const options = useMemo(() => {
    const opts = createTimeSeriesChartOptions("ETH/USD Price with Fair Value Bands", "Price (USD, Log Scale)", "logarithmic")
  
    // Add crosshair plugin
    if (opts.plugins) {
      opts.plugins.crosshair = {
        hoveredDate,
        color: colors.crosshair,
        width: 1,
        dash: [5, 5],
      }
    }

    // Add hover handler to update crosshair and show tooltip
    opts.onHover = (event: any, activeElements: any, chart: any) => {
      if (activeElements && activeElements.length > 0) {
        const element = activeElements[0]
        const datasetIndex = element.datasetIndex
        const index = element.index
        const date = riskMetrics.dates[index]
        if (date) {
          onHoverDate(date)
        }
      } else {
        onHoverDate(null)
      }
    }

    // Enable tooltip to show on hover
    if (opts.plugins?.tooltip) {
      opts.plugins.tooltip.enabled = true
      opts.plugins.tooltip.external = (context: any) => {
        // Let Chart.js handle the tooltip natively
      }
    }
    
    // Add custom tooltip callback
    if (opts.plugins?.tooltip) {
      opts.plugins.tooltip.callbacks = {
        label: (context: any) => `${context.dataset.label}: $${context.parsed.y.toLocaleString()}`,
      }
    }
  
  // Add custom y-axis ticks
  if (opts.scales?.y && typeof opts.scales.y === 'object' && 'ticks' in opts.scales.y) {
    opts.scales.y.ticks = {
      callback: (value: any) => "$" + Number(value).toLocaleString(),
    }
  }

  return opts
  }, [riskMetrics, hoveredDate, onHoverDate, colors, theme])

  // Programmatically show tooltip when hoveredDate changes
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

    // Get x position for the date
    const xScale = chartInstance.scales?.x
    if (!xScale) return

    const xValue = hoveredDate.getTime()
    const xPos = xScale.getPixelForValue(xValue)

    // Create active elements for all datasets at this index
    const activeElements: any[] = []
    chartData.datasets.forEach((dataset, datasetIndex) => {
      const meta = chartInstance.getDatasetMeta(datasetIndex)
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
      chartInstance.setActiveElements(activeElements)
      
      // Trigger tooltip update
      const tooltip = chartInstance.tooltip
      if (tooltip && tooltip.setActiveElements) {
        tooltip.setActiveElements(activeElements, { x: xPos, y: chartInstance.chartArea.top })
      }
      
      chartInstance.update('none')
    }
  }, [hoveredDate, riskMetrics, chartData])

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>ETH/USD Price Analysis</CardTitle>
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
          <div className="h-64 sm:h-80 md:h-96">
            <Line ref={chartRef} data={chartData} options={options} />
          </div>
        </CardContent>
      </Card>
      <ChartExplanationDialog
        open={showExplanation}
        onOpenChange={setShowExplanation}
        chartType="price"
      />
    </>
  )
}
