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
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js"
import "chartjs-adapter-date-fns"
import type { RiskMetrics } from "@/lib/eth-analysis"
import { createTimeSeriesChartOptions } from "@/lib/charts/chart-config"
import { crosshairPlugin } from "@/lib/charts/crosshair-plugin"
import { getThemeColors } from "@/lib/charts/theme-colors"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, crosshairPlugin)

interface RiskEqChartProps {
  riskMetrics: RiskMetrics
  hoveredDate: Date | null
  onHoverDate: (date: Date | null) => void
}

export function RiskEqChart({ riskMetrics, hoveredDate, onHoverDate }: RiskEqChartProps) {
  const chartRef = useRef<any>(null)
  const [showExplanation, setShowExplanation] = useState(false)
  const { theme } = useTheme()
  const colors = getThemeColors()

  const chartData = useMemo(() => {
    if (!riskMetrics?.dates || !riskMetrics?.riskEq) {
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
        label: "Risk_eq",
        data: formatTimeSeriesData(riskMetrics.riskEq),
        borderColor: colors.riskEq,
        backgroundColor: `${colors.riskEq}1A`,
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        tension: 0.1,
      },
    ]

    return {
      datasets,
    }
  }, [riskMetrics, colors, theme])

  const options = useMemo(() => {
    const opts = createTimeSeriesChartOptions("Risk_eq (Composite Risk Metric)", "Risk_eq", "linear")
  
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
        const index = element.index
        const date = riskMetrics.dates[index]
        if (date) {
          onHoverDate(date)
        }
      } else {
        onHoverDate(null)
      }
    }
    
    // Override y-axis to be linear with 0-1 range
    if (opts.scales?.y) {
      opts.scales.y = {
        type: "linear",
        min: 0,
        max: 1,
        title: {
          display: true,
          text: "Risk_eq",
        },
        ticks: {
          stepSize: 0.2,
          callback: (value: any) => Number(value).toFixed(1),
        },
        grid: {
          color: (context: any) => {
            const value = context.tick.value as number
            if (value === 0.2 || value === 0.5 || value === 0.8) {
              return colors.gridStrong // Reference lines
            }
            return colors.grid // Regular grid
          },
        },
      }
    }

    // Add custom tooltip callback
    if (opts.plugins?.tooltip) {
      opts.plugins.tooltip.callbacks = {
        label: (context: any) => {
          if (context.parsed.y === null || context.parsed.y === undefined) {
            return `Risk_eq: N/A`
          }
          return `Risk_eq: ${context.parsed.y.toFixed(3)}`
        },
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
            <CardTitle>Risk_eq (Composite Risk Metric)</CardTitle>
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
          <div className="h-56 sm:h-64 md:h-72">
            <Line ref={chartRef} data={chartData} options={options} />
          </div>
        </CardContent>
      </Card>
      <ChartExplanationDialog
        open={showExplanation}
        onOpenChange={setShowExplanation}
        chartType="riskeq"
      />
    </>
  )
}

