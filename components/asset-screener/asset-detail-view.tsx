"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { TrackedAsset } from "./add-asset-dialog"
import { 
  calculateAllMetrics, 
  formatPercentage, 
  formatCurrency,
  type CalculatedMetrics,
  type PriceDataPoint 
} from "@/lib/asset-screener/metrics-calculations"
import type { RiskFreeRates } from "./risk-free-rate-settings"
import { loadRiskFreeRates } from "./risk-free-rate-settings"

interface AssetDetailViewProps {
  asset: TrackedAsset
  riskFreeRates?: RiskFreeRates
}

interface AssetMetrics extends CalculatedMetrics {
  currentPrice?: number
}

export function AssetDetailView({ asset, riskFreeRates }: AssetDetailViewProps) {
  const [metrics, setMetrics] = useState<AssetMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Use provided risk-free rates or load from localStorage
  const effectiveRiskFreeRates = riskFreeRates || loadRiskFreeRates()

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true)
      setError(null)
      
      try {
        // Fetch current price using unified API
        const market = asset.assetType === 'pk-equity' ? 'PSX' : asset.assetType === 'us-equity' ? 'US' : null
        let priceUrl = ''
        let historicalDataUrl = ''
        
        if (asset.assetType === 'crypto') {
          const { parseSymbolToBinance } = await import('@/lib/portfolio/binance-api')
          const binanceSymbol = parseSymbolToBinance(asset.symbol)
          priceUrl = `/api/crypto/price?symbol=${encodeURIComponent(binanceSymbol)}`
          historicalDataUrl = `/api/historical-data?assetType=crypto&symbol=${encodeURIComponent(binanceSymbol)}`
        } else if (asset.assetType === 'pk-equity') {
          priceUrl = `/api/pk-equity/price?ticker=${encodeURIComponent(asset.symbol)}`
          historicalDataUrl = `/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(asset.symbol)}&market=PSX`
        } else if (asset.assetType === 'us-equity') {
          priceUrl = `/api/us-equity/price?ticker=${encodeURIComponent(asset.symbol)}`
          historicalDataUrl = `/api/historical-data?assetType=us-equity&symbol=${encodeURIComponent(asset.symbol)}&market=US`
        } else if (asset.assetType === 'metals') {
          priceUrl = `/api/metals/price?symbol=${encodeURIComponent(asset.symbol)}`
          historicalDataUrl = `/api/historical-data?assetType=metals&symbol=${encodeURIComponent(asset.symbol)}`
        } else if (asset.assetType === 'kse100' || asset.assetType === 'spx500') {
          priceUrl = `/api/indices/price?symbol=${encodeURIComponent(asset.symbol)}`
          const apiAssetType = asset.assetType === 'kse100' ? 'kse100' : 'spx500'
          historicalDataUrl = `/api/historical-data?assetType=${apiAssetType}&symbol=${encodeURIComponent(asset.symbol)}`
        }
        
        // Determine benchmark for Beta calculation
        let benchmarkDataUrl = ''
        if (asset.assetType === 'us-equity') {
          // Use SPX500 as benchmark for US equities
          benchmarkDataUrl = `/api/historical-data?assetType=spx500&symbol=SPX500`
        } else if (asset.assetType === 'pk-equity') {
          // Use KSE100 as benchmark for PK equities
          benchmarkDataUrl = `/api/historical-data?assetType=kse100&symbol=KSE100`
        }
        
        // Fetch current price, historical data, and benchmark data in parallel
        const fetchPromises = [
          priceUrl ? fetch(priceUrl) : Promise.resolve(null),
          historicalDataUrl ? fetch(historicalDataUrl) : Promise.resolve(null),
          benchmarkDataUrl ? fetch(benchmarkDataUrl) : Promise.resolve(null)
        ]
        
        const [priceResponse, historicalResponse, benchmarkResponse] = await Promise.all(fetchPromises)
        
        let currentPrice: number | undefined
        let historicalData: PriceDataPoint[] = []
        let benchmarkData: PriceDataPoint[] = []
        
        if (priceResponse && priceResponse.ok) {
          const priceData = await priceResponse.json()
          currentPrice = priceData.price
        }
        
        if (historicalResponse && historicalResponse.ok) {
          const historicalDataResponse = await historicalResponse.json()
          if (historicalDataResponse.data && Array.isArray(historicalDataResponse.data)) {
            // Convert API response to PriceDataPoint format
            historicalData = historicalDataResponse.data.map((record: any) => ({
              date: record.date,
              close: parseFloat(record.close)
            })).filter((point: PriceDataPoint) => !isNaN(point.close))
          }
        }
        
        if (benchmarkResponse && benchmarkResponse.ok) {
          const benchmarkDataResponse = await benchmarkResponse.json()
          if (benchmarkDataResponse.data && Array.isArray(benchmarkDataResponse.data)) {
            // Convert API response to PriceDataPoint format
            benchmarkData = benchmarkDataResponse.data.map((record: any) => ({
              date: record.date,
              close: parseFloat(record.close)
            })).filter((point: PriceDataPoint) => !isNaN(point.close))
          }
        }
        
        // Calculate metrics if we have both current price and historical data
        if (currentPrice !== undefined && historicalData.length > 0) {
          const calculatedMetrics = calculateAllMetrics(
            currentPrice, 
            historicalData, 
            asset.assetType,
            benchmarkData.length > 0 ? benchmarkData : undefined,
            effectiveRiskFreeRates
          )
          setMetrics({
            currentPrice,
            ...calculatedMetrics
          })
        } else if (currentPrice !== undefined) {
          // Just set current price if no historical data
          setMetrics({ currentPrice })
        } else {
          setError('Failed to fetch price data')
        }
      } catch (err: any) {
        console.error('Error fetching metrics:', err)
        setError(err.message || 'Failed to fetch metrics')
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [asset, effectiveRiskFreeRates])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-destructive py-4">
        Error: {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics?.currentPrice !== undefined && (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Current Price</CardDescription>
              <CardTitle className="text-lg">
                {formatCurrency(metrics.currentPrice, asset.currency, asset.assetType === 'crypto' ? 8 : 2)}
              </CardTitle>
            </CardHeader>
          </Card>
        )}
        
        {metrics?.ytdReturnPercent !== undefined && metrics.ytdReturnPercent !== null && (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>YTD Return</CardDescription>
              <CardTitle className={`text-lg ${metrics.ytdReturnPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatPercentage(metrics.ytdReturnPercent)}
              </CardTitle>
            </CardHeader>
          </Card>
        )}
        
        {metrics?.cagr1Year !== undefined && metrics.cagr1Year !== null && (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>1-Year CAGR</CardDescription>
              <CardTitle className={`text-lg ${metrics.cagr1Year >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatPercentage(metrics.cagr1Year)}
              </CardTitle>
            </CardHeader>
          </Card>
        )}
        
        {metrics?.cagr3Year !== undefined && metrics.cagr3Year !== null && (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>3-Year CAGR</CardDescription>
              <CardTitle className={`text-lg ${metrics.cagr3Year >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatPercentage(metrics.cagr3Year)}
              </CardTitle>
            </CardHeader>
          </Card>
        )}
        
        {metrics?.cagr5Year !== undefined && metrics.cagr5Year !== null && (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>5-Year CAGR</CardDescription>
              <CardTitle className={`text-lg ${metrics.cagr5Year >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatPercentage(metrics.cagr5Year)}
              </CardTitle>
            </CardHeader>
          </Card>
        )}
        
        {metrics?.beta1Year !== undefined && metrics.beta1Year !== null && (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>
                1-Year Beta
                <span className="text-xs text-muted-foreground ml-2">
                  ({asset.assetType === 'us-equity' ? 'vs SPX500' : 'vs KSE100'})
                </span>
              </CardDescription>
              <CardTitle className="text-lg">
                {metrics.beta1Year.toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>
        )}
        
        {metrics?.sharpeRatio1Year !== undefined && metrics.sharpeRatio1Year !== null && (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>
                1-Year Sharpe Ratio
                <span className="text-xs text-muted-foreground ml-2">
                  (Annualized)
                </span>
              </CardDescription>
              <CardTitle className={`text-lg ${metrics.sharpeRatio1Year >= 1 ? 'text-green-600 dark:text-green-400' : metrics.sharpeRatio1Year >= 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                {metrics.sharpeRatio1Year.toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>
        )}
      </div>

      {asset.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{asset.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

