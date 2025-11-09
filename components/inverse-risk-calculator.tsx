"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Calculator, Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { calculateInverseRiskToPrice, type InverseRiskCalculationParams } from "@/lib/algorithms/inverse-risk-to-price"
import type { RiskMetrics, BandParams, RiskWeights } from "@/lib/eth-analysis"
import type { WeeklyData } from "@/lib/algorithms/fair-value-bands"
import { METRIC_NAMES } from "@/lib/config/metric-names.config"

interface InverseRiskCalculatorProps {
  riskMetrics: RiskMetrics
  bandParams: BandParams
  sValCutoffDate: Date | null
  riskWeights: RiskWeights
}

export function InverseRiskCalculator({
  riskMetrics,
  bandParams,
  sValCutoffDate,
  riskWeights,
}: InverseRiskCalculatorProps) {
  const [futureDate, setFutureDate] = useState<string>(() => {
    // Default to today
    const date = new Date()
    return date.toISOString().split("T")[0]
  })

  const [targetBtcPrice, setTargetBtcPrice] = useState<string>("")
  const [calculating, setCalculating] = useState(false)
  const [results, setResults] = useState<
    Array<{
      targetRisk: number
      ethUsdPrice: number
      sVal: number
      sRel: number
      riskEq: number
      fairValue: number
      ethBtcRatio: number
      isCurrent?: boolean
    }>
  >([])

  // Get current BTC price (from ETH/BTC ratio and ETH/USD price)
  const currentBtcPrice = useMemo(() => {
    if (riskMetrics?.currentState?.price && riskMetrics?.currentState?.ethBtc) {
      return riskMetrics.currentState.price / riskMetrics.currentState.ethBtc
    }
    return 0
  }, [riskMetrics])

  // Default target BTC price to current if not set
  const effectiveBtcPrice = useMemo(() => {
    if (targetBtcPrice && !isNaN(Number.parseFloat(targetBtcPrice))) {
      return Number.parseFloat(targetBtcPrice)
    }
    return currentBtcPrice
  }, [targetBtcPrice, currentBtcPrice])

  // Convert historical data to WeeklyData format
  const historicalWeeklyData: WeeklyData[] = useMemo(() => {
    if (!riskMetrics?.dates || riskMetrics.dates.length === 0) {
      return []
    }
    return riskMetrics.dates.map((date, i) => ({
      date,
      ethUsdClose: riskMetrics.ethUsdPrices[i],
      ethBtcClose: riskMetrics.ethBtcPrices[i],
    }))
  }, [riskMetrics])

  // Guard: Don't render if riskMetrics is not available
  if (!riskMetrics || !riskMetrics.dates || riskMetrics.dates.length === 0) {
    return null
  }

  // Check if target date is today
  const isTargetDateToday = useMemo(() => {
    const today = new Date()
    const target = new Date(futureDate)
    today.setHours(0, 0, 0, 0)
    target.setHours(0, 0, 0, 0)
    return today.getTime() === target.getTime()
  }, [futureDate])

  const handleCalculate = async () => {
    setCalculating(true)
    try {
      const futureDateObj = new Date(futureDate)
      
      // Generate risk levels from 0.0 to 0.9 in 0.1 increments, then 0.95
      const riskLevels: number[] = []
      for (let i = 0; i <= 9; i++) {
        riskLevels.push(i * 0.1)
      }
      riskLevels.push(0.95)

      const newResults: typeof results = []

      for (const targetRisk of riskLevels) {
        const params: InverseRiskCalculationParams = {
          targetRiskEq: targetRisk,
          futureDate: futureDateObj,
          targetBtcPrice: effectiveBtcPrice,
          historicalWeeklyData,
          bandParams,
          sValCutoffDate,
          riskWeights,
        }

        const result = calculateInverseRiskToPrice(params)
        if (result) {
          newResults.push({
            targetRisk,
            ...result,
            isCurrent: false,
          })
        }
      }

      // If target date is today, add current risk level and price
      if (isTargetDateToday && riskMetrics?.currentState) {
        const currentRisk = riskMetrics.currentState.riskEq
        const currentPrice = riskMetrics.currentState.price
        const currentSVal = riskMetrics.currentState.sVal
        const currentSRel = riskMetrics.currentState.sRel
        const currentEthBtc = riskMetrics.currentState.ethBtc
        const currentFairValue = riskMetrics.currentState.fairValue || 0

        // Find the closest risk level in our results
        const closestIndex = newResults.findIndex(
          (r) => Math.abs(r.targetRisk - currentRisk) < 0.05
        )

        if (closestIndex >= 0) {
          // Update existing row to mark as current
          newResults[closestIndex].isCurrent = true
          newResults[closestIndex].ethUsdPrice = currentPrice
          newResults[closestIndex].sVal = currentSVal
          newResults[closestIndex].sRel = currentSRel
          newResults[closestIndex].riskEq = currentRisk
          newResults[closestIndex].fairValue = currentFairValue
          newResults[closestIndex].ethBtcRatio = currentEthBtc
        } else {
          // Insert current row at appropriate position
          const insertIndex = newResults.findIndex((r) => r.targetRisk > currentRisk)
          if (insertIndex >= 0) {
            newResults.splice(insertIndex, 0, {
              targetRisk: currentRisk,
              ethUsdPrice: currentPrice,
              sVal: currentSVal,
              sRel: currentSRel,
              riskEq: currentRisk,
              fairValue: currentFairValue,
              ethBtcRatio: currentEthBtc,
              isCurrent: true,
            })
          } else {
            newResults.push({
              targetRisk: currentRisk,
              ethUsdPrice: currentPrice,
              sVal: currentSVal,
              sRel: currentSRel,
              riskEq: currentRisk,
              fairValue: currentFairValue,
              ethBtcRatio: currentEthBtc,
              isCurrent: true,
            })
          }
        }
      }

      setResults(newResults)
    } catch (error) {
      console.error("Error calculating inverse risk:", error)
      alert("Error calculating inverse risk. Please check your inputs.")
    } finally {
      setCalculating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            <CardTitle>Inverse Risk-to-Price Calculator</CardTitle>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>
                Calculate what ETH/USD price would achieve a target Risk_eq at a future date. Uses current fair value
                bands and ETH/BTC trendlines extrapolated to the future date.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <CardDescription>
          Find ETH/USD prices that correspond to specific Risk_eq levels at a future date
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="future-date">Future Date</Label>
            <Input
              id="future-date"
              type="date"
              value={futureDate}
              onChange={(e) => setFutureDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Date to calculate prices for (defaults to today)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="btc-price">
              Target BTC Price (USD)
              {!targetBtcPrice && currentBtcPrice > 0 && (
                <span className="text-xs text-muted-foreground ml-2">
                  (Default: ${currentBtcPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })})
                </span>
              )}
            </Label>
            <Input
              id="btc-price"
              type="number"
              step="0.01"
              placeholder={currentBtcPrice > 0 ? currentBtcPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : ""}
              value={targetBtcPrice}
              onChange={(e) => setTargetBtcPrice(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">BTC price at future date (defaults to current price)</p>
          </div>

        </div>

        <Button onClick={handleCalculate} disabled={calculating} className="w-full">
          {calculating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Calculating...
            </>
          ) : (
            <>
              <Calculator className="h-4 w-4 mr-2" />
              Calculate Prices
            </>
          )}
        </Button>

        {results.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Results</h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Risk Level</TableHead>
                    <TableHead>ETH/USD Price</TableHead>
                    <TableHead>{METRIC_NAMES.sVal.short}</TableHead>
                    <TableHead>{METRIC_NAMES.sRel.short}</TableHead>
                    <TableHead>Actual Risk_eq</TableHead>
                    <TableHead>Fair Value</TableHead>
                    <TableHead>ETH/BTC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, i) => (
                    <TableRow 
                      key={i}
                      className={result.isCurrent ? "bg-muted/50 font-semibold" : ""}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={result.targetRisk >= 0.7 ? "destructive" : result.targetRisk >= 0.3 ? "secondary" : "default"}>
                            {Math.abs(result.targetRisk % 0.1) < 0.001 ? result.targetRisk.toFixed(1) : result.targetRisk.toFixed(2)}
                          </Badge>
                          {result.isCurrent && (
                            <Badge variant="outline" className="text-xs">
                              Current
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        ${result.ethUsdPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="font-mono">{result.sVal.toFixed(3)}</TableCell>
                      <TableCell className="font-mono">{result.sRel.toFixed(3)}</TableCell>
                      <TableCell className="font-mono">{result.riskEq.toFixed(3)}</TableCell>
                      <TableCell className="font-mono">
                        ${result.fairValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="font-mono">{result.ethBtcRatio.toFixed(6)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

