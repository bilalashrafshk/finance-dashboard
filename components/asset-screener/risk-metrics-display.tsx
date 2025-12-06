"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    calculateBeta,
    calculateSharpeRatio,
    calculateSortinoRatio,
    calculateMaxDrawdown,
    type PriceDataPoint,
    type RiskFreeRates
} from "@/lib/asset-screener/metrics-calculations"
import { formatPercentage } from "@/lib/asset-screener/metrics-calculations"

interface RiskMetricsDisplayProps {
    assetType: string
    historicalData: PriceDataPoint[]
    benchmarkData?: PriceDataPoint[]
    riskFreeRates: RiskFreeRates
}

type Timeframe = '1Y' | '3Y' | '5Y' | 'All'

export function RiskMetricsDisplay({
    assetType,
    historicalData,
    benchmarkData,
    riskFreeRates
}: RiskMetricsDisplayProps) {
    const [timeframe, setTimeframe] = useState<Timeframe>('1Y')
    const [metrics, setMetrics] = useState<{
        beta: number | null
        sharpe: number | null
        sortino: number | null
        maxDrawdown: number | null
    }>({
        beta: null,
        sharpe: null,
        sortino: null,
        maxDrawdown: null
    })

    // Filter data based on selected timeframe
    const filteredData = useMemo(() => {
        if (!historicalData || historicalData.length === 0) return { asset: [], benchmark: [] }

        const now = new Date()
        let startDate: Date

        if (timeframe === '1Y') {
            startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
        } else if (timeframe === '3Y') {
            startDate = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate())
        } else if (timeframe === '5Y') {
            startDate = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate())
        } else {
            // 'All' - use earliest date
            return {
                asset: historicalData,
                benchmark: benchmarkData || []
            }
        }

        const filteredAsset = historicalData.filter(d => new Date(d.date) >= startDate)
        const filteredBenchmark = benchmarkData ? benchmarkData.filter(d => new Date(d.date) >= startDate) : []

        return { asset: filteredAsset, benchmark: filteredBenchmark }
    }, [historicalData, benchmarkData, timeframe])

    // Calculate metrics when data or timeframe changes
    useEffect(() => {
        const { asset, benchmark } = filteredData

        if (asset.length === 0) {
            setMetrics({ beta: null, sharpe: null, sortino: null, maxDrawdown: null })
            return
        }

        // Determine appropriate risk-free rate
        const rfRate = assetType === 'pk-equity' || assetType === 'kse100'
            ? riskFreeRates.pk
            : riskFreeRates.us

        // Convert percentage to decimal for calculations (e.g., 15.0 -> 0.15)
        const rfRateDecimal = rfRate / 100

        const beta = benchmark.length > 0 ? calculateBeta(asset, benchmark) : null
        const sharpe = calculateSharpeRatio(asset, rfRateDecimal)
        const sortino = calculateSortinoRatio(asset, rfRateDecimal)
        const maxDrawdown = calculateMaxDrawdown(asset)

        setMetrics({
            beta,
            sharpe,
            sortino,
            maxDrawdown
        })
    }, [filteredData, assetType, riskFreeRates])

    const benchmarkName = assetType === 'us-equity' ? 'SPX500' : assetType === 'pk-equity' ? 'KSE100' : 'Benchmark'

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Risk Metrics</h3>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Timeframe:</span>
                    <Select value={timeframe} onValueChange={(value) => setTimeframe(value as Timeframe)}>
                        <SelectTrigger className="w-[100px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1Y">1Y</SelectItem>
                            <SelectItem value="3Y">3Y</SelectItem>
                            <SelectItem value="5Y">5Y</SelectItem>
                            <SelectItem value="All">All</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>
                            Beta
                            <span className="text-xs text-muted-foreground ml-2">
                                (vs {benchmarkName})
                            </span>
                        </CardDescription>
                        <CardTitle className="text-lg">
                            {metrics.beta !== null ? metrics.beta.toFixed(2) : 'N/A'}
                        </CardTitle>
                    </CardHeader>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>
                            Sharpe Ratio
                            <span className="text-xs text-muted-foreground ml-2">
                                (Annualized)
                            </span>
                        </CardDescription>
                        <CardTitle className={`text-lg ${metrics.sharpe !== null
                                ? metrics.sharpe >= 1 ? 'text-green-600 dark:text-green-400'
                                    : metrics.sharpe >= 0 ? 'text-yellow-600 dark:text-yellow-400'
                                        : 'text-red-600 dark:text-red-400'
                                : ''
                            }`}>
                            {metrics.sharpe !== null ? metrics.sharpe.toFixed(2) : 'N/A'}
                        </CardTitle>
                    </CardHeader>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>
                            Sortino Ratio
                            <span className="text-xs text-muted-foreground ml-2">
                                (Downside Risk)
                            </span>
                        </CardDescription>
                        <CardTitle className={`text-lg ${metrics.sortino !== null
                                ? metrics.sortino >= 1 ? 'text-green-600 dark:text-green-400'
                                    : metrics.sortino >= 0 ? 'text-yellow-600 dark:text-yellow-400'
                                        : 'text-red-600 dark:text-red-400'
                                : ''
                            }`}>
                            {metrics.sortino !== null ? metrics.sortino.toFixed(2) : 'N/A'}
                        </CardTitle>
                    </CardHeader>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>
                            Max Drawdown
                            <span className="text-xs text-muted-foreground ml-2">
                                ({timeframe})
                            </span>
                        </CardDescription>
                        <CardTitle className="text-lg text-red-600 dark:text-red-400">
                            {metrics.maxDrawdown !== null ? formatPercentage(metrics.maxDrawdown) : 'N/A'}
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>
        </div>
    )
}
