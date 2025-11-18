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
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | ''>('')
  const [allowMixedAssetTypes, setAllowMixedAssetTypes] = useState(false)
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('1Y')
  const [optimizationType, setOptimizationType] = useState<OptimizationType>('max-sharpe')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [priceData, setPriceData] = useState<Map<string, PriceDataPoint[]>>(new Map())
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null)
  const [efficientFrontier, setEfficientFrontier] = useState<EfficientFrontierPoint[]>([])
  const [allOptimizations, setAllOptimizations] = useState<Map<string, OptimizationResult>>(new Map())
  const [riskFreeRates, setRiskFreeRates] = useState<RiskFreeRates>(loadRiskFreeRates())
  const [cache, setCache] = useState<CachedData | null>(null)

  // Group assets by type
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

  // Filter assets by selected type or all assets if mixed types allowed
  const availableAssets = useMemo(() => {
    if (allowMixedAssetTypes) {
      return assets // Show all assets when mixed types are allowed
    }
    if (!selectedAssetType) return []
    return assetsByType.get(selectedAssetType as AssetType) || []
  }, [selectedAssetType, assetsByType, allowMixedAssetTypes, assets])

  // Auto-select asset type if only one type available (only when mixed types not allowed)
  useEffect(() => {
    if (!allowMixedAssetTypes && !selectedAssetType && assetsByType.size === 1) {
      setSelectedAssetType(Array.from(assetsByType.keys())[0])
    }
  }, [selectedAssetType, assetsByType, allowMixedAssetTypes])

    // Clear selections when asset type changes or mixed types toggle changes
  useEffect(() => {
    setSelectedAssets(new Set())
    setPriceData(new Map())
    setOptimizationResult(null)
    setEfficientFrontier([])
    setAllOptimizations(new Map())
    setCache(null)
  }, [selectedAssetType, allowMixedAssetTypes])

  // Get risk-free rate for asset type
  const getRiskFreeRate = useCallback((assetType: AssetType): number => {
    if (assetType === 'us-equity') return riskFreeRates.us
    if (assetType === 'pk-equity') return riskFreeRates.pk
    // Default for crypto, metals, indices
    return 20 // 20% annual for Pakistan market
  }, [riskFreeRates])

  // Fetch historical data for selected assets
  const fetchHistoricalData = useCallback(async (assetIds: string[], timeFrame: TimeFrame) => {
    setLoading(true)
    setError(null)

    try {
      const limit = TIME_FRAME_LIMITS[timeFrame]
      const newPriceData = new Map<string, PriceDataPoint[]>()
      const symbols: string[] = []
      const assetTypes: AssetType[] = []

      // Check cache first
      if (cache && 
          cache.timeFrame === timeFrame &&
          Date.now() - cache.timestamp < CACHE_DURATION &&
          assetIds.every(id => cache.priceData.has(id))) {
        // Use cached data
        assetIds.forEach(id => {
          const data = cache.priceData.get(id)
          if (data) {
            newPriceData.set(id, data)
            const asset = assets.find(a => a.id === id)
            if (asset) {
              symbols.push(asset.symbol)
              assetTypes.push(asset.assetType)
            }
          }
        })
        setPriceData(newPriceData)
        setLoading(false)
        return { priceData: newPriceData, symbols, assetTypes }
      }

      // Fetch data for all selected assets in parallel
      const fetchPromises = assetIds.map(async (id) => {
        const asset = assets.find(a => a.id === id)
        if (!asset) return null

        let historicalDataUrl = ''
        
        if (asset.assetType === 'crypto') {
          const { parseSymbolToBinance } = await import('@/lib/portfolio/binance-api')
          const binanceSymbol = parseSymbolToBinance(asset.symbol)
          historicalDataUrl = `/api/historical-data?assetType=crypto&symbol=${encodeURIComponent(binanceSymbol)}${limit !== Infinity ? `&limit=${limit}` : ''}`
        } else if (asset.assetType === 'pk-equity') {
          historicalDataUrl = `/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(asset.symbol)}&market=PSX${limit !== Infinity ? `&limit=${limit}` : ''}`
        } else if (asset.assetType === 'us-equity') {
          historicalDataUrl = `/api/historical-data?assetType=us-equity&symbol=${encodeURIComponent(asset.symbol)}&market=US${limit !== Infinity ? `&limit=${limit}` : ''}`
        } else if (asset.assetType === 'metals') {
          historicalDataUrl = `/api/historical-data?assetType=metals&symbol=${encodeURIComponent(asset.symbol)}${limit !== Infinity ? `&limit=${limit}` : ''}`
        } else if (asset.assetType === 'kse100' || asset.assetType === 'spx500') {
          const apiAssetType = asset.assetType === 'kse100' ? 'kse100' : 'spx500'
          historicalDataUrl = `/api/historical-data?assetType=${apiAssetType}&symbol=${encodeURIComponent(asset.symbol)}${limit !== Infinity ? `&limit=${limit}` : ''}`
        }

        if (!historicalDataUrl) return null

        const response = await fetch(historicalDataUrl)
        if (!response.ok) {
          throw new Error(`Failed to fetch data for ${asset.symbol}`)
        }

        const data = await response.json()
        if (!data.data || !Array.isArray(data.data)) {
          throw new Error(`Invalid data format for ${asset.symbol}`)
        }

        const pricePoints: PriceDataPoint[] = data.data
          .map((record: any) => ({
            date: record.date,
            close: parseFloat(record.close),
          }))
          .filter((point: PriceDataPoint) => !isNaN(point.close))
          .sort((a: PriceDataPoint, b: PriceDataPoint) => a.date.localeCompare(b.date))

        if (pricePoints.length < 30) {
          throw new Error(`Insufficient data for ${asset.symbol} (need at least 30 days)`)
        }

        return { id, asset, pricePoints }
      })

      const results = await Promise.all(fetchPromises)
      const validResults = results.filter(r => r !== null) as Array<{
        id: string
        asset: TrackedAsset
        pricePoints: PriceDataPoint[]
      }>

      if (validResults.length === 0) {
        throw new Error('No valid data fetched')
      }

      // Align dates across all assets (use common dates)
      const allDates = new Set<string>()
      validResults.forEach(r => {
        r.pricePoints.forEach(p => allDates.add(p.date))
      })
      const sortedDates = Array.from(allDates).sort()

      // Filter to dates where all assets have data
      const commonDates = sortedDates.filter(date => {
        return validResults.every(r => r.pricePoints.some(p => p.date === date))
      })

      if (commonDates.length < 30) {
        throw new Error('Insufficient overlapping data (need at least 30 common trading days)')
      }

      // Create aligned price data
      validResults.forEach(({ id, asset, pricePoints }) => {
        const alignedData: PriceDataPoint[] = commonDates.map(date => {
          const point = pricePoints.find(p => p.date === date)
          return point || { date, close: 0 }
        }).filter(p => p.close > 0)
        newPriceData.set(id, alignedData)
        symbols.push(asset.symbol)
        assetTypes.push(asset.assetType)
      })

      // Update cache
      setCache({
        priceData: newPriceData,
        returnsMatrix: [], // Will be calculated in optimization
        expectedReturns: [],
        covarianceMatrix: [],
        symbols,
        timeFrame,
        timestamp: Date.now(),
      })

      setPriceData(newPriceData)
      return { priceData: newPriceData, symbols, assetTypes }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch historical data')
      toast({
        title: "Error",
        description: err.message || 'Failed to fetch historical data',
        variant: "destructive",
      })
      return null
    } finally {
      setLoading(false)
    }
  }, [assets, timeFrame, cache, toast])

  // Run optimization
  const runOptimization = useCallback(async () => {
    if (selectedAssets.size < 2) {
      setError('Please select at least 2 assets')
      return
    }

    if (!allowMixedAssetTypes && !selectedAssetType) {
      setError('Please select an asset type or enable mixed asset types')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch data if not already cached
      const assetIds = Array.from(selectedAssets)
      const dataResult = await fetchHistoricalData(assetIds, timeFrame)
      if (!dataResult) return

      const { priceData: fetchedPriceData, symbols, assetTypes } = dataResult
      const priceDataMap = fetchedPriceData.size > 0 ? fetchedPriceData : priceData

      if (priceDataMap.size < 2) {
        setError('Insufficient data for optimization')
        return
      }

      // Calculate returns matrix - use SIMPLE ARITHMETIC returns for everything
      const returnsMatrix: number[][] = []
      
      assetIds.forEach(id => {
        const data = priceDataMap.get(id)
        if (data) {
          const prices = data.map(p => p.close)
          // Use simple arithmetic returns
          const returns = calculateDailyReturns(prices)
          returnsMatrix.push(returns)
        }
      })

      // Align returns (use minimum length)
      const minLength = Math.min(...returnsMatrix.map(r => r.length))
      const alignedReturns = returnsMatrix.map(r => r.slice(-minLength))

      if (minLength < 30) {
        setError('Insufficient overlapping data (need at least 30 common trading days)')
        return
      }

      // Calculate expected returns from arithmetic returns
      const expectedReturns = alignedReturns.map(returns => calculateMeanReturn(returns))
      
      // Calculate covariance from arithmetic returns
      let covarianceMatrix = calculateCovarianceMatrix(alignedReturns)
      
      // Regularize to avoid singularity
      covarianceMatrix = regularizeCov(covarianceMatrix, 1e-4)

      // Update cache with calculated values
      if (cache) {
        setCache({
          ...cache,
          returnsMatrix: alignedReturns, // Store arithmetic returns
          expectedReturns,
          covarianceMatrix,
        })
      }

      // Get risk-free rate - use weighted average if mixed types, otherwise use selected type
      let riskFreeRate: number
      if (allowMixedAssetTypes && assetTypes.length > 0) {
        // Use average of risk-free rates for mixed asset types
        const rates = assetTypes.map(type => getRiskFreeRate(type))
        riskFreeRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length
      } else {
        riskFreeRate = getRiskFreeRate(selectedAssetType as AssetType)
      }

      // Run optimization
      let weights: PortfolioWeights = {}
      
      if (optimizationType === 'min-variance') {
        weights = optimizeMinimumVariance(covarianceMatrix, symbols)
      } else if (optimizationType === 'max-sharpe') {
        weights = optimizeMaximumSharpe(expectedReturns, covarianceMatrix, riskFreeRate, symbols)
      } else if (optimizationType === 'max-sortino') {
        weights = optimizeMaximumSortino(expectedReturns, alignedReturns, riskFreeRate, symbols)
      } else if (optimizationType === 'max-return') {
        weights = optimizeMaximumReturn(expectedReturns, symbols)
      } else if (optimizationType === 'efficient-frontier') {
        // Generate efficient frontier
        const frontier = generateEfficientFrontier(expectedReturns, covarianceMatrix, symbols, 50)
        setEfficientFrontier(frontier)
        
        // Calculate all optimization types for display on chart
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
        
        setAllOptimizations(allOpts)
        
        // Use max Sharpe as the main result
        weights = maxSharpeWeights
      }

      // Calculate metrics
      const metrics = calculatePortfolioMetrics(
        weights,
        symbols,
        expectedReturns,
        covarianceMatrix,
        alignedReturns,
        riskFreeRate
      )

      setOptimizationResult({ weights, metrics })
    } catch (err: any) {
      setError(err.message || 'Optimization failed')
      toast({
        title: "Optimization Error",
        description: err.message || 'Optimization failed',
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [selectedAssets, selectedAssetType, allowMixedAssetTypes, timeFrame, optimizationType, priceData, fetchHistoricalData, getRiskFreeRate, cache, toast])

  // Handle asset selection
  const handleAssetToggle = (assetId: string) => {
    const newSelected = new Set(selectedAssets)
    if (newSelected.has(assetId)) {
      newSelected.delete(assetId)
    } else {
      newSelected.add(assetId)
    }
    setSelectedAssets(newSelected)
    // Clear results when selection changes
    setOptimizationResult(null)
    setEfficientFrontier([])
    setAllOptimizations(new Map())
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

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
        },
        tooltip: {
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
          },
          grid: {
            color: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          },
          ticks: {
            color: theme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
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
          },
          grid: {
            color: theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          },
          ticks: {
            color: theme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
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
            Optimize portfolio allocation using Markowitz portfolio theory. Select assets from the same type or enable mixed asset classes to diversify across different asset types.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Allow Mixed Asset Types Toggle */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="allowMixedAssetTypes"
              checked={allowMixedAssetTypes}
              onCheckedChange={(checked) => {
                setAllowMixedAssetTypes(checked as boolean)
                if (checked) {
                  setSelectedAssetType('')
                }
              }}
            />
            <label
              htmlFor="allowMixedAssetTypes"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Allow mixing different asset classes
            </label>
          </div>

          {/* Asset Type Selection */}
          {!allowMixedAssetTypes && (
            <div className="space-y-2">
              <Label>Asset Type</Label>
              <Select
                value={selectedAssetType}
                onValueChange={(value) => setSelectedAssetType(value as AssetType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select asset type" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(assetsByType.keys()).map(type => (
                    <SelectItem key={type} value={type}>
                      {ASSET_TYPE_LABELS[type]} ({assetsByType.get(type)?.length || 0} assets)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedAssetType && (
                <p className="text-xs text-muted-foreground">
                  Select assets of the same type: {ASSET_TYPE_LABELS[selectedAssetType as AssetType]}
                </p>
              )}
            </div>
          )}

          {/* Asset Selection */}
          {(selectedAssetType || allowMixedAssetTypes) && (
            <div className="space-y-2">
              <Label>Select Assets (minimum 2)</Label>
              <div className="border rounded-md p-4 max-h-60 overflow-y-auto">
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
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                        >
                          <span>{asset.symbol} - {asset.name}</span>
                          {allowMixedAssetTypes && (
                            <span className="text-xs text-muted-foreground">
                              ({ASSET_TYPE_LABELS[asset.assetType]})
                            </span>
                          )}
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

          {/* Run Optimization Button */}
          {selectedAssets.size >= 2 && (
            <Button
              onClick={runOptimization}
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Optimizing...
                </>
              ) : (
                <>
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Run Optimization
                </>
              )}
            </Button>
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
                  <p className={`text-2xl font-bold ${
                    optimizationResult.metrics.sharpeRatio >= 1 
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
                  <p className={`text-2xl font-bold ${
                    optimizationResult.metrics.sortinoRatio >= 1 
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
                  <Line data={frontierChartData} options={frontierChartOptions} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

