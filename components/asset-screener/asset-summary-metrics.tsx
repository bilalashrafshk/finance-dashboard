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
  const [sortinoRatio, setSortinoRatio] = useState<number | null>(null)
  const [maxDrawdown, setMaxDrawdown] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  // Separate data for max drawdown (5 years)
  const dataLimitForMaxDD = 1260 // ~5 years of trading days

  useEffect(() => {
    const fetchSummaryMetrics = async () => {
      setLoading(true)

      try {
        const market = asset.assetType === 'pk-equity' ? 'PSX' : asset.assetType === 'us-equity' ? 'US' : null
        let historicalDataUrl = ''
        let benchmarkDataUrl = ''

        // Fetch current price using unified price API (handles client-side fetch for indices)
        let price: number | undefined
        if (asset.assetType === 'crypto') {
          const { parseSymbolToBinance } = await import('@/lib/portfolio/binance-api')
          const binanceSymbol = parseSymbolToBinance(asset.symbol)
          const { fetchCryptoPrice } = await import('@/lib/portfolio/unified-price-api')
          const priceData = await fetchCryptoPrice(binanceSymbol)
          if (priceData && priceData.price) {
            price = priceData.price
            setCurrentPrice(price)
          }
          historicalDataUrl = `/api/historical-data?assetType=crypto&symbol=${encodeURIComponent(binanceSymbol)}&limit=252` // 1 year
        } else if (asset.assetType === 'pk-equity') {
          const { fetchPKEquityPrice } = await import('@/lib/portfolio/unified-price-api')
          const priceData = await fetchPKEquityPrice(asset.symbol)
          if (priceData && priceData.price) {
            price = priceData.price
            setCurrentPrice(price)
          }
          historicalDataUrl = `/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(asset.symbol)}&market=PSX&limit=252`
          benchmarkDataUrl = `/api/historical-data?assetType=kse100&symbol=KSE100&limit=252`
        } else if (asset.assetType === 'us-equity') {
          const { fetchUSEquityPrice } = await import('@/lib/portfolio/unified-price-api')
          const priceData = await fetchUSEquityPrice(asset.symbol)
          if (priceData && priceData.price) {
            price = priceData.price
            setCurrentPrice(price)
          }
          historicalDataUrl = `/api/historical-data?assetType=us-equity&symbol=${encodeURIComponent(asset.symbol)}&market=US&limit=252`
          benchmarkDataUrl = `/api/historical-data?assetType=spx500&symbol=SPX500&limit=252`
        } else if (asset.assetType === 'metals') {
          const { fetchMetalsPrice } = await import('@/lib/portfolio/unified-price-api')
          const priceData = await fetchMetalsPrice(asset.symbol)
          if (priceData && priceData.price) {
            price = priceData.price
            setCurrentPrice(price)
          }
          historicalDataUrl = `/api/historical-data?assetType=metals&symbol=${encodeURIComponent(asset.symbol)}&limit=252`
        } else if (asset.assetType === 'kse100' || asset.assetType === 'spx500') {
          // Use unified price API for indices (handles client-side fetch automatically)
          const { fetchIndicesPrice } = await import('@/lib/portfolio/unified-price-api')
          const priceData = await fetchIndicesPrice(asset.symbol)
          if (priceData && priceData.price) {
            price = priceData.price
            setCurrentPrice(price)
          }
          const apiAssetType = asset.assetType === 'kse100' ? 'kse100' : 'spx500'
          historicalDataUrl = `/api/historical-data?assetType=${apiAssetType}&symbol=${encodeURIComponent(asset.symbol)}&limit=252`
        }

        // For max drawdown, we need 5 years of data
        let maxDrawdownDataUrl = ''
        if (asset.assetType === 'crypto') {
          const { parseSymbolToBinance } = await import('@/lib/portfolio/binance-api')
          const binanceSymbol = parseSymbolToBinance(asset.symbol)
          maxDrawdownDataUrl = `/api/historical-data?assetType=crypto&symbol=${encodeURIComponent(binanceSymbol)}&limit=${dataLimitForMaxDD}`
        } else if (asset.assetType === 'pk-equity') {
          maxDrawdownDataUrl = `/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(asset.symbol)}&market=PSX&limit=${dataLimitForMaxDD}`
        } else if (asset.assetType === 'us-equity') {
          maxDrawdownDataUrl = `/api/historical-data?assetType=us-equity&symbol=${encodeURIComponent(asset.symbol)}&market=US&limit=${dataLimitForMaxDD}`
        } else if (asset.assetType === 'metals') {
          maxDrawdownDataUrl = `/api/historical-data?assetType=metals&symbol=${encodeURIComponent(asset.symbol)}&limit=${dataLimitForMaxDD}`
        } else if (asset.assetType === 'kse100' || asset.assetType === 'spx500') {
          const apiAssetType = asset.assetType === 'kse100' ? 'kse100' : 'spx500'
          maxDrawdownDataUrl = `/api/historical-data?assetType=${apiAssetType}&symbol=${encodeURIComponent(asset.symbol)}&limit=${dataLimitForMaxDD}`
        }

        // Fetch in parallel
        const fetchPromises = [
          historicalDataUrl ? fetch(historicalDataUrl) : Promise.resolve(null),
          benchmarkDataUrl ? fetch(benchmarkDataUrl) : Promise.resolve(null),
          maxDrawdownDataUrl ? fetch(maxDrawdownDataUrl) : Promise.resolve(null)
        ]

        const [historicalResponse, benchmarkResponse, maxDrawdownResponse] = await Promise.all(fetchPromises)

        let historicalData: PriceDataPoint[] = []
        let benchmarkData: PriceDataPoint[] = []
        let maxDrawdownData: PriceDataPoint[] = []

        if (historicalResponse && historicalResponse.ok) {
          const historicalDataResponse = await historicalResponse.json()
          if (historicalDataResponse.data && Array.isArray(historicalDataResponse.data)) {
            historicalData = historicalDataResponse.data.map((record: any) => ({
              date: record.date,
              close: parseFloat(record.close)
            })).filter((point: PriceDataPoint) => !isNaN(point.close))
              .sort((a: PriceDataPoint, b: PriceDataPoint) => a.date.localeCompare(b.date))

            // Fallback: Use latest historical price if current price is not available
            if (price === undefined && historicalData.length > 0) {
              const latestDataPoint = historicalData[historicalData.length - 1]
              price = latestDataPoint.close
              setCurrentPrice(price)

            }
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

        if (maxDrawdownResponse && maxDrawdownResponse.ok) {
          const maxDrawdownDataResponse = await maxDrawdownResponse.json()
          if (maxDrawdownDataResponse.data && Array.isArray(maxDrawdownDataResponse.data)) {
            maxDrawdownData = maxDrawdownDataResponse.data.map((record: any) => ({
              date: record.date,
              close: parseFloat(record.close)
            })).filter((point: PriceDataPoint) => !isNaN(point.close))
              .sort((a: PriceDataPoint, b: PriceDataPoint) => a.date.localeCompare(b.date))
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
          if (metrics.sortinoRatio1Year !== null && metrics.sortinoRatio1Year !== undefined) {
            setSortinoRatio(metrics.sortinoRatio1Year)
          }

          // Calculate max drawdown using 5-year data
          if (maxDrawdownData.length > 0) {
            const { calculateMaxDrawdown } = await import('@/lib/asset-screener/metrics-calculations')
            const maxDD = calculateMaxDrawdown(maxDrawdownData)
            if (maxDD !== null) {
              setMaxDrawdown(maxDD)
            }
          } else if (metrics.maxDrawdown !== null && metrics.maxDrawdown !== undefined) {
            // Fallback to using regular historical data if max drawdown data fetch failed
            setMaxDrawdown(metrics.maxDrawdown)
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
          <span className={`font-semibold ${sharpeRatio >= 1 ? 'text-green-600 dark:text-green-400' :
              sharpeRatio >= 0 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-red-600 dark:text-red-400'
            }`}>
            {sharpeRatio.toFixed(2)}
          </span>
        </div>
      )}

      {sortinoRatio !== null && (asset.assetType === 'us-equity' || asset.assetType === 'pk-equity') && (
        <div>
          <span className="text-muted-foreground">Sortino: </span>
          <span className={`font-semibold ${sortinoRatio >= 1 ? 'text-green-600 dark:text-green-400' :
              sortinoRatio >= 0 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-red-600 dark:text-red-400'
            }`}>
            {sortinoRatio.toFixed(2)}
          </span>
        </div>
      )}

      {maxDrawdown !== null && (
        <div>
          <span className="text-muted-foreground">Max DD (5Y): </span>
          <span className="font-semibold text-red-600 dark:text-red-400">
            {formatPercentage(maxDrawdown)}
          </span>
        </div>
      )}

      {!currentPrice && !ytdReturn && !beta && !sharpeRatio && !sortinoRatio && !maxDrawdown && (
        <span className="text-muted-foreground text-xs">No metrics available</span>
      )}
    </div>
  )
}


