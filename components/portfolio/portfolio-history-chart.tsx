"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Loader2, RefreshCw, TrendingUp } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { formatCurrency } from "@/lib/portfolio/portfolio-utils"
import { useTheme } from "next-themes"
import { ChartInfo } from "@/components/chart-info"

interface PortfolioHistoryProps {
  currency?: string
  unified?: boolean
  totalChange?: number
  totalChangePercent?: number
}

export function PortfolioHistoryChart({ currency = "USD", unified = false, totalChange, totalChangePercent }: PortfolioHistoryProps) {
  const [period, setPeriod] = useState("30") // Default to 30 days
  const [fullHistory, setFullHistory] = useState<any[]>([]) // Store complete history
  // const [data, setData] = useState<any[]>([]) // Removed in favor of useMemo
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTotalReturn, setShowTotalReturn] = useState(false)
  const { theme } = useTheme()

  const isDark = theme === 'dark'
  const axisColor = isDark ? '#9ca3af' : '#6b7280'
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const tooltipBg = isDark ? '#1f2937' : '#ffffff'
  const tooltipBorder = isDark ? '#374151' : '#e5e7eb'
  const tooltipText = isDark ? '#f3f4f6' : '#111827'

  // Fetch full history once
  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true)
      setError(null)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout for full history

      try {
        // 1. Fetch Portfolio Holdings History
        // Get token from localStorage to ensure we are authenticated
        const token = localStorage.getItem('auth_token')
        const unifiedParam = unified ? '&unified=true' : ''
        // Always fetch ALL history
        const historyRes = await fetch(`/api/user/portfolio/history?days=ALL&currency=${currency}${unifiedParam}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          signal: controller.signal
        })

        if (historyRes.status === 401) {
          throw new Error('Authentication required. Please log in again.')
        }

        if (!historyRes.ok) {
          const errorData = await historyRes.json().catch(() => ({}))
          throw new Error(errorData.error || `Server error: ${historyRes.status}`)
        }

        const historyData = await historyRes.json()

        if (!historyData.success) throw new Error(historyData.error)

        const dailyPoints = historyData.history || []

        if (dailyPoints.length === 0) {
          setError('No portfolio history data available')
          setFullHistory([])
          return
        }

        // Process the data points
        const processedData = dailyPoints.map((point: any) => {
          // Use marketValue if available (new API), otherwise fall back to invested (legacy)
          // Both represent the Total Market Value (Cash + Assets Market Value)
          const val = point.marketValue !== undefined ? point.marketValue : (point.invested !== undefined ? point.invested : (point.cash || 0))
          return {
            date: new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            fullDate: point.date,
            value: val,
            cash: point.cash || 0,
            exchangeRate: point.exchangeRate || null // Include exchange rate if available
          }
        })

        // Filter out any invalid data points
        const validData = processedData.filter((d: any) => d.fullDate && !isNaN(d.value))

        if (validData.length === 0) {
          setError('No valid portfolio history data')
          setFullHistory([])
          return
        }

        setFullHistory(validData)

      } catch (err: any) {
        if (err.name === 'AbortError') {
          setError("Request timed out. Please try refreshing.")
        } else {
          setError("Failed to load portfolio history")
        }
      } finally {
        clearTimeout(timeoutId)
        setLoading(false)
      }
    }

    fetchHistory()
  }, [currency, unified]) // Remove showTotalReturn from dependency

  // Filter data using useMemo for performance
  const data = useMemo(() => {
    if (fullHistory.length === 0) return []

    if (period === 'ALL') {
      return fullHistory
    }

    const days = parseInt(period)
    if (isNaN(days)) {
      return fullHistory
    }

    // Slice the last N days
    // Assuming fullHistory is sorted by date ascending (oldest to newest)
    return fullHistory.slice(-days)
  }, [period, fullHistory])

  if (loading && data.length === 0) {
    return (
      <Card className="col-span-4">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-normal">Total Portfolio Value</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading history...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="col-span-4">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-normal">Total Portfolio Value</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <p className="text-red-600">{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const latestValue = data.length > 0 ? data[data.length - 1].value : 0
  const startValue = data.length > 0 ? data[0].value : 0

  // If period is ALL and we have totalChange props, use them
  // Otherwise calculate from data
  let change = latestValue - startValue
  let changePercent = startValue > 0 ? (change / startValue) * 100 : 0

  if (period === 'ALL' && totalChange !== undefined && totalChangePercent !== undefined) {
    change = totalChange
    changePercent = totalChangePercent
  }

  // Normalize currency for display (PKR -> PKR, but handle Rs. formatting)
  const displayCurrency = currency === 'PKR' ? 'PKR' : currency

  return (
    <Card className="col-span-4">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-normal">Total Portfolio Value</CardTitle>
            <ChartInfo
              title="Total Portfolio Value"
              explanation="Tracks the daily total value of your portfolio, combining cached balances and the current market value of all holdings."
            />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">
              {formatCurrency(latestValue, displayCurrency)}
            </span>
            {data.length > 0 && (
              <span className={`text-sm ${change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {change >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {showTotalReturn
              ? 'Includes Cash + Market Value + Dividends (Total Return)'
              : 'Includes Cash + Market Value of Assets (Realized & Unrealized P&L included)'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="total-return"
              checked={showTotalReturn}
              onCheckedChange={setShowTotalReturn}
            />
            <Label htmlFor="total-return" className="text-sm cursor-pointer">
              Total Return
            </Label>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 Days</SelectItem>
              <SelectItem value="30">30 Days</SelectItem>
              <SelectItem value="90">3 Months</SelectItem>
              <SelectItem value="365">1 Year</SelectItem>
              <SelectItem value="ALL">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <p>No portfolio history data available</p>
          </div>
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id={`colorValue-${currency}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: axisColor, fontSize: 12 }}
                  minTickGap={30}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: axisColor, fontSize: 12 }}
                  tickFormatter={(value) =>
                    formatCurrency(value, displayCurrency)
                  }
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: `1px solid ${tooltipBorder}`,
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    backgroundColor: tooltipBg,
                    color: tooltipText
                  }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) {
                      return null
                    }

                    const data = payload[0].payload
                    const exchangeRate = data?.exchangeRate
                    const value = payload[0].value as number

                    return (
                      <div style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: `1px solid ${tooltipBorder}`,
                        backgroundColor: tooltipBg,
                        color: tooltipText
                      }}>
                        <p style={{ marginBottom: '4px', fontWeight: 600 }}>
                          {data?.fullDate || label}
                        </p>
                        <p style={{ marginBottom: exchangeRate && unified ? '4px' : '0' }}>
                          Portfolio Value: {formatCurrency(value, displayCurrency)}
                        </p>
                        {exchangeRate && unified && (
                          <p style={{ margin: 0, fontSize: '12px', opacity: 0.8 }}>
                            Exchange Rate: 1 USD = {exchangeRate.toFixed(2)} PKR
                          </p>
                        )}
                      </div>
                    )
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill={`url(#colorValue-${currency})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

