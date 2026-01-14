"use client"

import { useState, useCallback } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatCurrency } from "@/lib/asset-screener/metrics-calculations"
import { Line } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from "chart.js"
import type { MarketHeatmapStock } from "./treemap"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

interface StockListPopoverProps {
  stocks: MarketHeatmapStock[]
  sector: string | null
  industry: string | null
  children: React.ReactNode
  portalContainer?: HTMLElement | null
  sectorChange?: number
}

interface SparklineData {
  symbol: string
  prices: number[]
  dates: string[]
}

export function StockListPopover({ stocks, sector, industry, children, portalContainer, sectorChange }: StockListPopoverProps) {
  const [sparklineData, setSparklineData] = useState<Map<string, SparklineData>>(new Map())
  const [loading, setLoading] = useState(false)

  // Fetch sparkline data for all stocks in the popover when it opens
  const fetchAllSparklines = useCallback(async () => {
    if (loading || stocks.length === 0) return
    setLoading(true)

    const results = new Map<string, SparklineData>()
    const symbols = stocks.slice(0, 15).map(s => s.symbol) // Limit to 15 to avoid overload

    try {
      await Promise.all(symbols.map(async (symbol) => {
        try {
          const res = await fetch(`/api/market/price?type=pk-equity&symbol=${symbol}&startDate=${getDateNDaysAgo(7)}&endDate=${getDateNDaysAgo(0)}`)
          if (res.ok) {
            const data = await res.json()
            const priceData = data.data || data.historicalData || data.prices || []

            if (Array.isArray(priceData) && priceData.length > 0) {
              const prices = priceData.map((d: any) => parseFloat(d.close || d.c || 0)).filter(p => !isNaN(p))
              const dates = priceData.map((d: any) => d.date || d.t || '')

              results.set(symbol, {
                symbol,
                prices,
                dates
              })
            }
          }
        } catch (e) {
          console.error(`Failed to fetch sparkline for ${symbol}:`, e)
        }
      }))

      setSparklineData(results)
    } finally {
      setLoading(false)
    }
  }, [stocks, loading])

  // Sort stocks by market cap (largest first)
  const sortedStocks = [...stocks].sort((a, b) => b.marketCap - a.marketCap)
  const mainStock = sortedStocks[0]
  const otherStocks = sortedStocks.slice(1)

  const getSparklineChart = (stock: MarketHeatmapStock) => {
    const data = sparklineData.get(stock.symbol)
    if (!data || data.prices.length === 0) {
      return null
    }

    const chartData = {
      labels: data.dates,
      datasets: [
        {
          data: data.prices,
          borderColor: stock.changePercent !== null && stock.changePercent >= 0 ? '#22c55e' : '#ef4444',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
        },
      ],
    }

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: { display: false },
        y: { display: false },
      },
    }

    return <Line data={chartData} options={options} />
  }

  return (
    <Popover onOpenChange={(open) => open && fetchAllSparklines()}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-[500px] max-h-[min(600px,calc(100vh-40px))] overflow-y-auto p-0 border-0 shadow-2xl bg-white dark:bg-gray-900"
        align="start"
        side="right"
        sideOffset={8}
        alignOffset={0}
        avoidCollisions={true}
        collisionPadding={{ top: 20, bottom: 20, left: 20, right: 20 }}
        onOpenAutoFocus={(e) => e.preventDefault()}
        container={portalContainer}
      >
        {/* Category Header - Red background */}
        <div className="sticky top-0 z-10 bg-[#dc2626] text-white px-4 py-3 font-bold text-sm leading-tight tracking-wider shadow-sm flex justify-between items-center">
          <span>{sector?.toUpperCase() || 'MARKET'}</span>
          {typeof sectorChange === 'number' && (
            <span className="text-xs font-black bg-white/20 px-2 py-0.5 rounded">
              {sectorChange > 0 ? '+' : ''}{sectorChange.toFixed(2)}%
            </span>
          )}
        </div>

        {/* Main Stock (Largest) - Red background highlight */}
        {mainStock && (
          <div className="bg-[#fee2e2] dark:bg-[#7f1d1d]/30 px-4 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 leading-none tracking-tight mb-1">{mainStock.symbol}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 truncate font-medium">{mainStock.name}</div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="w-24 h-12 flex-shrink-0 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-1">
                  {getSparklineChart(mainStock) || (
                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                      -
                    </div>
                  )}
                </div>
                <div className="text-right min-w-[100px]">
                  <div className="text-xl font-extrabold text-gray-900 dark:text-gray-100 leading-tight tracking-tight mb-1">
                    {formatCurrency(mainStock.price, 'PKR', 2)}
                  </div>
                  <div
                    className={`text-lg font-extrabold leading-tight ${mainStock.changePercent !== null && mainStock.changePercent >= 0
                      ? 'text-green-600 dark:text-green-500'
                      : 'text-red-600 dark:text-red-500'
                      }`}
                  >
                    {mainStock.changePercent !== null
                      ? `${mainStock.changePercent > 0 ? '+' : ''}${mainStock.changePercent.toFixed(2)}%`
                      : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Other Stocks List */}
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {otherStocks.map((stock) => (
            <div key={stock.symbol} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-gray-900 dark:text-gray-100 text-sm tracking-tight">{stock.symbol}</div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="w-20 h-10 flex-shrink-0 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-1">
                    {getSparklineChart(stock) || (
                      <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                        -
                      </div>
                    )}
                  </div>
                  <div className="text-right min-w-[100px]">
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight tracking-tight mb-0.5">
                      {formatCurrency(stock.price, 'PKR', 2)}
                    </div>
                    <div
                      className={`text-sm font-extrabold leading-tight ${stock.changePercent !== null && stock.changePercent >= 0
                        ? 'text-green-600 dark:text-green-500'
                        : 'text-red-600 dark:text-red-500'
                        }`}
                    >
                      {stock.changePercent !== null
                        ? `${stock.changePercent > 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%`
                        : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {loading && (
          <div className="px-4 py-2 text-xs text-muted-foreground text-center">
            Loading sparklines...
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function getDateNDaysAgo(n: number): string {
  const date = new Date()
  date.setDate(date.getDate() - n)
  return date.toISOString().split('T')[0]
}
