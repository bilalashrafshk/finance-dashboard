"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, DollarSign, PieChart } from "lucide-react"
import type { PortfolioSummary } from "@/lib/portfolio/types"
import { formatCurrency, formatPercent } from "@/lib/portfolio/portfolio-utils"

interface PortfolioSummaryProps {
  summary: PortfolioSummary
  currency?: string
}

export function PortfolioSummary({ summary, currency = 'USD' }: PortfolioSummaryProps) {
  const isPositive = summary.totalGainLoss >= 0

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Portfolio Value</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(summary.currentValue, currency)}</div>
          <p className="text-xs text-muted-foreground">
            {summary.holdingsCount} {summary.holdingsCount === 1 ? 'holding' : 'holdings'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Invested</CardTitle>
          <PieChart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(summary.totalInvested, currency)}</div>
          <p className="text-xs text-muted-foreground">Initial investment</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Gain/Loss</CardTitle>
          {isPositive ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(summary.totalGainLoss, currency)}
          </div>
          <p className={`text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {formatPercent(summary.totalGainLossPercent)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">ROI</CardTitle>
          {isPositive ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {formatPercent(summary.totalGainLossPercent)}
          </div>
          <p className="text-xs text-muted-foreground">Return on investment</p>
        </CardContent>
      </Card>
    </div>
  )
}

