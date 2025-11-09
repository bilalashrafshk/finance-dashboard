"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, Activity, BarChart3 } from "lucide-react"
import type { RiskMetrics } from "@/lib/eth-analysis"
import { RISK_THRESHOLDS } from "@/lib/config/app.config"
import { METRIC_NAMES } from "@/lib/config/metric-names.config"

interface StatisticsPanelProps {
  riskMetrics: RiskMetrics | null
}

export function StatisticsPanel({ riskMetrics }: StatisticsPanelProps) {
  const stats = useMemo(() => {
    if (!riskMetrics || !riskMetrics.ethUsdPrices || riskMetrics.ethUsdPrices.length === 0) {
      return null
    }

    const prices = riskMetrics.ethUsdPrices
    const currentPrice = riskMetrics.currentState.price
    const previousPrice = prices[prices.length - 2] || currentPrice
    const dailyChange = currentPrice - previousPrice
    const dailyChangePercent = (dailyChange / previousPrice) * 100

    const highestPrice = Math.max(...prices)
    const lowestPrice = Math.min(...prices)
    const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length

    // Calculate price changes for volatility
    const changes = prices.slice(1).map((price, i) => ((price - prices[i]) / prices[i]) * 100)
    const volatility =
      changes.length > 0 ? Math.sqrt(changes.reduce((sum, change) => sum + Math.pow(change, 2), 0) / changes.length) : 0

    const greenDays = changes.filter((c) => c > 0).length
    const redDays = changes.filter((c) => c < 0).length

    return {
      currentPrice: currentPrice || 0,
      dailyChange: isNaN(dailyChange) ? 0 : dailyChange,
      dailyChangePercent: isNaN(dailyChangePercent) ? 0 : dailyChangePercent,
      highestPrice: isFinite(highestPrice) ? highestPrice : 0,
      lowestPrice: isFinite(lowestPrice) ? lowestPrice : 0,
      averagePrice: isFinite(averagePrice) ? averagePrice : 0,
      volatility: isFinite(volatility) ? volatility : 0,
      greenDays,
      redDays,
      totalDays: prices.length,
      fairValue: riskMetrics.currentState.fairValue || 0,
      sVal: riskMetrics.currentState.sVal || 0,
      sRel: riskMetrics.currentState.sRel || 0,
      riskEq: riskMetrics.currentState.riskEq || 0,
    }
  }, [riskMetrics])

  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">Loading statistics...</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Price Statistics</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Current Price:</span>
              <span className="font-medium">${(stats.currentPrice || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Daily Change:</span>
              <span className={`font-medium ${stats.dailyChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                ${(stats.dailyChange || 0).toFixed(2)} ({(stats.dailyChangePercent || 0).toFixed(2)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Fair Value:</span>
              <span className="font-medium">${(stats.fairValue || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Highest Price:</span>
              <span className="font-medium">${(stats.highestPrice || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Lowest Price:</span>
              <span className="font-medium">${(stats.lowestPrice || 0).toLocaleString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Risk Metrics</CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">{METRIC_NAMES.sVal.short}:</span>
              <Badge
                variant={
                  stats.sVal > RISK_THRESHOLDS.high
                    ? "destructive"
                    : stats.sVal > RISK_THRESHOLDS.low
                      ? "secondary"
                      : "default"
                }
              >
                {(stats.sVal || 0).toFixed(3)}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">{METRIC_NAMES.sRel.short}:</span>
              <Badge
                variant={
                  stats.sRel > RISK_THRESHOLDS.high
                    ? "destructive"
                    : stats.sRel > RISK_THRESHOLDS.low
                      ? "secondary"
                      : "default"
                }
              >
                {(stats.sRel || 0).toFixed(3)}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Risk_eq (Composite):</span>
              <Badge
                variant={
                  stats.riskEq > RISK_THRESHOLDS.high
                    ? "destructive"
                    : stats.riskEq > RISK_THRESHOLDS.low
                      ? "secondary"
                      : "default"
                }
              >
                {(stats.riskEq || 0).toFixed(3)}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Market Behavior</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Volatility:</span>
              <Badge variant={stats.volatility > 5 ? "destructive" : stats.volatility > 3 ? "secondary" : "default"}>
                {(stats.volatility || 0).toFixed(2)}%
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Green Days:</span>
              <span className="font-medium text-green-600">
                {stats.greenDays} ({((stats.greenDays / stats.totalDays) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Red Days:</span>
              <span className="font-medium text-red-600">
                {stats.redDays} ({((stats.redDays / stats.totalDays) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total Days:</span>
              <span className="font-medium">{stats.totalDays}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
