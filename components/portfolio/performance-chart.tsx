"use client"

import { useMemo } from "react"
import { useTheme } from "next-themes"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js"
import type { AssetTypeAllocation } from "@/lib/portfolio/types"
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS } from "@/lib/portfolio/types"
import { getThemeColors } from "@/lib/charts/theme-colors"
import { formatCurrency } from "@/lib/portfolio/portfolio-utils"
import { ChartInfo } from "@/components/chart-info"

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface PerformanceChartProps {
  allocation: AssetTypeAllocation[]
  currency?: string
}

export function PerformanceChart({ allocation, currency = 'USD' }: PerformanceChartProps) {
  const { theme } = useTheme()
  const colors = getThemeColors()

  const chartData = useMemo(() => {
    if (allocation.length === 0) {
      return {
        labels: [],
        datasets: [],
      }
    }

    return {
      labels: allocation.map((item) => ASSET_TYPE_LABELS[item.assetType]),
      datasets: [
        {
          label: 'Portfolio Value by Asset Type',
          data: allocation.map((item) => item.value),
          backgroundColor: allocation.map((item) => ASSET_TYPE_COLORS[item.assetType]),
          borderColor: allocation.map((item) => ASSET_TYPE_COLORS[item.assetType]),
          borderWidth: 1,
        },
      ],
    }
  }, [allocation])

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: colors.background,
        titleColor: colors.foreground,
        bodyColor: colors.foreground,
        borderColor: colors.border,
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: any) => {
            const value = context.parsed.y || 0
            const percentage = allocation[context.dataIndex]?.percentage || 0
            return [
              `Value: ${formatCurrency(value, currency)}`,
              `Allocation: ${percentage.toFixed(2)}%`,
              `Holdings: ${allocation[context.dataIndex]?.count || 0}`,
            ]
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
          color: colors.grid,
        },
        ticks: {
          color: colors.foreground,
        },
      },
      y: {
        grid: {
          color: colors.grid,
        },
        ticks: {
          color: colors.foreground,
          callback: (value: any) => {
            const num = Number(value)
            const currencySymbol = currency === 'PKR' ? 'Rs.' : currency === 'USD' ? '$' : currency
            if (num >= 1000000) return `${currencySymbol}${(num / 1000000).toFixed(1)}M`
            if (num >= 1000) return `${currencySymbol}${(num / 1000).toFixed(1)}K`
            return `${currencySymbol}${num.toFixed(0)}`
          },
        },
      },
    },
  }), [allocation, currency, colors])

  if (allocation.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Asset Type Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No holdings to display
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Asset Type Breakdown</CardTitle>
          <ChartInfo
            title="Asset Type Breakdown"
            explanation="Compare the total value and count of holdings for each asset type in your portfolio."
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <Bar data={chartData} options={chartOptions} />
        </div>
      </CardContent>
    </Card>
  )
}

