"use client"

import { useState, useMemo } from "react"
import { useTheme } from "next-themes"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Pie } from "react-chartjs-2"
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js"
import type { AssetTypeAllocation, AssetType, Holding } from "@/lib/portfolio/types"
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS } from "@/lib/portfolio/types"
import { getThemeColors } from "@/lib/charts/theme-colors"
import { formatCurrency, calculateCurrentValue } from "@/lib/portfolio/portfolio-utils"
import { X } from "lucide-react"

ChartJS.register(ArcElement, Tooltip, Legend)

interface AllocationChartProps {
  allocation: AssetTypeAllocation[]
  holdings: Holding[]
  currency?: string
}

export function AllocationChart({ allocation, holdings, currency = 'USD' }: AllocationChartProps) {
  const { theme } = useTheme()
  const colors = getThemeColors()
  const [expandedAssetType, setExpandedAssetType] = useState<AssetType | null>(null)

  const chartData = useMemo(() => {
    if (allocation.length === 0) {
      return {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: [],
        }],
      }
    }

    return {
      labels: allocation.map((item) => `${ASSET_TYPE_LABELS[item.assetType]} (${item.count})`),
      datasets: [
        {
          data: allocation.map((item) => item.value),
          backgroundColor: allocation.map((item) => ASSET_TYPE_COLORS[item.assetType]),
          borderColor: colors.background,
          borderWidth: 2,
        },
      ],
    }
  }, [allocation, colors.background])

  // Calculate holdings breakdown for expanded asset type
  const holdingsBreakdown = useMemo(() => {
    if (!expandedAssetType) return null
    
    const assetHoldings = holdings.filter(h => h.assetType === expandedAssetType)
    if (assetHoldings.length === 0) return null
    
    const totalValue = assetHoldings.reduce((sum, h) => sum + calculateCurrentValue(h), 0)
    
    return assetHoldings.map(holding => {
      const value = calculateCurrentValue(holding)
      return {
        symbol: holding.symbol,
        name: holding.name,
        value,
        percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
      }
    }).sort((a, b) => b.value - a.value)
  }, [expandedAssetType, holdings])

  const holdingsChartData = useMemo(() => {
    if (!holdingsBreakdown || holdingsBreakdown.length === 0) return null
    
    // Generate colors for holdings (use variations of the asset type color)
    const baseColor = ASSET_TYPE_COLORS[expandedAssetType!]
    
    // Convert hex to RGB for manipulation
    const hexToRgb = (hex: string): [number, number, number] => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
      return result
        ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
        : [0, 0, 0]
    }
    
    const rgbToHex = (r: number, g: number, b: number): string => {
      return `#${[r, g, b].map(x => {
        const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16)
        return hex.length === 1 ? '0' + hex : hex
      }).join('')}`
    }
    
    const generateColors = (count: number): string[] => {
      const [r, g, b] = hexToRgb(baseColor)
      const colors: string[] = []
      
      for (let i = 0; i < count; i++) {
        // Create variations by adjusting brightness
        const factor = 0.7 + (i % 4) * 0.1 // Vary between 0.7 and 1.0
        const newR = Math.min(255, r * factor)
        const newG = Math.min(255, g * factor)
        const newB = Math.min(255, b * factor)
        colors.push(rgbToHex(newR, newG, newB))
      }
      
      return colors
    }
    
    return {
      labels: holdingsBreakdown.map(h => `${h.symbol}${h.name !== h.symbol ? ` (${h.name})` : ''}`),
      datasets: [{
        data: holdingsBreakdown.map(h => h.value),
        backgroundColor: generateColors(holdingsBreakdown.length),
        borderColor: colors.background,
        borderWidth: 2,
      }],
    }
  }, [holdingsBreakdown, expandedAssetType, colors.background])

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    onClick: (event: any, elements: any[]) => {
      if (elements.length > 0) {
        const clickedIndex = elements[0].index
        const clickedAssetType = allocation[clickedIndex]?.assetType
        if (clickedAssetType) {
          // Toggle expansion
          setExpandedAssetType(prev => prev === clickedAssetType ? null : clickedAssetType)
        }
      }
    },
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: colors.foreground,
          padding: 15,
          font: {
            size: 12,
          },
          generateLabels: (chart: any) => {
            const data = chart.data
            if (data.labels.length === 0) return []
            
            return data.labels.map((label: string, index: number) => {
              const value = data.datasets[0].data[index]
              const percentage = allocation[index]?.percentage || 0
              const assetType = allocation[index]?.assetType
              const isExpanded = expandedAssetType === assetType
              
              return {
                text: `${label} - ${formatCurrency(value, currency)} (${percentage.toFixed(1)}%)${isExpanded ? ' ▼' : ''}`,
                fillStyle: data.datasets[0].backgroundColor[index],
                strokeStyle: data.datasets[0].borderColor,
                lineWidth: data.datasets[0].borderWidth,
                hidden: false,
                index,
              }
            })
          },
        },
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
            const label = context.label || ''
            const value = context.parsed || 0
            const percentage = allocation[context.dataIndex]?.percentage || 0
            return [
              label,
              `Value: ${formatCurrency(value, currency)}`,
              `Allocation: ${percentage.toFixed(2)}%`,
              'Click to view holdings breakdown',
            ]
          },
        },
      },
    },
  }), [allocation, currency, colors, expandedAssetType])

  const holdingsChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: colors.foreground,
          padding: 10,
          font: {
            size: 11,
          },
          generateLabels: (chart: any) => {
            const data = chart.data
            if (data.labels.length === 0) return []
            
            return data.labels.map((label: string, index: number) => {
              const value = data.datasets[0].data[index]
              const percentage = holdingsBreakdown?.[index]?.percentage || 0
              return {
                text: `${label} - ${formatCurrency(value, currency)} (${percentage.toFixed(1)}%)`,
                fillStyle: data.datasets[0].backgroundColor[index],
                strokeStyle: data.datasets[0].borderColor,
                lineWidth: data.datasets[0].borderWidth,
                hidden: false,
                index,
              }
            })
          },
        },
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
            const label = context.label || ''
            const value = context.parsed || 0
            const percentage = holdingsBreakdown?.[context.dataIndex]?.percentage || 0
            return [
              label,
              `Value: ${formatCurrency(value, currency)}`,
              `Allocation: ${percentage.toFixed(2)}%`,
            ]
          },
        },
      },
    },
  }), [holdingsBreakdown, currency, colors])

  if (allocation.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Asset Allocation</CardTitle>
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
        <div className="flex items-center justify-between">
          <CardTitle>Asset Allocation</CardTitle>
          {expandedAssetType && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpandedAssetType(null)}
              className="h-8"
            >
              <X className="h-4 w-4 mr-1" />
              Close Breakdown
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[300px]">
          <Pie data={chartData} options={chartOptions} />
        </div>
        
        {expandedAssetType && holdingsChartData && (
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">
                {ASSET_TYPE_LABELS[expandedAssetType]} Holdings Breakdown
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpandedAssetType(null)}
                className="h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="h-[250px]">
              <Pie data={holdingsChartData} options={holdingsChartOptions} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

