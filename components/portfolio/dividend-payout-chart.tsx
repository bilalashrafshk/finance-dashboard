"use client"

import { useState, useEffect, useMemo } from "react"
import { useTheme } from "next-themes"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Bar } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js"
import type { Holding } from "@/lib/portfolio/types"
import { calculateDividendsCollected, formatCurrency, type HoldingDividend } from "@/lib/portfolio/portfolio-utils"
import { Info, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MyDividendsDialog } from "./my-dividends-dialog"
import { format, parseISO, startOfMonth, endOfMonth, isAfter, isBefore } from "date-fns"

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface DividendPayoutChartProps {
  holdings: Holding[]
  currency?: string
}

interface MonthlyDividend {
  month: string // "May", "June", etc.
  monthKey: string // "2024-05" for sorting
  paid: number
  upcoming: number
  total: number
}

export function DividendPayoutChart({ holdings, currency = 'PKR' }: DividendPayoutChartProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [loading, setLoading] = useState(true)
  const [holdingDividends, setHoldingDividends] = useState<HoldingDividend[]>([])
  const [dividendsDialogOpen, setDividendsDialogOpen] = useState(false)
  const today = new Date()

  // Define colors
  const colors = useMemo(() => ({
    foreground: isDark ? 'rgb(250, 250, 250)' : 'rgb(23, 23, 23)',
    background: isDark ? 'rgb(23, 23, 23)' : 'rgb(255, 255, 255)',
    border: isDark ? 'rgb(64, 64, 64)' : 'rgb(229, 229, 229)',
    paid: 'rgb(59, 130, 246)', // Blue
    upcoming: 'rgb(156, 163, 175)', // Gray
  }), [isDark])

  useEffect(() => {
    const loadDividends = async () => {
      setLoading(true)
      try {
        const pkEquityHoldings = holdings.filter(h => h.assetType === 'pk-equity')
        
        if (pkEquityHoldings.length === 0) {
          setHoldingDividends([])
          setLoading(false)
          return
        }

        const dividends = await calculateDividendsCollected(pkEquityHoldings)
        setHoldingDividends(dividends)
      } catch (err: any) {
        console.error('Error loading dividends:', err)
      } finally {
        setLoading(false)
      }
    }

    loadDividends()
  }, [holdings])

  // Group dividends by month and separate paid vs upcoming
  const monthlyDividends = useMemo(() => {
    const allDividends = holdingDividends.flatMap(hd => 
      hd.dividends.map(d => ({
        ...d,
        symbol: hd.symbol,
        holdingId: hd.holdingId
      }))
    )

    // Group by month
    const monthMap = new Map<string, MonthlyDividend>()

    allDividends.forEach(dividend => {
      try {
        const dividendDate = parseISO(dividend.date)
        const monthKey = format(dividendDate, 'yyyy-MM')
        const monthName = format(dividendDate, 'MMMM')
        
        // Determine if dividend is paid (past or today) or upcoming (future)
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        const dividendDateStart = new Date(dividendDate.getFullYear(), dividendDate.getMonth(), dividendDate.getDate())
        const isPaid = dividendDateStart <= todayStart
        const isUpcoming = dividendDateStart > todayStart

        if (!monthMap.has(monthKey)) {
          monthMap.set(monthKey, {
            month: monthName,
            monthKey,
            paid: 0,
            upcoming: 0,
            total: 0,
          })
        }

        const monthData = monthMap.get(monthKey)!
        if (isPaid) {
          monthData.paid += dividend.totalCollected
        } else if (isUpcoming) {
          monthData.upcoming += dividend.totalCollected
        }
        monthData.total += dividend.totalCollected
      } catch (error) {
        console.error('Error parsing dividend date:', dividend.date, error)
      }
    })

    // Convert to array and sort by month key (most recent first, but show last 6 months)
    const sorted = Array.from(monthMap.values())
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
      .slice(0, 6) // Show last 6 months
      .reverse() // Reverse to show oldest to newest

    return sorted
  }, [holdingDividends, today])

  const chartData = useMemo(() => {
    if (monthlyDividends.length === 0) {
      return {
        labels: [],
        datasets: [],
      }
    }

    return {
      labels: monthlyDividends.map(m => m.month),
      datasets: [
        {
          label: 'Paid',
          data: monthlyDividends.map(m => m.paid),
          backgroundColor: colors.paid,
          borderColor: colors.paid,
          borderWidth: 0,
        },
        {
          label: 'Upcoming',
          data: monthlyDividends.map(m => m.upcoming),
          backgroundColor: colors.upcoming,
          borderColor: colors.upcoming,
          borderWidth: 0,
        },
      ],
    }
  }, [monthlyDividends, colors])

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: colors.foreground,
          padding: 15,
          usePointStyle: true,
          font: {
            size: 12,
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
            const datasetLabel = context.dataset.label || ''
            const value = context.parsed.y || 0
            return `${datasetLabel}: ${formatCurrency(value, currency)}`
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: colors.foreground,
        },
        grid: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: colors.foreground,
          callback: function(value: any) {
            return formatCurrency(value, currency)
          },
        },
        grid: {
          color: colors.border,
        },
      },
    },
  }), [monthlyDividends, currency, colors])

  const totalPayout = useMemo(() => {
    return monthlyDividends.reduce((sum, m) => sum + m.total, 0)
  }, [monthlyDividends])

  if (loading) {
    return (
      <>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle>Dividend Payouts</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setDividendsDialogOpen(true)}
                title="View detailed dividend information"
              >
                <Info className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <MyDividendsDialog
          open={dividendsDialogOpen}
          onOpenChange={setDividendsDialogOpen}
          holdings={holdings}
          currency={currency}
        />
      </>
    )
  }

  const pkEquityHoldings = holdings.filter(h => h.assetType === 'pk-equity')
  if (pkEquityHoldings.length === 0 || monthlyDividends.length === 0) {
    return (
      <>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle>Dividend Payouts</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setDividendsDialogOpen(true)}
                title="View detailed dividend information"
              >
                <Info className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              {pkEquityHoldings.length === 0 
                ? 'No PK equity holdings to calculate dividends'
                : 'No dividend data available'}
            </div>
          </CardContent>
        </Card>
        
        <MyDividendsDialog
          open={dividendsDialogOpen}
          onOpenChange={setDividendsDialogOpen}
          holdings={holdings}
          currency={currency}
        />
      </>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Dividend Payouts</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setDividendsDialogOpen(true)}
              title="View detailed dividend information"
            >
              <Info className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
          <CardDescription className="text-xs mt-1">
            Dividends from basic portfolio are not included in the calculation.
          </CardDescription>
        </CardHeader>
      <CardContent className="space-y-4">
        {/* Bar Chart */}
        <div className="h-[200px]">
          <Bar data={chartData} options={chartOptions} />
        </div>

        {/* Total Payout */}
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Total payout</span>
            <span className="text-lg font-bold">{formatCurrency(totalPayout, currency)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
    
    <MyDividendsDialog
      open={dividendsDialogOpen}
      onOpenChange={setDividendsDialogOpen}
      holdings={holdings}
      currency={currency}
    />
  </>
  )
}

