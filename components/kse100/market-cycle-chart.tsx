"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useTheme } from "next-themes"
import { Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { normalizeCyclesForChart, detectMarketCycles, type MarketCycle } from "@/lib/algorithms/market-cycle-detection"
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

const SERIES_KEY = 'TS_GP_ER_FAERPKR_M.E00220'

interface ExchangeRateData {
  date: string
  value: number
}

// CustomTooltip component that shows all cycles with ROI
export function MarketCycleChart({ data: providedData }: MarketCycleChartProps) {
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [priceData, setPriceData] = useState<PriceDataPoint[]>([])
  const [cycles, setCycles] = useState<MarketCycle[]>([])
  const [visibleCycles, setVisibleCycles] = useState<Set<string>>(new Set())
  const [isDark, setIsDark] = useState(false)
  const [currency, setCurrency] = useState<'PKR' | 'USD'>('PKR')
  
  // Cache for exchange rate data
  const exchangeRateCacheRef = useRef<{
    data: ExchangeRateData[]
    map: Map<string, number>
    timestamp: number
  } | null>(null)
  
  const EXCHANGE_RATE_CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours

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

  // Load exchange rate data with caching
  const loadExchangeRateData = useCallback(async (): Promise<Map<string, number>> => {
    const now = Date.now()
    
    // Check cache
    if (exchangeRateCacheRef.current && 
        (now - exchangeRateCacheRef.current.timestamp) < EXCHANGE_RATE_CACHE_DURATION) {
      return exchangeRateCacheRef.current.map
    }

    // Fetch exchange rate data
    const exchangeResponse = await fetch(`/api/sbp/economic-data?seriesKey=${encodeURIComponent(SERIES_KEY)}`)
    if (!exchangeResponse.ok) {
      throw new Error('Failed to fetch exchange rate data')
    }
    const exchangeResult = await exchangeResponse.json()
    const exchangeData: ExchangeRateData[] = exchangeResult.data || []

    if (exchangeData.length === 0) {
      throw new Error('No exchange rate data available')
    }

    // Sort exchange data by date
    const sortedExchangeData = [...exchangeData].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Create a map of exchange rates by month (YYYY-MM format)
    const exchangeRateMap = new Map<string, number>()
    for (const item of sortedExchangeData) {
      const date = new Date(item.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      // Store the latest exchange rate for each month
      exchangeRateMap.set(monthKey, item.value)
    }

    // Update cache
    exchangeRateCacheRef.current = {
      data: sortedExchangeData,
      map: exchangeRateMap,
      timestamp: now
    }

    return exchangeRateMap
  }, [])

  // Convert price data to USD
  const convertToUSD = useCallback(async (data: PriceDataPoint[]): Promise<PriceDataPoint[]> => {
    const exchangeRateMap = await loadExchangeRateData()
    
    const converted: PriceDataPoint[] = []
    for (const point of data) {
      const priceDate = new Date(point.date)
      const monthKey = `${priceDate.getFullYear()}-${String(priceDate.getMonth() + 1).padStart(2, '0')}`
      
      // Find the exchange rate for this month (or closest previous month)
      let exchangeRate: number | null = null
      if (exchangeRateMap.has(monthKey)) {
        exchangeRate = exchangeRateMap.get(monthKey)!
      } else {
        // Find closest previous month's exchange rate
        for (let i = 1; i <= 12; i++) {
          const checkDate = new Date(priceDate)
          checkDate.setMonth(checkDate.getMonth() - i)
          const checkKey = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}`
          if (exchangeRateMap.has(checkKey)) {
            exchangeRate = exchangeRateMap.get(checkKey)!
            break
          }
        }
      }

      if (exchangeRate !== null) {
        converted.push({
          date: point.date,
          close: point.close / exchangeRate
        })
      }
    }

    return converted
  }, [loadExchangeRateData])

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
        setPriceData([])
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [providedData])

  // Load cycles from API (saved cycles + current cycle) or detect client-side for USD
  useEffect(() => {
    const loadCycles = async () => {
      if (priceData.length === 0) {
        return
      }

      setLoading(true)
      try {
        let dataToUse = priceData
        
        // Convert to USD if needed
        if (currency === 'USD') {
          dataToUse = await convertToUSD(priceData)
        }

        if (currency === 'PKR') {
          // Use API for PKR (with caching)
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
            priceData: []
          }))
          
          // Generate priceData for each cycle from historical data with proper trading day calculation
          const cyclesWithData = allCycles.map(cycle => {
            const startDate = new Date(cycle.startDate)
            const endDate = new Date(cycle.endDate)
            
            // Find all price points in the cycle date range
            const cyclePricePoints = priceData.filter(p => {
              const pDate = new Date(p.date)
              return pDate >= startDate && pDate <= endDate
            })
            
            // Calculate trading days properly (not just index)
            let tradingDayCounter = 0
            const cyclePriceData = cyclePricePoints.map((p, idx) => {
              if (idx === 0) {
                tradingDayCounter = 0
              } else {
                const prevDate = cyclePricePoints[idx - 1].date
                const currDate = p.date
                // Calculate trading days between previous and current date
                const start = new Date(prevDate)
                const end = new Date(currDate)
                let days = 0
                const current = new Date(start)
                while (current <= end) {
                  const day = current.getDay()
                  if (day !== 0 && day !== 6) { // Not weekend
                    days++
                  }
                  current.setDate(current.getDate() + 1)
                }
                tradingDayCounter += Math.max(0, days - 1) // Subtract 1 because we don't count the start day
              }
              
              return {
                date: p.date,
                price: p.close,
                tradingDay: tradingDayCounter
              }
            })
            
            // Find the actual peak (maximum price) in the cycle
            if (cyclePriceData.length > 0) {
              const maxPricePoint = cyclePriceData.reduce((max, point) => 
                point.price > max.price ? point : max
              )
              
              // Calculate actual peak ROI from start to maximum price
              const actualPeakROI = ((maxPricePoint.price - cycle.startPrice) / cycle.startPrice) * 100
              
              return {
                ...cycle,
                endPrice: maxPricePoint.price,
                endDate: maxPricePoint.date,
                roi: actualPeakROI,
                priceData: cyclePriceData
              }
            }
            
            return {
              ...cycle,
              priceData: cyclePriceData
            }
          })
          
          setCycles(cyclesWithData)
          setVisibleCycles(new Set(cyclesWithData.map(c => c.cycleName)))
        } else {
          // For USD, detect cycles client-side on USD data
          const detectedCycles = detectMarketCycles(dataToUse)
          
          // Recalculate peak ROI from actual maximum price in each cycle
          const cyclesWithCorrectPeakROI = detectedCycles.map(cycle => {
            if (cycle.priceData.length > 0) {
              // Find the actual peak (maximum price) in the cycle
              const maxPricePoint = cycle.priceData.reduce((max, point) => 
                point.price > max.price ? point : max
              )
              
              // Calculate actual peak ROI from start to maximum price
              const actualPeakROI = ((maxPricePoint.price - cycle.startPrice) / cycle.startPrice) * 100
              
              return {
                ...cycle,
                endPrice: maxPricePoint.price,
                endDate: maxPricePoint.date,
                roi: actualPeakROI
              }
            }
            return cycle
          })
          
          setCycles(cyclesWithCorrectPeakROI)
          setVisibleCycles(new Set(cyclesWithCorrectPeakROI.map(c => c.cycleName)))
        }
      } catch (error) {
        setCycles([])
      } finally {
        setLoading(false)
      }
    }

    loadCycles()
  }, [priceData, currency, convertToUSD])

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
          // Find exact match or closest previous data point for this trading day
          // This ensures all cycles are shown together in the tooltip
          let match = cycle.data.find(d => d.tradingDay === day)
          
          // If no exact match, find the closest previous value
          if (!match) {
            const previousValues = cycle.data.filter(d => d.tradingDay <= day)
            if (previousValues.length > 0) {
              match = previousValues.reduce((prev, curr) => 
                curr.tradingDay > prev.tradingDay ? curr : prev
              )
            }
          }
          
          if (match) {
            point[cycle.cycleName] = match.normalizedPrice
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

  // CustomTooltip component that shows all cycles with ROI
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      const tradingDay = data.tradingDay
      
      // Filter out baseline and get all cycle data
      const cycleData = payload
        .filter((item: any) => item.dataKey !== 'baseline' && item.value !== undefined)
        .map((item: any) => {
          const cycleName = item.dataKey as string
          const normalizedPrice = item.value as number
          // Calculate ROI at this trading day: normalizedPrice starts at 100%, so ROI = normalizedPrice - 100
          const roiAtThisDay = normalizedPrice - 100
          // Find the cycle to get peak ROI
          const cycle = cycles.find(c => c.cycleName === cycleName)
          return {
            cycleName,
            roiAtThisDay,
            peakROI: cycle?.roi || 0,
            color: item.color
          }
        })
      
      if (cycleData.length === 0) {
        return null
      }
      
      return (
        <div className="bg-popover border border-border p-3 rounded-lg shadow-lg text-sm min-w-[200px]">
          <div className="font-bold mb-2 text-popover-foreground">Trading Day: {tradingDay}</div>
          <div className="grid gap-2">
            {cycleData.map((cycle: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between gap-4 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: cycle.color }}
                  />
                  <span className="font-medium text-popover-foreground">{cycle.cycleName}</span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-foreground">
                    ROI: {cycle.roiAtThisDay >= 0 ? '+' : ''}{cycle.roiAtThisDay.toFixed(2)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Peak: {cycle.peakROI >= 0 ? '+' : ''}{cycle.peakROI.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }
    return null
  }

  // Theme-aware colors
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const axisColor = isDark ? '#9ca3af' : '#6b7280'
  const axisLabelColor = isDark ? '#f3f4f6' : '#1f2937'

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Market Cycle ROI Chart - KSE100 ({currency})</CardTitle>
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
          <CardTitle>Market Cycle ROI Chart - KSE100 ({currency})</CardTitle>
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
        <CardTitle>Market Cycle ROI Chart - KSE100 ({currency})</CardTitle>
        <CardDescription>
          Trough-to-peak cycles overlaid from 100% baseline. Click legend items to show/hide cycles.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Currency Selector */}
          <div className="flex items-center gap-4 pb-4 border-b">
            <Label htmlFor="currency-select">Currency:</Label>
            <Select value={currency} onValueChange={(value) => setCurrency(value as 'PKR' | 'USD')}>
              <SelectTrigger id="currency-select" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PKR">PKR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
                        {currency === 'USD' ? '$' : 'PKR '}
                        {cycle.startPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="text-right p-2 text-muted-foreground font-mono">
                        {currency === 'USD' ? '$' : 'PKR '}
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
                    value: `Normalized Price (%) - ${currency}`, 
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
