"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Chart, registerables } from "chart.js"
import "chartjs-adapter-date-fns"
import type { RiskMetrics } from "@/lib/eth-analysis"

Chart.register(...registerables)

interface EthUsdBandsChartProps {
  riskMetrics: RiskMetrics | null
}

export function EthUsdBandsChart({ riskMetrics }: EthUsdBandsChartProps) {
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstance = useRef<Chart | null>(null)

  const [showBands, setShowBands] = useState({
    sigma1: true,
    sigma2: true,
    sigma3: true,
    fairValue: true,
  })

  useEffect(() => {
    if (!chartRef.current || !riskMetrics) return

    // Destroy existing chart
    if (chartInstance.current) {
      chartInstance.current.destroy()
    }

    const ctx = chartRef.current.getContext("2d")
    if (!ctx) return

    // Get ETH/USD prices from the weekly data
    const ethUsdPrices = riskMetrics.dates.map((_, i) => {
      // Calculate ETH/USD from the current state and bands relationship
      const fairValue = riskMetrics.bands.fair[i]
      const sVal = riskMetrics.sVal[i]
      // Reverse engineer ETH/USD from S_val and fair value
      const zScore = sVal * 6.0 - 3.0
      return fairValue * Math.exp(zScore * 0.5) // Approximate reconstruction
    })

    const datasets = [
      {
        label: "ETH/USD Price",
        data: ethUsdPrices,
        borderColor: "rgb(0, 0, 0)",
        backgroundColor: "rgba(0, 0, 0, 0.1)",
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        hidden: false, // Always show price
      },
    ]

    // Add fair value band if enabled
    if (showBands.fairValue) {
      datasets.push({
        label: "Fair Value",
        data: riskMetrics.bands.fair,
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        borderWidth: 2,
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0,
        hidden: false,
      })
    }

    // Add ±3σ bands if enabled
    if (showBands.sigma3) {
      datasets.push(
        {
          label: "Upper Band (+3σ)",
          data: riskMetrics.bands.upper3s,
          borderColor: "rgb(147, 51, 234)",
          backgroundColor: "rgba(147, 51, 234, 0.1)",
          borderWidth: 1,
          borderDash: [1, 1],
          fill: false,
          pointRadius: 0,
          hidden: false,
        },
        {
          label: "Lower Band (-3σ)",
          data: riskMetrics.bands.lower3s,
          borderColor: "rgb(147, 51, 234)",
          backgroundColor: "rgba(147, 51, 234, 0.1)",
          borderWidth: 1,
          borderDash: [1, 1],
          fill: false,
          pointRadius: 0,
          hidden: false,
        },
      )
    }

    // Add ±2σ bands if enabled
    if (showBands.sigma2) {
      datasets.push(
        {
          label: "Upper Band (+2σ)",
          data: riskMetrics.bands.upper2s,
          borderColor: "rgb(239, 68, 68)",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          borderWidth: 1,
          borderDash: [2, 2],
          fill: false,
          pointRadius: 0,
          hidden: false,
        },
        {
          label: "Lower Band (-2σ)",
          data: riskMetrics.bands.lower2s,
          borderColor: "rgb(239, 68, 68)",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          borderWidth: 1,
          borderDash: [2, 2],
          fill: false,
          pointRadius: 0,
          hidden: false,
        },
      )
    }

    // Add ±1σ bands if enabled
    if (showBands.sigma1) {
      datasets.push(
        {
          label: "Upper Band (+1σ)",
          data: riskMetrics.bands.upper1s,
          borderColor: "rgb(34, 197, 94)",
          backgroundColor: "rgba(34, 197, 94, 0.1)",
          borderWidth: 1,
          borderDash: [3, 3],
          fill: false,
          pointRadius: 0,
          hidden: false,
        },
        {
          label: "Lower Band (-1σ)",
          data: riskMetrics.bands.lower1s,
          borderColor: "rgb(34, 197, 94)",
          backgroundColor: "rgba(34, 197, 94, 0.1)",
          borderWidth: 1,
          borderDash: [3, 3],
          fill: false,
          pointRadius: 0,
          hidden: false,
        },
      )
    }

    chartInstance.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: riskMetrics.dates.map((date) => date.toISOString().split("T")[0]),
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            type: "time",
            time: {
              unit: "month",
            },
            title: {
              display: true,
              text: "Date",
            },
          },
          y: {
            type: "logarithmic",
            title: {
              display: true,
              text: "Price (USD, Log Scale)",
            },
            grid: {
              color: "rgba(0, 0, 0, 0.1)",
            },
          },
        },
        plugins: {
          legend: {
            position: "top",
          },
          tooltip: {
            mode: "index",
            intersect: false,
          },
        },
        interaction: {
          mode: "nearest",
          axis: "x",
          intersect: false,
        },
      },
    })

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy()
      }
    }
  }, [riskMetrics, showBands]) // Added showBands to dependency array

  const toggleBand = (bandType: keyof typeof showBands) => {
    setShowBands((prev) => ({
      ...prev,
      [bandType]: !prev[bandType],
    }))
  }

  if (!riskMetrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>ETH/USD with Fair Value Bands</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center text-muted-foreground">Loading chart data...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>ETH/USD with Fair Value Bands</CardTitle>
        <div className="flex flex-wrap gap-2 mt-2">
          <Button
            variant={showBands.fairValue ? "default" : "outline"}
            size="sm"
            onClick={() => toggleBand("fairValue")}
          >
            Fair Value
          </Button>
          <Button variant={showBands.sigma1 ? "default" : "outline"} size="sm" onClick={() => toggleBand("sigma1")}>
            ±1σ
          </Button>
          <Button variant={showBands.sigma2 ? "default" : "outline"} size="sm" onClick={() => toggleBand("sigma2")}>
            ±2σ
          </Button>
          <Button variant={showBands.sigma3 ? "default" : "outline"} size="sm" onClick={() => toggleBand("sigma3")}>
            ±3σ
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-96">
          <canvas ref={chartRef} />
        </div>
      </CardContent>
    </Card>
  )
}
