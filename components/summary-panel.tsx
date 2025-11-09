"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity } from "lucide-react"
import type { RiskMetrics } from "@/lib/eth-analysis"
import { RISK_THRESHOLDS } from "@/lib/config/app.config"
import { METRIC_NAMES } from "@/lib/config/metric-names.config"

interface SummaryPanelProps {
  riskMetrics: RiskMetrics | null
}

export function SummaryPanel({ riskMetrics }: SummaryPanelProps) {
  const summary = useMemo(() => {
    if (!riskMetrics || !riskMetrics.currentState) {
      return null
    }

    const current = riskMetrics.currentState
    const latestIndex = riskMetrics.dates.length - 1
    const latestDate = riskMetrics.dates[latestIndex]

    return {
      date: latestDate,
      ethUsd: current.price,
      ethBtc: current.ethBtc,
      fairValue: current.fairValue,
      sVal: current.sVal,
      sRel: current.sRel,
      riskEq: current.riskEq,
    }
  }, [riskMetrics])

  if (!summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Current Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">Loading summary...</div>
        </CardContent>
      </Card>
    )
  }

  const getRiskBadgeVariant = (value: number) => {
    if (value > RISK_THRESHOLDS.high) return "destructive"
    if (value > RISK_THRESHOLDS.low) return "secondary"
    return "default"
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Current Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Date</div>
            <div className="font-medium">
              {summary.date.toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">ETH/USD</div>
            <div className="font-medium">${summary.ethUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">ETH/BTC</div>
            <div className="font-medium">{summary.ethBtc.toFixed(6)}</div>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Fair Value</div>
            <div className="font-medium">${summary.fairValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">{METRIC_NAMES.sVal.short}</div>
            <Badge variant={getRiskBadgeVariant(summary.sVal)} className="text-sm">
              {summary.sVal.toFixed(3)}
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">{METRIC_NAMES.sRel.short}</div>
            <Badge variant={getRiskBadgeVariant(summary.sRel)} className="text-sm">
              {summary.sRel.toFixed(3)}
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">{METRIC_NAMES.riskEq.short}</div>
            <Badge variant={getRiskBadgeVariant(summary.riskEq)} className="text-sm">
              {summary.riskEq.toFixed(3)}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}


