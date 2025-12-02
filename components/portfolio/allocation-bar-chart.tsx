"use client"

import { useState, useMemo } from "react"
import { useTheme } from "next-themes"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bar } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js"
import type { AssetTypeAllocation, AssetType, Holding } from "@/lib/portfolio/types"
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS } from "@/lib/portfolio/types"
import { formatCurrency, combineHoldingsByAsset, calculateCurrentValue } from "@/lib/portfolio/portfolio-utils"
import { Info, X } from "lucide-react"

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface AllocationBarChartProps {
  allocation: AssetTypeAllocation[]
  holdings: Holding[]
  currency?: string
}

export function AllocationBarChart({ allocation, holdings, currency = 'USD' }: AllocationBarChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [expandedAssetType, setExpandedAssetType] = useState<AssetType | null>(null)

  // Define colors based on theme
  const colors = useMemo(() => ({
    foreground: isDark ? 'rgb(250, 250, 250)' : 'rgb(23, 23, 23)',
    background: isDark ? 'rgb(23, 23, 23)' : 'rgb(255, 255, 255)',
    border: isDark ? 'rgb(64, 64, 64)' : 'rgb(229, 229, 229)',
  }), [isDark])

  // Calculate holdings breakdown for expanded asset type
  const holdingsBreakdown = useMemo(() => {
    if (!expandedAssetType) return null

    // Combine holdings by asset before filtering
    const combinedHoldings = combineHoldingsByAsset(holdings)
    const assetHoldings = combinedHoldings.filter(h => h.assetType === expandedAssetType)
    if (assetHoldings.length === 0) return null

    // Group by currency to calculate totals per currency
    const holdingsByCurrency = new Map<string, typeof assetHoldings>()
    assetHoldings.forEach(holding => {
      const holdingCurrency = holding.currency || 'USD'
      if (!holdingsByCurrency.has(holdingCurrency)) {
        holdingsByCurrency.set(holdingCurrency, [])
      }
      holdingsByCurrency.get(holdingCurrency)!.push(holding)
    })

    // Calculate breakdown per currency
    const breakdown: Array<{
      symbol: string
      name: string
      value: number
      percentage: number
      currency: string
    }> = []

    holdingsByCurrency.forEach((currencyHoldings, holdingCurrency) => {
      const totalValue = currencyHoldings.reduce((sum, h) => sum + calculateCurrentValue(h), 0)
      
      currencyHoldings.forEach(holding => {
        const value = calculateCurrentValue(holding)
        breakdown.push({
          symbol: holding.symbol,
          name: holding.name || holding.symbol,
          value,
          percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
          currency: holdingCurrency,
        })
      })
    })

    return breakdown.sort((a, b) => b.value - a.value)
  }, [expandedAssetType, holdings])

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

    // Sort by value descending
    const sortedAllocation = [...allocation].sort((a, b) => b.value - a.value)

    return {
      labels: sortedAllocation.map((item) => ASSET_TYPE_LABELS[item.assetType]),
      datasets: [
        {
          label: 'Value',
          data: sortedAllocation.map((item) => item.percentage),
          backgroundColor: sortedAllocation.map((item) => ASSET_TYPE_COLORS[item.assetType]),
          borderColor: sortedAllocation.map((item) => ASSET_TYPE_COLORS[item.assetType]),
          borderWidth: 0,
        },
      ],
    }
  }, [allocation])

  const chartOptions = useMemo(() => ({
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 300, // Fast animation for initial load only
    },
    onClick: (event: any, elements: any[]) => {
      if (elements.length > 0 && !expandedAssetType) {
        const clickedIndex = elements[0].index
        const sortedAllocation = [...allocation].sort((a, b) => b.value - a.value)
        const clickedAssetType = sortedAllocation[clickedIndex]?.assetType
        if (clickedAssetType) {
          setExpandedAssetType(clickedAssetType)
        }
      }
    },
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
            const index = context.dataIndex
            const sortedAllocation = [...allocation].sort((a, b) => b.value - a.value)
            const item = sortedAllocation[index]
            return [
              `Value: ${formatCurrency(item.value, currency)}`,
              `Allocation: ${item.percentage.toFixed(1)}%`,
              `Holdings: ${item.count}`,
              expandedAssetType ? '' : 'Click to view breakdown',
            ]
          },
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 100,
        ticks: {
          color: colors.foreground,
          callback: function(value: any) {
            return value + '%'
          },
        },
        grid: {
          color: colors.border,
        },
      },
      y: {
        ticks: {
          color: colors.foreground,
        },
        grid: {
          display: false,
        },
      },
    },
  }), [allocation, currency, colors, expandedAssetType])

  // Holdings breakdown chart data
  const holdingsChartData = useMemo(() => {
    if (!holdingsBreakdown || holdingsBreakdown.length === 0) return null

    return {
      labels: holdingsBreakdown.map(h => h.symbol),
      datasets: [
        {
          label: 'Value',
          data: holdingsBreakdown.map(h => h.percentage),
          backgroundColor: holdingsBreakdown.map((_, index) => {
            // Generate color variations from the asset type color
            const baseColor = ASSET_TYPE_COLORS[expandedAssetType!]
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
            const [r, g, b] = hexToRgb(baseColor)
            const factor = 0.7 + (index % 4) * 0.1
            const newR = Math.min(255, r * factor)
            const newG = Math.min(255, g * factor)
            const newB = Math.min(255, b * factor)
            return rgbToHex(newR, newG, newB)
          }),
          borderColor: holdingsBreakdown.map(() => ASSET_TYPE_COLORS[expandedAssetType!]),
          borderWidth: 0,
        },
      ],
    }
  }, [holdingsBreakdown, expandedAssetType])

  const holdingsChartOptions = useMemo(() => ({
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 0, // Disable animation for instant rendering
    },
    transitions: {
      show: {
        animation: {
          duration: 0,
        },
      },
      hide: {
        animation: {
          duration: 0,
        },
      },
    },
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
            const index = context.dataIndex
            const holding = holdingsBreakdown?.[index]
            if (!holding) return []
            return [
              `Value: ${formatCurrency(holding.value, holding.currency)}`,
              `Allocation: ${holding.percentage.toFixed(1)}%`,
            ]
          },
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 100,
        ticks: {
          color: colors.foreground,
          callback: function(value: any) {
            return value + '%'
          },
        },
        grid: {
          color: colors.border,
        },
      },
      y: {
        ticks: {
          color: colors.foreground,
        },
        grid: {
          display: false,
        },
      },
    },
  }), [holdingsBreakdown, currency, colors])

  if (allocation.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Asset Allocation</CardTitle>
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No holdings to display
          </div>
        </CardContent>
      </Card>
    )
  }

  // Sort allocation for display
  const sortedAllocation = [...allocation].sort((a, b) => b.value - a.value)
  const totalValue = sortedAllocation.reduce((sum, item) => sum + item.value, 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>
              {expandedAssetType 
                ? `${ASSET_TYPE_LABELS[expandedAssetType]} Holdings Breakdown`
                : 'Asset Allocation'}
            </CardTitle>
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>
          {expandedAssetType && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpandedAssetType(null)}
              className="h-8"
            >
              <X className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {expandedAssetType && holdingsChartData ? (
          <>
            {/* Holdings Breakdown Chart */}
            <div className="h-[200px]">
              <Bar data={holdingsChartData} options={holdingsChartOptions} />
            </div>

            {/* Holdings Details List */}
            <div className="space-y-2">
              {holdingsBreakdown?.map((holding) => (
                <div key={`${holding.symbol}-${holding.currency}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-sm"
                      style={{ backgroundColor: ASSET_TYPE_COLORS[expandedAssetType] }}
                    />
                    <span className="font-medium">{holding.symbol}</span>
                    {holding.name !== holding.symbol && (
                      <span className="text-sm text-muted-foreground">({holding.name})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(holding.value, holding.currency)}
                    </span>
                    <span className="text-sm font-semibold w-12 text-right">
                      {holding.percentage.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Main Asset Allocation Chart */}
            <div className="h-[200px]">
              <Bar data={chartData} options={chartOptions} />
            </div>

            {/* Details List */}
            <div className="space-y-2">
              {sortedAllocation.map((item) => (
                <div 
                  key={item.assetType} 
                  className="flex items-center justify-between cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors"
                  onClick={() => setExpandedAssetType(item.assetType)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-sm"
                      style={{ backgroundColor: ASSET_TYPE_COLORS[item.assetType] }}
                    />
                    <span className="font-medium">{ASSET_TYPE_LABELS[item.assetType]}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(item.value, currency)}
                    </span>
                    <span className="text-sm font-semibold w-12 text-right">
                      {item.percentage.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

