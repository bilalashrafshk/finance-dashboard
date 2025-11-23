"use client"

import { useState, useEffect, useMemo } from "react"
import { useTheme } from "next-themes"
import { Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend,
  CartesianGrid
} from "recharts"
import { normalizeCyclesForChart, type MarketCycle } from "@/lib/algorithms/market-cycle-detection"
import type { PriceDataPoint } from "@/lib/asset-screener/metrics-calculations"

interface MarketCycleChartProps {
  // Optional: if not provided, will fetch KSE100 data
  data?: PriceDataPoint[]
}

// Color palette for cycles
const CYCLE_COLORS = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#8b5cf6", // violet-500
  "#06b6d4", // cyan-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
  "#6366f1",  // indigo-500
  "#84cc16", // lime-500
  "#22c55e", // green-500
]

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    const cycleName = payload[0].dataKey as string
    
    return (
      <div className="bg-popover border border-border p-3 rounded-lg shadow-lg text-sm">
        <div className="font-bold mb-2 text-popover-foreground">{cycleName}</div>
        <div className="grid gap-1">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Trading Day:</span>
            <span className="font-mono text-right text-foreground">{data.tradingDay}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Normalized Price:</span>
            <span className="font-mono text-right text-foreground">{data[cycleName]?.toFixed(2)}%</span>
          </div>
        </div>
      </div>
    )
  }
  return null
}

