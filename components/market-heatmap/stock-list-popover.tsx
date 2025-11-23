"use client"

import { useState, useEffect } from "react"
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
}

interface SparklineData {
  symbol: string
  prices: number[]
  dates: string[]
}

export function StockListPopover({ stocks, sector, industry, children }: StockListPopoverProps) {
  const [sparklineData, setSparklineData] = useState<Map<string, SparklineData>>(new Map())
  const [loading, setLoading] = useState(false)

  // Fetch sparkline data for all stocks
  useEffect(() => {
    if (stocks.length === 0) return

    async function fetchSparklines() {
      setLoading(true)
      const dataMap = new Map<string, SparklineData>()

      // Fetch last 20 days of data for each stock
      await Promise.all(
        stocks.slice(0, 20).map(async (stock) => { // Limit to first 20 to avoid too many requests
          try {
            const response = await fetch(
              `/api/pk-equity/price?ticker=${stock.symbol}&startDate=${getDateNDaysAgo(20)}&endDate=${getDateNDaysAgo(0)}`
            )
            if (response.ok) {
              const data = await response.json()
              // Handle different response formats
              let priceData: any[] = []
              if (data.data && Array.isArray(data.data)) {
                priceData = data.data
              } else if (data.historicalData && Array.isArray(data.historicalData)) {
                priceData = data.historicalData
              } else if (data.prices && Array.isArray(data.prices)) {
                priceData = data.prices
              }
              
              if (priceData.length > 0) {
                // Sort by date ascending
                priceData.sort((a: any, b: any) => {
                  const dateA = a.date || a.t || ''
                  const dateB = b.date || b.t || ''
                  return dateA.localeCompare(dateB)
                })
                
                const prices = priceData.map((d: any) => parseFloat(d.close || d.c || 0)).filter((p: number) => !isNaN(p) && p > 0)
                const dates = priceData.map((d: any) => d.date || d.t || '').filter((d: string) => d)
                
                if (prices.length > 0 && dates.length > 0 && prices.length === dates.length) {
                  dataMap.set(stock.symbol, { symbol: stock.symbol, prices, dates })
                }
              }
            }
          } catch (error) {
            // Silently fail for sparklines - not critical
          }
        })
      )

      setSparklineData(dataMap)
      setLoading(false)
    }

    fetchSparklines()
  }, [stocks])

  // Sort stocks by market cap (largest first)
  const sortedStocks = [...stocks].sort((a, b) => b.marketCap - a.marketCap)
  const mainStock = sortedStocks[0]
  const otherStocks = sortedStocks.slice(1)

  const getSparklineChart = (stock: MarketHeatmapStock) => {
    const data = sparklineData.get(stock.symbol)
    if (!data || data.prices.length === 0) {
      return null
    }

    // Normalize prices to percentage (start from 100)
    const startPrice = data.prices[0]
    const normalizedPrices = data.prices.map((p) => (p / startPrice) * 100)

    const chartData = {
      labels: data.dates,
      datasets: [
        {
          data: normalizedPrices,
          borderColor: stock.changePercent !== null && stock.changePercent >= 0 ? '#22c55e' : '#ef4444',
          backgroundColor: stock.changePercent !== null && stock.changePercent >= 0 ? '#22c55e20' : '#ef444420',
          borderWidth: 1.5,
          fill: true,
          pointRadius: 0,
          tension: 0.3,
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
      elements: {
        point: { radius: 0 },
      },
    }

    return <Line data={chartData} options={options} />
  }

  // Format category name: "SECTOR - INDUSTRY" or just "SECTOR"
  const categoryName = industry && sector
    ? `${sector} - ${industry}`
    : (sector || "Stocks")

  return (
    <Popover>
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
      >
        {/* Category Header - Red background */}
        <div className="sticky top-0 z-10 bg-[#dc2626] text-white px-4 py-3 font-bold text-sm leading-tight tracking-wider shadow-sm">
          {categoryName.toUpperCase()}
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
                    className={`text-lg font-extrabold leading-tight ${
                      mainStock.changePercent !== null && mainStock.changePercent >= 0
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
                      className={`text-sm font-extrabold leading-tight ${
                        stock.changePercent !== null && stock.changePercent >= 0
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

