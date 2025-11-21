"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { TrendingUp, TrendingDown, DollarSign, PieChart, Coins } from "lucide-react"
import type { PortfolioSummary } from "@/lib/portfolio/types"
import { formatCurrency, formatPercent } from "@/lib/portfolio/portfolio-utils"

interface PortfolioSummaryProps {
  summary: PortfolioSummary
  currency?: string
  showDividends?: boolean
}

export function PortfolioSummary({ summary, currency = 'USD', showDividends = false }: PortfolioSummaryProps) {
  const [includeDividends, setIncludeDividends] = useState(false)
  
  // Guard against undefined summary
  if (!summary) {
    return null
  }
  
  // Calculate values based on whether dividends are included
  const portfolioValue = includeDividends && summary.dividendsCollected !== undefined
    ? summary.currentValue + summary.dividendsCollected
    : summary.currentValue
  
  const totalReturn = includeDividends && summary.dividendsCollected !== undefined
    ? portfolioValue - summary.totalInvested
    : summary.totalGainLoss
  
  const totalReturnPercent = summary.totalInvested > 0
    ? (totalReturn / summary.totalInvested) * 100
    : 0

  // ROI should include both unrealized AND realized PnL
  // If we have totalPnL (which includes realized), use that for ROI
  const roiValue = summary.totalPnL !== undefined 
    ? summary.totalPnL 
    : totalReturn
  const roiPercent = summary.totalInvested > 0
    ? (roiValue / summary.totalInvested) * 100
    : 0

  const isPositive = roiValue >= 0
  const hasDividends = summary.dividendsCollected !== undefined && summary.dividendsCollected > 0

  return (
    <div className="space-y-4">
      {/* Toggle for including dividends (only show if dividends exist) */}
      {hasDividends && (
        <div className="flex items-center justify-end gap-2">
          <Switch
            id="include-dividends"
            checked={includeDividends}
            onCheckedChange={setIncludeDividends}
          />
          <Label htmlFor="include-dividends" className="text-sm cursor-pointer">
            Include Dividends in Returns
          </Label>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Portfolio Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(portfolioValue, currency)}</div>
            <p className="text-xs text-muted-foreground">
              {summary.holdingsCount} {summary.holdingsCount === 1 ? 'holding' : 'holdings'}
              {includeDividends && hasDividends && (
                <span className="ml-1">• With dividends</span>
              )}
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
            <CardTitle className="text-sm font-medium">Unrealized P&L</CardTitle>
            {isPositive ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(totalReturn, currency)}
            </div>
            <p className={`text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {formatPercent(totalReturnPercent)}
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
              {formatPercent(roiPercent)}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary.totalPnL !== undefined 
                ? 'Total return (Unrealized + Realized)' 
                : includeDividends 
                  ? 'Total return (with dividends)' 
                  : 'Price return'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Dividends Collected Card */}
      {showDividends && hasDividends && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dividends Collected</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(summary.dividendsCollected!, currency)}
            </div>
            <p className="text-xs text-green-600">
              {formatPercent(summary.dividendsCollectedPercent || 0)} of total invested
            </p>
          </CardContent>
        </Card>
      )}

      {/* Realized PnL Card */}
      {summary.realizedPnL !== undefined && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Realized P&L</CardTitle>
              {summary.realizedPnL >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summary.realizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(summary.realizedPnL, currency)}
              </div>
              <p className="text-xs text-muted-foreground">
                From closed positions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
              {summary.totalPnL !== undefined && summary.totalPnL >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${summary.totalPnL !== undefined && summary.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary.totalPnL !== undefined ? formatCurrency(summary.totalPnL, currency) : formatCurrency(totalReturn, currency)}
              </div>
              <p className="text-xs text-muted-foreground">
                Unrealized + Realized
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* CAGR Card */}
      {summary.cagr !== undefined && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CAGR</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.cagr >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatPercent(summary.cagr)}
            </div>
            <p className="text-xs text-muted-foreground">
              Compound Annual Growth Rate
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}