export function MarketCycleChart({ data: providedData }: MarketCycleChartProps) {
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [priceData, setPriceData] = useState<PriceDataPoint[]>([])
  const [cycles, setCycles] = useState<MarketCycle[]>([])
  const [visibleCycles, setVisibleCycles] = useState<Set<string>>(new Set())
  const [isDark, setIsDark] = useState(false)

  // Detect theme
  useEffect(() => {
    const checkTheme = () => {
      const isDarkMode = document.documentElement.classList.contains('dark') || 
                        window.matchMedia('(prefers-color-scheme: dark)').matches
      setIsDark(isDarkMode)
    }
    
    checkTheme()
    const observer = new MutationObserver(checkTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    
    return () => observer.disconnect()
  }, [])

  // Fetch KSE100 data if not provided
  useEffect(() => {
    const loadData = async () => {
      if (providedData) {
        setPriceData(providedData)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        // Fetch all available KSE100 historical data
        const response = await fetch('/api/historical-data?assetType=kse100&symbol=KSE100&limit=10000')
        
        if (!response.ok) {
          throw new Error('Failed to fetch KSE100 data')
        }
        
        const responseData = await response.json()
        if (responseData.data && Array.isArray(responseData.data)) {
          const data: PriceDataPoint[] = responseData.data
            .map((record: any) => ({
              date: record.date,
              close: parseFloat(record.close)
            }))
            .filter((point: PriceDataPoint) => !isNaN(point.close))
            .sort((a: PriceDataPoint, b: PriceDataPoint) => a.date.localeCompare(b.date))
          
          setPriceData(data)
        } else {
          throw new Error('Invalid data format')
        }
      } catch (error) {
        console.error('Error loading KSE100 data:', error)
        setPriceData([])
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [providedData])

  // Load cycles from API (saved cycles + current cycle)
  useEffect(() => {
    const loadCycles = async () => {
      if (priceData.length === 0) {
        return
      }

      setLoading(true)
      try {
        // Fetch cycles from API (handles saved cycles + detects new ones)
        const response = await fetch('/api/market-cycles?assetType=kse100&symbol=KSE100')
        
        if (!response.ok) {
          throw new Error('Failed to fetch market cycles')
        }
        
        const data = await response.json()
        
        // Convert cycles to MarketCycle format (from cache + current)
        const allCycles: MarketCycle[] = data.allCycles.map((c: any) => ({
          cycleId: c.cycleId,
          cycleName: c.cycleName,
          startDate: c.startDate,
          endDate: c.endDate,
          startPrice: c.startPrice,
          endPrice: c.endPrice,
          roi: c.roi,
          durationTradingDays: c.durationTradingDays,
          // For charting, we need to generate priceData from historical data
          priceData: []
        }))
        
        // Generate priceData for each cycle from historical data
        const cyclesWithData = allCycles.map(cycle => {
          const startDate = new Date(cycle.startDate)
          const endDate = new Date(cycle.endDate)
          
          const cyclePriceData = priceData
            .filter(p => {
              const pDate = new Date(p.date)
              return pDate >= startDate && pDate <= endDate
            })
            .map((p, idx) => ({
              date: p.date,
              price: p.close,
              tradingDay: idx
            }))
          
          return {
            ...cycle,
            priceData: cyclePriceData
          }
        })
        
        setCycles(cyclesWithData)
        
        // Initialize all cycles as visible
        setVisibleCycles(new Set(cyclesWithData.map(c => c.cycleName)))
      } catch (error) {
        console.error('Error loading cycles:', error)
        setCycles([])
      } finally {
        setLoading(false)
      }
    }

    loadCycles()
  }, [priceData])

  // Prepare chart data
  const chartData = useMemo(() => {
    if (cycles.length === 0) {
      return []
    }

    const normalizedCycles = normalizeCyclesForChart(cycles)
    
    // Create a map of all unique trading days from all visible cycles
    const tradingDaySet = new Set<number>()
    normalizedCycles.forEach(cycle => {
      if (visibleCycles.has(cycle.cycleName)) {
        cycle.data.forEach(d => tradingDaySet.add(d.tradingDay))
      }
    })
    
    const sortedTradingDays = Array.from(tradingDaySet).sort((a, b) => a - b)
    
    // Sample every Nth day for performance (but include all actual data points if possible)
    const sampleInterval = Math.max(1, Math.floor(sortedTradingDays.length / 1000)) // Max 1000 points
    const sampledDays = sortedTradingDays.filter((_, idx) => idx % sampleInterval === 0)
    
    // Create data points
    const dataPoints: Array<{ tradingDay: number; [key: string]: number | string }> = []
    
    sampledDays.forEach(day => {
      const point: { tradingDay: number; [key: string]: number | string } = { tradingDay: day }
      
      normalizedCycles.forEach(cycle => {
        if (visibleCycles.has(cycle.cycleName)) {
          // Find exact match or closest data point for this trading day
          const exactMatch = cycle.data.find(d => d.tradingDay === day)
          if (exactMatch) {
            point[cycle.cycleName] = exactMatch.normalizedPrice
          }
        }
      })
      
      // Only add point if it has at least one cycle value
      if (Object.keys(point).length > 1) {
        dataPoints.push(point)
      }
    })

    return dataPoints
  }, [cycles, visibleCycles])

  // Handle legend click to toggle cycle visibility
  const handleLegendClick = (cycleName: string) => {
    setVisibleCycles(prev => {
      const newSet = new Set(prev)
      if (newSet.has(cycleName)) {
        newSet.delete(cycleName)
      } else {
        newSet.add(cycleName)
      }
      return newSet
    })
  }

  // Theme-aware colors
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const axisColor = isDark ? '#9ca3af' : '#6b7280'
  const axisLabelColor = isDark ? '#f3f4f6' : '#1f2937'

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Market Cycle ROI Chart - KSE100</CardTitle>
          <CardDescription>Detecting cycles from historical data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[500px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (cycles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Market Cycle ROI Chart - KSE100</CardTitle>
          <CardDescription>No cycles detected in the data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[500px] text-muted-foreground">
            Unable to detect market cycles. Ensure sufficient historical data is available.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Cycle ROI Chart - KSE100</CardTitle>
        <CardDescription>
          Trough-to-peak cycles overlaid from 100% baseline. Click legend items to show/hide cycles.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Cycle Summary Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Cycle</th>
                  <th className="text-right p-2">Period</th>
                  <th className="text-right p-2">ROI</th>
                  <th className="text-right p-2">Duration</th>
                  <th className="text-right p-2">Start Price</th>
                  <th className="text-right p-2">End Price</th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((cycle, idx) => {
                  const startDate = new Date(cycle.startDate).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                  })
                  const endDate = new Date(cycle.endDate).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                  })
                  const durationYears = (cycle.durationTradingDays / 252).toFixed(1)
                  const isVisible = visibleCycles.has(cycle.cycleName)
                  
                  return (
                    <tr 
                      key={cycle.cycleId}
                      className={`border-b cursor-pointer hover:bg-muted/50 ${!isVisible ? 'opacity-50' : ''}`}
                      onClick={() => handleLegendClick(cycle.cycleName)}
                    >
                      <td className="p-2 font-medium">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: CYCLE_COLORS[idx % CYCLE_COLORS.length] }}
                          />
                          {cycle.cycleName}
                        </div>
                      </td>
                      <td className="text-right p-2 text-muted-foreground">
                        {startDate} - {endDate}
                      </td>
                      <td className={`text-right p-2 font-mono font-medium ${cycle.roi >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {cycle.roi >= 0 ? '+' : ''}{cycle.roi.toFixed(2)}%
                      </td>
                      <td className="text-right p-2 text-muted-foreground font-mono">
                        {cycle.durationTradingDays} days ({durationYears} yrs)
                      </td>
                      <td className="text-right p-2 text-muted-foreground font-mono">
                        {cycle.startPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="text-right p-2 text-muted-foreground font-mono">
                        {cycle.endPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Chart */}
          <div className="h-[500px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 30, bottom: 50, left: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.4} />
                
                <XAxis 
                  dataKey="tradingDay"
                  name="Trading Days"
                  stroke={axisColor}
                  tick={{ fill: axisColor, fontSize: 12 }}
                  label={{ 
                    value: 'Trading Days from Cycle Start', 
                    position: 'bottom', 
                    offset: 10, 
                    fill: axisLabelColor, 
                    fontSize: 13 
                  }}
                />
                
                <YAxis 
                  name="Normalized Price"
                  stroke={axisColor}
                  tick={{ fill: axisColor, fontSize: 12 }}
                  label={{ 
                    value: 'Normalized Price (%)', 
                    angle: -90, 
                    position: 'insideLeft', 
                    fill: axisLabelColor, 
                    fontSize: 13 
                  }}
                />
                
                <Tooltip content={<CustomTooltip />} />
                
                {/* Reference line at 100% */}
                <Line
                  type="monotone"
                  dataKey="baseline"
                  stroke={axisColor}
                  strokeDasharray="2 2"
                  strokeOpacity={0.5}
                  dot={false}
                  data={chartData.map(d => ({ ...d, baseline: 100 }))}
                  legendType="none"
                />
                
                {/* Cycle lines */}
                {cycles.map((cycle, idx) => {
                  if (!visibleCycles.has(cycle.cycleName)) {
                    return null
                  }
                  
                  return (
                    <Line
                      key={cycle.cycleId}
                      type="monotone"
                      dataKey={cycle.cycleName}
                      stroke={CYCLE_COLORS[idx % CYCLE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      name={`${cycle.cycleName} (${cycle.roi >= 0 ? '+' : ''}${cycle.roi.toFixed(1)}%)`}
                      legendType="none"
                      connectNulls
                    />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Custom Legend */}
          <div className="flex flex-wrap gap-4 justify-center pt-4 border-t">
            {cycles.map((cycle, idx) => {
              const isVisible = visibleCycles.has(cycle.cycleName)
              return (
                <div
                  key={cycle.cycleId}
                  onClick={() => handleLegendClick(cycle.cycleName)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all ${
                    isVisible 
                      ? 'bg-muted hover:bg-muted/80' 
                      : 'opacity-50 hover:opacity-70'
                  }`}
                >
                  <div 
                    className="w-4 h-4 rounded-full border-2 border-background" 
                    style={{ backgroundColor: CYCLE_COLORS[idx % CYCLE_COLORS.length] }}
                  />
                  <span className="text-sm font-medium">
                    {cycle.cycleName} ({cycle.roi >= 0 ? '+' : ''}{cycle.roi.toFixed(1)}%)
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
