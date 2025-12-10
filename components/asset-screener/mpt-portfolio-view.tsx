"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Loader2, AlertCircle, TrendingUp, BarChart3 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { useTheme } from "next-themes"
import { Line } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js"
import type { TrackedAsset } from "./add-asset-dialog"
import { loadRiskFreeRates, type RiskFreeRates } from "./risk-free-rate-settings"
import { formatPercentage } from "@/lib/asset-screener/metrics-calculations"
import {
  calculateDailyReturns,
  calculateMeanReturn,
  calculateCovarianceMatrix,
  regularizeCov,
  optimizeMinimumVariance,
  optimizeMaximumSharpe,
  optimizeMaximumSortino,
  optimizeMaximumReturn,
  generateEfficientFrontier,
  calculatePortfolioMetrics,
  type PriceDataPoint,
  type PortfolioWeights,
  type OptimizationResult,
  type EfficientFrontierPoint,
} from "@/lib/algorithms/portfolio-optimization"
import { useDebounce } from "@/hooks/use-debounce"
import { ASSET_TYPE_LABELS } from "@/lib/portfolio/types"
import type { AssetType } from "@/lib/portfolio/types"

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

type TimeFrame = '1Y' | '2Y' | '3Y' | '5Y' | 'ALL'
type OptimizationType = 'min-variance' | 'max-sharpe' | 'max-sortino' | 'max-return' | 'efficient-frontier'

interface CachedData {
  priceData: Map<string, PriceDataPoint[]>
  returnsMatrix: number[][]
  expectedReturns: number[]
  covarianceMatrix: number[][]
  symbols: string[]
  timeFrame: TimeFrame
  timestamp: number
}

interface MPTPortfolioViewProps {
  assets: TrackedAsset[]
}

