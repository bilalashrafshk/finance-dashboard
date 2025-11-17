"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import type { TrackedAsset } from "./add-asset-dialog"
import { 
  calculateAllMetrics,
  formatPercentage, 
  formatCurrency,
  type PriceDataPoint 
} from "@/lib/asset-screener/metrics-calculations"
import { loadRiskFreeRates } from "./risk-free-rate-settings"

interface AssetSummaryMetricsProps {
  asset: TrackedAsset
}

export function AssetSummaryMetrics({ asset }: AssetSummaryMetricsProps) {
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [ytdReturn, setYtdReturn] = useState<number | null>(null)
  const [beta, setBeta] = useState<number | null>(null)
  const [sharpeRatio, setSharpeRatio] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSummaryMetrics = async () => {
      setLoading(true)
      
      try {
        const market = asset.assetType === 'pk-equity' ? 'PSX' : asset.assetType === 'us-equity' ? 'US' : null
        let priceUrl = ''
        let historicalDataUrl = ''
        let benchmarkDataUrl = ''
        
        if (asset.assetType === 'crypto') {
          const { parseSymbolToBinance } = await import('@/lib/portfolio/binance-api')
          const binanceSymbol = parseSymbolToBinance(asset.symbol)
          priceUrl = `/api/crypto/price?symbol=${encodeURIComponent(binanceSymbol)}`
          historicalDataUrl = `/api/historical-data?assetType=crypto&symbol=${encodeURIComponent(binanceSymbol)}&limit=252` // 1 year
        } else if (asset.assetType === 'pk-equity') {
          priceUrl = `/api/pk-equity/price?ticker=${encodeURIComponent(asset.symbol)}`
          historicalDataUrl = `/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(asset.symbol)}&market=PSX&limit=252`
          benchmarkDataUrl = `/api/historical-data?assetType=kse100&symbol=KSE100&limit=252`
        } else if (asset.assetType === 'us-equity') {
          priceUrl = `/api/us-equity/price?ticker=${encodeURIComponent(asset.symbol)}`
          historicalDataUrl = `/api/historical-data?assetType=us-equity&symbol=${encodeURIComponent(asset.symbol)}&market=US&limit=252`
          benchmarkDataUrl = `/api/historical-data?assetType=spx500&symbol=SPX500&limit=252`
        } else if (asset.assetType === 'metals') {
          priceUrl = `/api/metals/price?symbol=${encodeURIComponent(asset.symbol)}`
          historicalDataUrl = `/api/historical-data?assetType=metals&symbol=${encodeURIComponent(asset.symbol)}&limit=252`
        } else if (asset.assetType === 'kse100' || asset.assetType === 'spx500') {
          priceUrl = `/api/indices/price?symbol=${encodeURIComponent(asset.symbol)}`
          const apiAssetType = asset.assetType === 'kse100' ? 'kse100' : 'spx500'
          historicalDataUrl = `/api/historical-data?assetType=${apiAssetType}&symbol=${encodeURIComponent(asset.symbol)}&limit=252`
        }
        
        // Fetch in parallel
        const fetchPromises = [
          priceUrl ? fetch(priceUrl) : Promise.resolve(null),
          historicalDataUrl ? fetch(historicalDataUrl) : Promise.resolve(null),
          benchmarkDataUrl ? fetch(benchmarkDataUrl) : Promise.resolve(null)
        ]
        
        const [priceResponse, historicalResponse, benchmarkResponse] = await Promise.all(fetchPromises)
        
        let price: number | undefined
        let historicalData: PriceDataPoint[] = []
        let benchmarkData: PriceDataPoint[] = []
        
        if (priceResponse && priceResponse.ok) {
          const priceData = await priceResponse.json()
          price = priceData.price
          setCurrentPrice(price)
        }
        
        if (historicalResponse && historicalResponse.ok) {
          const historicalDataResponse = await historicalResponse.json()
          if (historicalDataResponse.data && Array.isArray(historicalDataResponse.data)) {
            historicalData = historicalDataResponse.data.map((record: any) => ({
              date: record.date,
              close: parseFloat(record.close)
            })).filter((point: PriceDataPoint) => !isNaN(point.close))
          }
        }
        
        if (benchmarkResponse && benchmarkResponse.ok) {
          const benchmarkDataResponse = await benchmarkResponse.json()
          if (benchmarkDataResponse.data && Array.isArray(benchmarkDataResponse.data)) {
            benchmarkData = benchmarkDataResponse.data.map((record: any) => ({
              date: record.date,
              close: parseFloat(record.close)
            })).filter((point: PriceDataPoint) => !isNaN(point.close))
          }
        }
        
        // Calculate metrics if we have price and historical data
        if (price !== undefined && historicalData.length > 0) {
          const riskFreeRates = loadRiskFreeRates()
          const metrics = calculateAllMetrics(
            price,
            historicalData,
            asset.assetType,
            benchmarkData.length > 0 ? benchmarkData : undefined,
            riskFreeRates
          )
          
          if (metrics.ytdReturnPercent !== null && metrics.ytdReturnPercent !== undefined) {
            setYtdReturn(metrics.ytdReturnPercent)
          }
          if (metrics.beta1Year !== null && metrics.beta1Year !== undefined) {
            setBeta(metrics.beta1Year)
          }
          if (metrics.sharpeRatio1Year !== null && metrics.sharpeRatio1Year !== undefined) {
            setSharpeRatio(metrics.sharpeRatio1Year)
          }
        }
      } catch (error) {
        console.error(`Error fetching summary metrics for ${asset.symbol}:`, error)
      } finally {
        setLoading(false)
      }
    }

    fetchSummaryMetrics()
  }, [asset])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading metrics...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      {currentPrice !== null && (
        <div>
          <span className="text-muted-foreground">Price: </span>
          <span className="font-semibold">
            {formatCurrency(currentPrice, asset.currency, asset.assetType === 'crypto' ? 4 : 2)}
          </span>
        </div>
      )}
      
      {ytdReturn !== null && (
        <div>
          <span className="text-muted-foreground">YTD: </span>
          <span className={`font-semibold ${ytdReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatPercentage(ytdReturn)}
          </span>
        </div>
      )}
      
      {beta !== null && (asset.assetType === 'us-equity' || asset.assetType === 'pk-equity') && (
        <div>
          <span className="text-muted-foreground">Beta: </span>
          <span className="font-semibold">{beta.toFixed(2)}</span>
        </div>
      )}
      
      {sharpeRatio !== null && (asset.assetType === 'us-equity' || asset.assetType === 'pk-equity') && (
        <div>
          <span className="text-muted-foreground">Sharpe: </span>
          <span className={`font-semibold ${
            sharpeRatio >= 1 ? 'text-green-600 dark:text-green-400' : 
            sharpeRatio >= 0 ? 'text-yellow-600 dark:text-yellow-400' : 
            'text-red-600 dark:text-red-400'
          }`}>
            {sharpeRatio.toFixed(2)}
          </span>
        </div>
      )}
      
      {!currentPrice && !ytdReturn && !beta && !sharpeRatio && (
        <span className="text-muted-foreground text-xs">No metrics available</span>
      )}
    </div>
  )
}


