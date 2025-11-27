"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, RefreshCw, TrendingUp } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { formatCurrency } from "@/lib/portfolio/portfolio-utils"

import { useTheme } from "next-themes"

interface PortfolioHistoryProps {
  currency?: string
}

export function PortfolioHistoryChart({ currency = "USD" }: PortfolioHistoryProps) {
  const [period, setPeriod] = useState("ALL") // Default to ALL for best first impression
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { theme } = useTheme()

  const isDark = theme === 'dark'
  const axisColor = isDark ? '#9ca3af' : '#6b7280'
  const gridColor = isDark ? '#374151' : '#e5e7eb'
  const tooltipBg = isDark ? '#1f2937' : '#ffffff'
  const tooltipBorder = isDark ? '#374151' : '#e5e7eb'
  const tooltipText = isDark ? '#f3f4f6' : '#111827'

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true)
      setError(null)
      try {
        // 1. Fetch Portfolio Holdings History
        // Get token from localStorage to ensure we are authenticated
        const token = localStorage.getItem('auth_token')
        const historyRes = await fetch(`/api/user/portfolio/history?days=${period}&currency=${currency}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
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
          console.warn('Portfolio history API returned empty array')
          setError('No portfolio history data available')
          setData([])
          return
        }

        // Process the data points
        const processedData = dailyPoints.map((point: any) => {
          // The backend now returns 'invested' which is (Cash + Asset Cost Basis).
          // This represents the Book Value of the portfolio.
          const invested = point.invested !== undefined ? point.invested : (point.cash || 0)
          return {
            date: new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            fullDate: point.date,
            value: invested,
            cash: point.cash || 0
          }
        })

        // Filter out any invalid data points
        const validData = processedData.filter(d => d.fullDate && !isNaN(d.value))

        if (validData.length === 0) {
          console.warn('No valid data points after processing')
          setError('No valid portfolio history data')
          setData([])
          return
        }

        setData(validData)

      } catch (err) {
        console.error("Error fetching history:", err)
        setError("Failed to load portfolio history")
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [period, currency])

  if (loading && data.length === 0) {
    return (
      <Card className="col-span-4">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-normal">Portfolio Book Value</CardTitle>
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
          <CardTitle className="text-base font-normal">Portfolio Book Value</CardTitle>
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
  const change = latestValue - startValue
  const changePercent = startValue > 0 ? (change / startValue) * 100 : 0

  // Normalize currency for display (PKR -> PKR, but handle Rs. formatting)
  const displayCurrency = currency === 'PKR' ? 'PKR' : currency

  return (
    <Card className="col-span-4">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base font-normal">Portfolio Book Value</CardTitle>
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
            Includes Cash + Market Value of Assets (Realized & Unrealized P&L included)
          </p>
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
                  formatter={(value: number) => [formatCurrency(value, displayCurrency), 'Book Value']}
                  labelFormatter={(label, payload) => {
                    if (payload && payload.length > 0) {
                      return payload[0].payload.fullDate
                    }
                    return label
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

