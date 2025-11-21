"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, RefreshCw, TrendingUp } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { formatCurrency } from "@/lib/portfolio/portfolio-utils"

interface PortfolioHistoryProps {
  currency?: string
}

export function PortfolioHistoryChart({ currency = "USD" }: PortfolioHistoryProps) {
  const [period, setPeriod] = useState("30")
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true)
      setError(null)
      try {
        // 1. Fetch Portfolio Holdings History
        const historyRes = await fetch(`/api/user/portfolio/history?days=${period}&currency=${currency}`)
        const historyData = await historyRes.json()
        
        if (!historyData.success) throw new Error(historyData.error)
        
        const dailyPoints = historyData.history
        
        // 2. Identify all unique assets needed
        const uniqueAssets = new Set<string>()
        dailyPoints.forEach((point: any) => {
           Object.keys(point.assets).forEach(key => uniqueAssets.add(key))
        })
        
        // 3. Fetch Historical Prices for these assets (In a real app, this would be batched/cached)
        // For this MVP, to ensure "lazy loading" doesn't take forever, we might need a helper.
        // Since we can't easily fetch ALL history for ALL assets efficiently client-side without a dedicated endpoint,
        // we will try to construct it using the Price API if available, or fallback to simpler estimation.
        
        // OPTIMIZATION: For now, we will plot "Invested Value" (Cost Basis) vs "Cash" to show the curve,
        // augmenting with Realized PnL which is captured in Cash.
        // To get TRUE Market Value history, we need the historical price endpoint to support batching.
        
        // Let's try to fetch current prices and at least show the CURRENT value accurately,
        // and for history, maybe we can just show the "Net Liquid" assuming price = purchase price for past?
        // No, that's misleading.
        
        // Better approach for MVP:
        // Just plot "Cash Balance" + "Asset Cost Basis" (Total Invested).
        // This shows the "Book Value" of the portfolio over time.
        // It captures Realized PnL (via Cash changes) and Deposits.
        // It DOES NOT capture Unrealized PnL history (stock going up and down without selling).
        // This is often sufficient for a "Balance History" chart.
        
        // However, the user asked for "accounting for realised pnl etc".
        // If we plot "Cash + Cost Basis", Realized PnL is in Cash.
        // So this metric is: "Total Capital + Realized Gains".
        // It is a very useful metric (Equity Curve ignoring open trade fluctuations).
        
        // Just plot "Cash Balance" + "Asset Cost Basis" (Total Invested).
        // This shows the "Book Value" of the portfolio over time.
        // It captures Realized PnL (via Cash changes) and Deposits.
        // This metric is: "Total Capital + Realized Gains".
        
        const processedData = dailyPoints.map((point: any) => {
          // The backend now returns 'invested' which is (Cash + Asset Cost Basis).
          // This represents the Book Value of the portfolio.
          return {
            date: new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            fullDate: point.date,
            value: point.invested || point.cash, // Fallback to cash if invested missing
            cash: point.cash
          }
        })
        
        setData(processedData)
        
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
           <CardTitle className="text-base font-normal">Portfolio Performance</CardTitle>
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

  const latestValue = data.length > 0 ? data[data.length - 1].value : 0
  const startValue = data.length > 0 ? data[0].value : 0
  const change = latestValue - startValue
  const changePercent = startValue > 0 ? (change / startValue) * 100 : 0

  return (
    <Card className="col-span-4">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base font-normal">Portfolio Book Value</CardTitle>
          <div className="flex items-baseline gap-2">
             <span className="text-2xl font-bold">
                {formatCurrency(latestValue, currency)}
             </span>
             <span className={`text-sm ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {change >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
             </span>
          </div>
          <p className="text-xs text-muted-foreground">
             Includes Cash + Cost Basis of Assets (Realized P&L included)
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
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
         <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                  minTickGap={30}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                  tickFormatter={(value) => 
                    new Intl.NumberFormat('en-US', { 
                      notation: "compact", 
                      compactDisplay: "short",
                      style: "currency",
                      currency: currency 
                    }).format(value)
                  }
                  domain={['auto', 'auto']}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value, currency), 'Book Value']}
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
                  fill="url(#colorValue)" 
                />
              </AreaChart>
            </ResponsiveContainer>
         </div>
      </CardContent>
    </Card>
  )
}