const TIME_FRAME_LIMITS: Record<TimeFrame, number> = {
  '1Y': 250,
  '2Y': 500,
  '3Y': 750,
  '5Y': 1250,
  'ALL': Infinity,
}

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export function MPTPortfolioView({ assets }: MPTPortfolioViewProps) {
  const { theme } = useTheme()
  const { toast } = useToast()

  // State
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('1Y')
  const [optimizationType, setOptimizationType] = useState<OptimizationType>('max-sharpe')
  const [priceData, setPriceData] = useState<Map<string, PriceDataPoint[]>>(new Map())
  const [riskFreeRates, setRiskFreeRates] = useState<RiskFreeRates>(loadRiskFreeRates())
  const [cache, setCache] = useState<CachedData | null>(null)

  // Debounce inputs that trigger expensive operations
  const debouncedTimeFrame = useDebounce(timeFrame, 300)
  const debouncedRiskFreeRates = useDebounce(riskFreeRates, 500)

  // Memoize assets mapping
  const assetsByType = useMemo(() => {
    const grouped = new Map<AssetType, TrackedAsset[]>()
    assets.forEach(asset => {
      if (!grouped.has(asset.assetType)) {
        grouped.set(asset.assetType, [])
      }
      grouped.get(asset.assetType)!.push(asset)
    })
    return grouped
  }, [assets])

  const availableAssets = useMemo(() => assets, [assets])

  // Clear selections when assets change
  useEffect(() => {
    setSelectedAssets(new Set())
    setPriceData(new Map())
    setCache(null)
  }, [assets])

  // Fetch data effect - Only runs when assets or timeframe changes
  useEffect(() => {
    const fetchSelectedAssetsData = async () => {
      if (selectedAssets.size === 0) {
        setPriceData(new Map())
        return
      }

      setLoading(true)
      setError(null)

      try {
        const assetIds = Array.from(selectedAssets)
        const result = await fetchHistoricalData(assetIds, debouncedTimeFrame)

        if (result) {
          // fetchHistoricalData already sets priceData via setPriceData internally if successful
          // We can rely on that side effect or update it here.
          // Looking at original fetchHistoricalData, it calls setPriceData.
          // Let's rely on that for now, but we should make sure it doesn't race.
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchSelectedAssetsData()
  }, [selectedAssets, debouncedTimeFrame, fetchHistoricalData])

  // Derived State: Optimization Calculations
  // This memoizes the heavy math so it only runs when price data or settings change
  const optimizationData = useMemo(() => {
    if (selectedAssets.size < 2 || priceData.size < 2) {
      return null
    }

    try {
      const assetIds = Array.from(selectedAssets)
      const assetTypes: AssetType[] = []

      // Calculate returns matrix
      const returnsMatrix: number[][] = []
      const symbols: string[] = []

      assetIds.forEach(id => {
        const data = priceData.get(id)
        const asset = assets.find(a => a.id === id)
        if (data && asset) {
          const prices = data.map(p => p.close)
          const returns = calculateDailyReturns(prices)
          returnsMatrix.push(returns)
          symbols.push(asset.symbol)
          assetTypes.push(asset.assetType)
        }
      })

      if (returnsMatrix.length === 0) return null

      // Align returns
      const minLength = Math.min(...returnsMatrix.map(r => r.length))
      if (minLength < 30) return null // Insufficient data

      const alignedReturns = returnsMatrix.map(r => r.slice(-minLength))

      // Calculate stats
      const expectedReturns = alignedReturns.map(returns => calculateMeanReturn(returns))
      let covarianceMatrix = calculateCovarianceMatrix(alignedReturns)
      covarianceMatrix = regularizeCov(covarianceMatrix, 1e-4)

      // Risk free rate
      let riskFreeRate: number
      if (assetTypes.length > 0) {
        const rates = assetTypes.map(type => {
          if (type === 'us-equity') return debouncedRiskFreeRates.us
          if (type === 'pk-equity') return debouncedRiskFreeRates.pk
          return 20
        })
        riskFreeRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length
      } else {
        riskFreeRate = debouncedRiskFreeRates.us
      }

      // Generate Efficient Frontier
      const frontier = generateEfficientFrontier(expectedReturns, covarianceMatrix, symbols, 50)

      // Calculate all optimization types
      const allOpts = new Map<string, OptimizationResult>()

      const minVarWeights = optimizeMinimumVariance(covarianceMatrix, symbols)
      const minVarMetrics = calculatePortfolioMetrics(
        minVarWeights, symbols, expectedReturns, covarianceMatrix, alignedReturns, riskFreeRate
      )
      allOpts.set('Min Variance', { weights: minVarWeights, metrics: minVarMetrics })

      const maxSharpeWeights = optimizeMaximumSharpe(expectedReturns, covarianceMatrix, riskFreeRate, symbols)
      const maxSharpeMetrics = calculatePortfolioMetrics(
        maxSharpeWeights, symbols, expectedReturns, covarianceMatrix, alignedReturns, riskFreeRate
      )
      allOpts.set('Max Sharpe', { weights: maxSharpeWeights, metrics: maxSharpeMetrics })

      const maxSortinoWeights = optimizeMaximumSortino(expectedReturns, alignedReturns, riskFreeRate, symbols)
      const maxSortinoMetrics = calculatePortfolioMetrics(
        maxSortinoWeights, symbols, expectedReturns, covarianceMatrix, alignedReturns, riskFreeRate
      )
      allOpts.set('Max Sortino', { weights: maxSortinoWeights, metrics: maxSortinoMetrics })

      const maxReturnWeights = optimizeMaximumReturn(expectedReturns, symbols)
      const maxReturnMetrics = calculatePortfolioMetrics(
        maxReturnWeights, symbols, expectedReturns, covarianceMatrix, alignedReturns, riskFreeRate
      )
      allOpts.set('Max Return', { weights: maxReturnWeights, metrics: maxReturnMetrics })

      // Determine current result based on selection
      let currentResult: OptimizationResult
      if (optimizationType === 'min-variance') currentResult = allOpts.get('Min Variance')!
      else if (optimizationType === 'max-sharpe') currentResult = allOpts.get('Max Sharpe')!
      else if (optimizationType === 'max-sortino') currentResult = allOpts.get('Max Sortino')!
      else if (optimizationType === 'max-return') currentResult = allOpts.get('Max Return')!
      else currentResult = allOpts.get('Max Sharpe')! // Default for 'efficient-frontier' view

      return {
        frontier,
        allOpts,
        currentResult
      }

    } catch (e) {
      console.error("Optimization failed", e)
      return null
    }
  }, [selectedAssets, priceData, debouncedRiskFreeRates, optimizationType, assets])

  // Extract values from memoized object or use defaults
  const efficientFrontier = optimizationData?.frontier || []
  const allOptimizations = optimizationData?.allOpts || new Map()
  const optimizationResult = optimizationData?.currentResult || null

  // Handle asset toggle
  const handleAssetToggle = (assetId: string) => {
    const newSelected = new Set(selectedAssets)
    if (newSelected.has(assetId)) {
      newSelected.delete(assetId)
    } else {
      newSelected.add(assetId)
    }
    setSelectedAssets(newSelected)
  }

  // Efficient frontier chart data
  const frontierChartData = useMemo(() => {
    if (efficientFrontier.length === 0) return null

    const colors = theme === 'dark'
      ? { line: 'rgba(59, 130, 246, 0.8)', point: 'rgba(59, 130, 246, 1)' }
      : { line: 'rgba(37, 99, 235, 0.8)', point: 'rgba(37, 99, 235, 1)' }

    // Filter to keep only Pareto-efficient points (efficient frontier boundary)
    // For each volatility level, keep only the point with highest return
    // This creates the proper U-shaped efficient frontier curve
    const filteredFrontier: EfficientFrontierPoint[] = []
    const volatilityTolerance = 0.001 // Small tolerance for grouping similar volatilities

    // Sort by volatility first
    const sortedByVol = [...efficientFrontier].sort((a, b) => a.volatility - b.volatility)

    // Group points by similar volatility and keep only the one with highest return
    let currentGroup: EfficientFrontierPoint[] = []
    let currentVol = sortedByVol[0]?.volatility

    for (const point of sortedByVol) {
      // If volatility is similar (within tolerance), add to current group
      if (Math.abs(point.volatility - currentVol!) < volatilityTolerance) {
        currentGroup.push(point)
      } else {
        // New volatility level - process previous group
        if (currentGroup.length > 0) {
          // Keep only the point with highest return in this group
          const bestPoint = currentGroup.reduce((best, p) =>
            p.expectedReturn > best.expectedReturn ? p : best
          )
          filteredFrontier.push(bestPoint)
        }
        // Start new group
        currentGroup = [point]
        currentVol = point.volatility
      }
    }

    // Process last group
    if (currentGroup.length > 0) {
      const bestPoint = currentGroup.reduce((best, p) =>
        p.expectedReturn > best.expectedReturn ? p : best
      )
      filteredFrontier.push(bestPoint)
    }

    // Additional Pareto filtering: remove any point that is dominated
    // A point is dominated if there's another point with:
    // - Same or lower volatility AND higher return, OR
    // - Same or higher return AND lower volatility
    const paretoEfficient: EfficientFrontierPoint[] = []
    for (const point of filteredFrontier) {
      let isDominated = false
      for (const other of filteredFrontier) {
        if (point === other) continue
        // Check if point is dominated by other
        const hasLowerOrEqualVol = other.volatility <= point.volatility + volatilityTolerance
        const hasHigherReturn = other.expectedReturn > point.expectedReturn + 1e-6
        const hasHigherOrEqualReturn = other.expectedReturn >= point.expectedReturn - 1e-6
        const hasLowerVol = other.volatility < point.volatility - volatilityTolerance

        if ((hasLowerOrEqualVol && hasHigherReturn) || (hasHigherOrEqualReturn && hasLowerVol)) {
          isDominated = true
          break
        }
      }
      if (!isDominated) {
        paretoEfficient.push(point)
      }
    }

    // Sort by volatility for smooth line rendering
    const sortedFrontier = paretoEfficient.sort((a, b) => a.volatility - b.volatility)

    // Add all optimization points
    const optimizationColors: Record<string, string> = {
      'Min Variance': theme === 'dark' ? 'rgba(34, 197, 94, 1)' : 'rgba(22, 163, 74, 1)',
      'Max Sharpe': theme === 'dark' ? 'rgba(251, 191, 36, 1)' : 'rgba(234, 179, 8, 1)',
      'Max Sortino': theme === 'dark' ? 'rgba(168, 85, 247, 1)' : 'rgba(147, 51, 234, 1)',
      'Max Return': theme === 'dark' ? 'rgba(239, 68, 68, 1)' : 'rgba(220, 38, 38, 1)',
    }

    // Store frontier points with their weights for tooltip access
    const frontierDataWithWeights = sortedFrontier.map(p => ({
      x: p.volatility,
      y: p.expectedReturn,
      weights: p.weights,
      expectedReturn: p.expectedReturn,
      volatility: p.volatility,
    }))

    const datasets: any[] = [
      {
        label: 'Efficient Frontier',
        data: frontierDataWithWeights,
        borderColor: colors.line,
        backgroundColor: colors.point,
        pointRadius: 2,
        pointHoverRadius: 4,
        showLine: true,
        fill: false,
        tension: 0.4,
      },
    ]

    // Add optimization points
    allOptimizations.forEach((result, label) => {
      datasets.push({
        label: label,
        data: [{ x: result.metrics.volatility, y: result.metrics.expectedReturn }],
        backgroundColor: optimizationColors[label] || colors.point,
        borderColor: optimizationColors[label] || colors.point,
        pointRadius: 10,
        pointHoverRadius: 12,
        showLine: false,
        pointStyle: 'circle' as const,
      })
    })

    return { datasets }
  }, [efficientFrontier, allOptimizations, theme])

  const frontierChartOptions = useMemo(() => {
    // Collect all volatility and return values for proper scaling
    const allVolatilities: number[] = [...efficientFrontier.map(p => p.volatility)]
    const allReturns: number[] = [...efficientFrontier.map(p => p.expectedReturn)]

    // Add optimization points to the range calculation
    allOptimizations.forEach(result => {
      allVolatilities.push(result.metrics.volatility)
      allReturns.push(result.metrics.expectedReturn)
    })

    const minVol = allVolatilities.length > 0 ? Math.min(...allVolatilities) : 0
    const maxVol = allVolatilities.length > 0 ? Math.max(...allVolatilities) : 1
    const minRet = allReturns.length > 0 ? Math.min(...allReturns) : 0
    const maxRet = allReturns.length > 0 ? Math.max(...allReturns) : 1

    // Theme-aware colors
    const textColor = theme === 'dark' ? 'rgba(250, 250, 250, 0.9)' : 'rgba(23, 23, 23, 0.9)'
    const mutedTextColor = theme === 'dark' ? 'rgba(163, 163, 163, 0.9)' : 'rgba(115, 115, 115, 0.9)'
    const gridColor = theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
    const borderColor = theme === 'dark' ? 'rgba(64, 64, 64, 1)' : 'rgba(229, 229, 229, 1)'
    const backgroundColor = theme === 'dark' ? 'rgba(23, 23, 23, 0.95)' : 'rgba(255, 255, 255, 0.95)'

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          labels: {
            color: textColor,
            usePointStyle: true,
            padding: 15,
            font: {
              size: 12,
            },
          },
        },
        tooltip: {
          backgroundColor: backgroundColor,
          titleColor: textColor,
          bodyColor: textColor,
          borderColor: borderColor,
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: (context: any) => {
              const datasetIndex = context.datasetIndex
              const dataset = context.dataset
              const point = context.parsed

              if (datasetIndex === 0) {
                // Efficient frontier - get point data from chart data
                const dataPoint = dataset.data[context.dataIndex]
                if (dataPoint && typeof dataPoint === 'object' && 'weights' in dataPoint) {
                  const labels: string[] = [
                    `${dataset.label}:`,
                    `Return: ${formatPercentage((dataPoint as any).expectedReturn * 100)}`,
                    `Volatility: ${formatPercentage((dataPoint as any).volatility * 100)}`,
                    ``,
                    `Portfolio Composition:`,
                  ]

                  // Add portfolio weights sorted by allocation
                  const sortedWeights = Object.entries((dataPoint as any).weights as PortfolioWeights)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .filter(([, weight]) => (weight as number) > 0.001) // Only show weights > 0.1%

                  sortedWeights.forEach(([symbol, weight]) => {
                    labels.push(`${symbol}: ${formatPercentage((weight as number) * 100)}`)
                  })

                  return labels
                }

                // Fallback: find closest point from original frontier
                const sortedFrontier = [...efficientFrontier].sort((a, b) => a.volatility - b.volatility)
                const closestPoint = sortedFrontier.find(p =>
                  Math.abs(p.volatility - point.x) < 0.1 && Math.abs(p.expectedReturn - point.y) < 0.1
                )
                if (closestPoint) {
                  const labels: string[] = [
                    `${dataset.label}:`,
                    `Return: ${formatPercentage(closestPoint.expectedReturn * 100)}`,
                    `Volatility: ${formatPercentage(closestPoint.volatility * 100)}`,
                    ``,
                    `Portfolio Composition:`,
                  ]

                  const sortedWeights = Object.entries(closestPoint.weights)
                    .sort(([, a], [, b]) => b - a)
                    .filter(([, weight]) => weight > 0.001)

                  sortedWeights.forEach(([symbol, weight]) => {
                    labels.push(`${symbol}: ${formatPercentage(weight * 100)}`)
                  })

                  return labels
                }
              } else {
                // Optimization points
                const optResult = allOptimizations.get(dataset.label || '')
                if (optResult) {
                  const labels: string[] = [
                    `${dataset.label}:`,
                    `Return: ${formatPercentage(optResult.metrics.expectedReturn * 100)}`,
                    `Volatility: ${formatPercentage(optResult.metrics.volatility * 100)}`,
                    `Sharpe: ${optResult.metrics.sharpeRatio.toFixed(2)}`,
                    ``,
                    `Portfolio Composition:`,
                  ]

                  // Add portfolio weights sorted by allocation
                  const sortedWeights = Object.entries(optResult.weights)
                    .sort(([, a], [, b]) => b - a)
                    .filter(([, weight]) => weight > 0.001) // Only show weights > 0.1%

                  sortedWeights.forEach(([symbol, weight]) => {
                    labels.push(`${symbol}: ${formatPercentage(weight * 100)}`)
                  })

                  return labels
                }
              }
              return context.dataset.label || context.label
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: 'Volatility (Annualized %)',
            color: textColor,
            font: {
              size: 13,
              weight: '500' as const,
            },
          },
          grid: {
            color: gridColor,
          },
          ticks: {
            color: mutedTextColor,
            font: {
              size: 11,
            },
            callback: (value: any) => {
              const num = Number(value)
              return `${(num * 100).toFixed(1)}%`
            },
          },
          min: allVolatilities.length > 0
            ? Math.max(0, minVol * 0.9)
            : undefined,
          max: allVolatilities.length > 0
            ? maxVol * 1.1
            : undefined,
        },
        y: {
          type: 'linear',
          title: {
            display: true,
            text: 'Expected Return (Annualized %)',
            color: textColor,
            font: {
              size: 13,
              weight: '500' as const,
            },
          },
          grid: {
            color: gridColor,
          },
          ticks: {
            color: mutedTextColor,
            font: {
              size: 11,
            },
            callback: (value: any) => {
              const num = Number(value)
              return `${(num * 100).toFixed(1)}%`
            },
          },
          min: allReturns.length > 0
            ? minRet * 0.9
            : undefined,
          max: allReturns.length > 0
            ? maxRet * 1.1
            : undefined,
        },
      },
    }
  }, [efficientFrontier, allOptimizations, theme])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Modern Portfolio Theory</CardTitle>
          <CardDescription>
            Optimize portfolio allocation using Markowitz portfolio theory. Select assets from any asset class to diversify your portfolio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Asset Selection */}
          {assets.length > 0 && (
            <div className="space-y-2">
              <Label>Select Assets (minimum 2)</Label>
              <div className="border border-border rounded-md p-4 max-h-60 overflow-y-auto bg-card">
                {availableAssets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No assets of this type available</p>
                ) : (
                  <div className="space-y-2">
                    {availableAssets.map(asset => (
                      <div key={asset.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={asset.id}
                          checked={selectedAssets.has(asset.id)}
                          onCheckedChange={() => handleAssetToggle(asset.id)}
                        />
                        <label
                          htmlFor={asset.id}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2 flex-1"
                        >
                          <span>{asset.symbol}</span>
                          <span className="text-xs text-muted-foreground">
                            ({ASSET_TYPE_LABELS[asset.assetType]})
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {selectedAssets.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedAssets.size} asset{selectedAssets.size !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          )}

          {/* Time Frame Selection */}
          {selectedAssets.size >= 2 && (
            <div className="space-y-2">
              <Label>Time Frame</Label>
              <Select value={timeFrame} onValueChange={(value) => setTimeFrame(value as TimeFrame)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1Y">1 Year (250 trading days)</SelectItem>
                  <SelectItem value="2Y">2 Years (500 trading days)</SelectItem>
                  <SelectItem value="3Y">3 Years (750 trading days)</SelectItem>
                  <SelectItem value="5Y">5 Years (1250 trading days)</SelectItem>
                  <SelectItem value="ALL">All Available Data</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Optimization Type */}
          {selectedAssets.size >= 2 && (
            <div className="space-y-2">
              <Label>Optimization Strategy</Label>
              <Select
                value={optimizationType}
                onValueChange={(value) => setOptimizationType(value as OptimizationType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="min-variance">Minimum Variance (Lowest Risk)</SelectItem>
                  <SelectItem value="max-sharpe">Maximum Sharpe Ratio (Best Risk-Adjusted Return)</SelectItem>
                  <SelectItem value="max-sortino">Maximum Sortino Ratio (Best Downside Risk-Adjusted Return)</SelectItem>
                  <SelectItem value="max-return">Maximum Return (Highest Expected Return)</SelectItem>
                  <SelectItem value="efficient-frontier">Efficient Frontier (All Optimal Portfolios)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}



          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {optimizationResult && (
        <div className="space-y-6">
          {/* Portfolio Metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Portfolio Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Expected Return</p>
                  <p className="text-2xl font-bold">
                    {formatPercentage(optimizationResult.metrics.expectedReturn * 100)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Volatility</p>
                  <p className="text-2xl font-bold">
                    {formatPercentage(optimizationResult.metrics.volatility * 100)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sharpe Ratio</p>
                  <p className={`text-2xl font-bold ${optimizationResult.metrics.sharpeRatio >= 1
                    ? 'text-green-600 dark:text-green-400'
                    : optimizationResult.metrics.sharpeRatio >= 0
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-red-600 dark:text-red-400'
                    }`}>
                    {optimizationResult.metrics.sharpeRatio.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sortino Ratio</p>
                  <p className={`text-2xl font-bold ${optimizationResult.metrics.sortinoRatio >= 1
                    ? 'text-green-600 dark:text-green-400'
                    : optimizationResult.metrics.sortinoRatio >= 0
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-red-600 dark:text-red-400'
                    }`}>
                    {optimizationResult.metrics.sortinoRatio.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Portfolio Weights */}
          <Card>
            <CardHeader>
              <CardTitle>Portfolio Allocation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(optimizationResult.weights)
                  .sort(([, a], [, b]) => b - a)
                  .map(([symbol, weight]) => (
                    <div key={symbol} className="flex items-center justify-between">
                      <span className="font-medium">{symbol}</span>
                      <div className="flex items-center gap-4">
                        <div className="w-32 bg-muted rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full"
                            style={{ width: `${weight * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-mono w-16 text-right">
                          {formatPercentage(weight * 100)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Efficient Frontier Chart */}
          {optimizationType === 'efficient-frontier' && frontierChartData && (
            <Card>
              <CardHeader>
                <CardTitle>Efficient Frontier</CardTitle>
                <CardDescription>
                  Risk-return trade-off for optimal portfolios. The curve shows all efficient portfolios.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                  <Line data={frontierChartData} options={frontierChartOptions as any} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

