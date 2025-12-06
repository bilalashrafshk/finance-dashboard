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

type Timeframe = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'All'

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

        if (timeframe === '1M') {
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
        } else if (timeframe === '3M') {
            startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
        } else if (timeframe === '6M') {
            startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
        } else if (timeframe === 'YTD') {
            startDate = new Date(now.getFullYear(), 0, 1) // Jan 1st of current year
        } else if (timeframe === '1Y') {
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
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-xl font-bold tracking-tight">Risk Metrics</h3>
                    <p className="text-sm text-muted-foreground">
                        Analyze risk-adjusted returns and volatility against {benchmarkName}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground hidden sm:inline-block">Timeframe:</span>
                    <Select value={timeframe} onValueChange={(value) => setTimeframe(value as Timeframe)}>
                        <SelectTrigger className="w-[120px] bg-background/50 backdrop-blur-sm border-muted">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1M">1 Month</SelectItem>
                            <SelectItem value="3M">3 Months</SelectItem>
                            <SelectItem value="6M">6 Months</SelectItem>
                            <SelectItem value="YTD">YTD</SelectItem>
                            <SelectItem value="1Y">1 Year</SelectItem>
                            <SelectItem value="3Y">3 Years</SelectItem>
                            <SelectItem value="5Y">5 Years</SelectItem>
                            <SelectItem value="All">All Time</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-background to-muted/20 border-muted/60 shadow-sm hover:shadow-md transition-all duration-300">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center justify-between">
                            <span>Beta</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                vs {benchmarkName}
                            </span>
                        </CardDescription>
                        <CardTitle className="text-2xl font-bold">
                            {metrics.beta !== null ? metrics.beta.toFixed(2) : 'N/A'}
                        </CardTitle>
                    </CardHeader>
                    <div className="px-6 pb-4">
                        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                            <div
                                className={`h-full ${metrics.beta !== null && metrics.beta > 1 ? 'bg-orange-500' : 'bg-blue-500'}`}
                                style={{ width: metrics.beta !== null ? `${Math.min(metrics.beta * 50, 100)}%` : '0%' }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            {metrics.beta !== null
                                ? metrics.beta > 1
                                    ? `More volatile than ${benchmarkName}`
                                    : `Less volatile than ${benchmarkName}`
                                : 'Insufficient data'}
                        </p>
                    </div>
                </Card>

                <Card className="bg-gradient-to-br from-background to-muted/20 border-muted/60 shadow-sm hover:shadow-md transition-all duration-300">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center justify-between">
                            <span>Sharpe Ratio</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                Annualized
                            </span>
                        </CardDescription>
                        <CardTitle className={`text-2xl font-bold ${metrics.sharpe !== null
                                ? metrics.sharpe >= 1 ? 'text-green-500'
                                    : metrics.sharpe >= 0 ? 'text-yellow-500'
                                        : 'text-red-500'
                                : ''
                            }`}>
                            {metrics.sharpe !== null ? metrics.sharpe.toFixed(2) : 'N/A'}
                        </CardTitle>
                    </CardHeader>
                    <div className="px-6 pb-4">
                        <p className="text-xs text-muted-foreground">
                            Risk-adjusted return relative to risk-free rate. Higher is better.
                        </p>
                    </div>
                </Card>

                <Card className="bg-gradient-to-br from-background to-muted/20 border-muted/60 shadow-sm hover:shadow-md transition-all duration-300">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center justify-between">
                            <span>Sortino Ratio</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                Downside Risk
                            </span>
                        </CardDescription>
                        <CardTitle className={`text-2xl font-bold ${metrics.sortino !== null
                                ? metrics.sortino >= 1 ? 'text-green-500'
                                    : metrics.sortino >= 0 ? 'text-yellow-500'
                                        : 'text-red-500'
                                : ''
                            }`}>
                            {metrics.sortino !== null ? metrics.sortino.toFixed(2) : 'N/A'}
                        </CardTitle>
                    </CardHeader>
                    <div className="px-6 pb-4">
                        <p className="text-xs text-muted-foreground">
                            Similar to Sharpe, but penalizes only downside volatility.
                        </p>
                    </div>
                </Card>

                <Card className="bg-gradient-to-br from-background to-muted/20 border-muted/60 shadow-sm hover:shadow-md transition-all duration-300">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center justify-between">
                            <span>Max Drawdown</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {timeframe}
                            </span>
                        </CardDescription>
                        <CardTitle className="text-2xl font-bold text-red-500">
                            {metrics.maxDrawdown !== null ? formatPercentage(metrics.maxDrawdown) : 'N/A'}
                        </CardTitle>
                    </CardHeader>
                    <div className="px-6 pb-4">
                        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-red-500"
                                style={{ width: metrics.maxDrawdown !== null ? `${Math.min(metrics.maxDrawdown, 100)}%` : '0%' }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Maximum observed loss from peak to trough in this period.
                        </p>
                    </div>
                </Card>
            </div>
        </div>
    )
}
