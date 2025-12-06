"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { SeasonalityTable } from "./seasonality-table"
import { AssetPriceChart } from "./asset-price-chart"
import { DividendTable } from "./dividend-table"
import { AssetFinancialsView } from "./asset-financials-view"
import { HistoricPEChart } from "./historic-pe-chart"

interface AssetDetailViewProps {
  asset: TrackedAsset
  riskFreeRates?: RiskFreeRates
}

interface AssetMetrics extends CalculatedMetrics {
  currentPrice?: number
  peRatio?: number
}

type MaxDrawdownTimeframe = '1Y' | '3Y' | '5Y' | 'All'

export function AssetDetailView({ asset, riskFreeRates }: AssetDetailViewProps) {
  const [metrics, setMetrics] = useState<AssetMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('analytics')
  const [maxDrawdownTimeframe, setMaxDrawdownTimeframe] = useState<MaxDrawdownTimeframe>('3Y')
  const [fullHistoricalDataForMaxDD, setFullHistoricalDataForMaxDD] = useState<PriceDataPoint[]>([])
  const [maxDrawdown, setMaxDrawdown] = useState<number | null>(null)

  // Use provided risk-free rates or load from localStorage
  const effectiveRiskFreeRates = riskFreeRates || loadRiskFreeRates()

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true)
      setError(null)

      try {
        // Fetch current price using unified API
        const market = asset.assetType === 'pk-equity' ? 'PSX' : asset.assetType === 'us-equity' ? 'US' : null
        let historicalDataUrl = ''

        // For detailed view, fetch enough data for 5-year CAGR (approx 1260 trading days)
        // But we'll use only the most recent 1 year (252 days) for Beta, Sharpe Ratio, and Sortino Ratio calculations
        // This ensures consistency: summary uses 1 year, detailed uses 1 year for 1-year metrics
        // But detailed can still calculate 3-year and 5-year CAGR
        const dataLimitForCAGR = 1260 // ~5 years of trading days
        const dataLimitForBetaSharpe = 252 // 1 year for consistency with summary

        // Fetch current price using unified price API (handles client-side fetch for indices)
        let currentPrice: number | undefined
        if (asset.assetType === 'crypto') {
          const { parseSymbolToBinance } = await import('@/lib/portfolio/binance-api')
          const binanceSymbol = parseSymbolToBinance(asset.symbol)
          const { fetchCryptoPrice } = await import('@/lib/portfolio/unified-price-api')
          const priceData = await fetchCryptoPrice(binanceSymbol)
          if (priceData && priceData.price) {
            currentPrice = priceData.price
          }
          historicalDataUrl = `/api/historical-data?assetType=crypto&symbol=${encodeURIComponent(binanceSymbol)}&limit=${dataLimitForCAGR}`
        } else if (asset.assetType === 'pk-equity') {
          const { fetchPKEquityPrice } = await import('@/lib/portfolio/unified-price-api')
          const priceData = await fetchPKEquityPrice(asset.symbol)
          if (priceData && priceData.price) {
            currentPrice = priceData.price
          }
          historicalDataUrl = `/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(asset.symbol)}&market=PSX&limit=${dataLimitForCAGR}`
        } else if (asset.assetType === 'us-equity') {
          const { fetchUSEquityPrice } = await import('@/lib/portfolio/unified-price-api')
          const priceData = await fetchUSEquityPrice(asset.symbol)
          if (priceData && priceData.price) {
            currentPrice = priceData.price
          }
          historicalDataUrl = `/api/historical-data?assetType=us-equity&symbol=${encodeURIComponent(asset.symbol)}&market=US&limit=${dataLimitForCAGR}`
        } else if (asset.assetType === 'metals') {
          const { fetchMetalsPrice } = await import('@/lib/portfolio/unified-price-api')
          const priceData = await fetchMetalsPrice(asset.symbol)
          if (priceData && priceData.price) {
            currentPrice = priceData.price
          }
          historicalDataUrl = `/api/historical-data?assetType=metals&symbol=${encodeURIComponent(asset.symbol)}&limit=${dataLimitForCAGR}`
        } else if (asset.assetType === 'kse100' || asset.assetType === 'spx500') {
          // Use unified price API for indices (handles client-side fetch automatically)
          const { fetchIndicesPrice } = await import('@/lib/portfolio/unified-price-api')
          const priceData = await fetchIndicesPrice(asset.symbol)
          if (priceData && priceData.price) {
            currentPrice = priceData.price
          }
          const apiAssetType = asset.assetType === 'kse100' ? 'kse100' : 'spx500'
          historicalDataUrl = `/api/historical-data?assetType=${apiAssetType}&symbol=${encodeURIComponent(asset.symbol)}&limit=${dataLimitForCAGR}`
        }

        // Determine benchmark for Beta calculation (use 1 year for consistency with summary)
        let benchmarkDataUrl = ''
        if (asset.assetType === 'us-equity') {
          // Use SPX500 as benchmark for US equities
          benchmarkDataUrl = `/api/historical-data?assetType=spx500&symbol=SPX500&limit=${dataLimitForBetaSharpe}`
        } else if (asset.assetType === 'pk-equity') {
          // Use KSE100 as benchmark for PK equities
          benchmarkDataUrl = `/api/historical-data?assetType=kse100&symbol=KSE100&limit=${dataLimitForBetaSharpe}`
        }

        // Fetch historical data and benchmark data in parallel
        const fetchPromises = [
          historicalDataUrl ? fetch(historicalDataUrl) : Promise.resolve(null),
          benchmarkDataUrl ? fetch(benchmarkDataUrl) : Promise.resolve(null)
        ]

        const [historicalResponse, benchmarkResponse] = await Promise.all(fetchPromises)

        let historicalData: PriceDataPoint[] = []
        let benchmarkData: PriceDataPoint[] = []

        if (historicalResponse && historicalResponse.ok) {
          const historicalDataResponse = await historicalResponse.json()
          if (historicalDataResponse.data && Array.isArray(historicalDataResponse.data)) {
            // Convert API response to PriceDataPoint format
            historicalData = historicalDataResponse.data.map((record: any) => ({
              date: record.date,
              close: parseFloat(record.close)
            })).filter((point: PriceDataPoint) => !isNaN(point.close))
              .sort((a: PriceDataPoint, b: PriceDataPoint) => a.date.localeCompare(b.date))

            // Fallback: Use latest historical price if current price is not available
            if (currentPrice === undefined && historicalData.length > 0) {
              const latestDataPoint = historicalData[historicalData.length - 1]
              currentPrice = latestDataPoint.close
              console.log(`[Asset Screener] Using latest historical price as fallback: ${currentPrice} (date: ${latestDataPoint.date})`)
            }
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

        // For seasonality, we need ALL historical data, not just 5 years
        // Fetch all available data for seasonality calculations
        let fullHistoricalDataUrl = ''
        if (asset.assetType === 'crypto') {
          const { parseSymbolToBinance } = await import('@/lib/portfolio/binance-api')
          const binanceSymbol = parseSymbolToBinance(asset.symbol)
          fullHistoricalDataUrl = `/api/historical-data?assetType=crypto&symbol=${encodeURIComponent(binanceSymbol)}`
        } else if (asset.assetType === 'pk-equity') {
          fullHistoricalDataUrl = `/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(asset.symbol)}&market=PSX`
        } else if (asset.assetType === 'us-equity') {
          fullHistoricalDataUrl = `/api/historical-data?assetType=us-equity&symbol=${encodeURIComponent(asset.symbol)}&market=US`
        } else if (asset.assetType === 'metals') {
          fullHistoricalDataUrl = `/api/historical-data?assetType=metals&symbol=${encodeURIComponent(asset.symbol)}`
        } else if (asset.assetType === 'kse100' || asset.assetType === 'spx500') {
          const apiAssetType = asset.assetType === 'kse100' ? 'kse100' : 'spx500'
          fullHistoricalDataUrl = `/api/historical-data?assetType=${apiAssetType}&symbol=${encodeURIComponent(asset.symbol)}`
        }

        // Fetch full historical data for seasonality and max drawdown (no limit)
        let fullHistoricalData: PriceDataPoint[] = []
        if (fullHistoricalDataUrl) {
          const fullHistoricalResponse = await fetch(fullHistoricalDataUrl)
          if (fullHistoricalResponse.ok) {
            const fullResponseData = await fullHistoricalResponse.json()
            if (fullResponseData.data && Array.isArray(fullResponseData.data)) {
              fullHistoricalData = fullResponseData.data
                .map((record: any) => ({
                  date: record.date,
                  close: parseFloat(record.close)
                }))
                .filter((point: PriceDataPoint) => !isNaN(point.close))
                .sort((a: PriceDataPoint, b: PriceDataPoint) => a.date.localeCompare(b.date))

              // Store full historical data for max drawdown calculations
              setFullHistoricalDataForMaxDD(fullHistoricalData)
            }
          }
        }

        // Calculate metrics if we have both current price and historical data
        if (currentPrice !== undefined && historicalData.length > 0) {
          // For Beta, Sharpe Ratio, and Sortino Ratio, use only the most recent 1 year of data (252 records)
          // This ensures consistency with summary metrics
          // For CAGR, use all available data
          // Note: historicalData is already in ascending order (oldest to newest)
          // So slice(-252) gives us the most recent 252 records
          const historicalDataForBetaSharpe = historicalData.slice(-dataLimitForBetaSharpe)
          // Benchmark data is already fetched with limit=252, so it's already the most recent year

          // Use full historical data for seasonality, but limited data for other metrics
          const dataForSeasonality = fullHistoricalData.length > 0 ? fullHistoricalData : historicalData

          // Calculate metrics with full data for CAGR, but use 1-year subset for Beta/Sharpe/Sortino
          // Use full historical data for seasonality calculations
          // Note: We'll calculate max drawdown separately based on selected timeframe
          const calculatedMetrics = calculateAllMetrics(
            currentPrice,
            historicalData, // Full data for CAGR calculations (limited to 5 years)
            asset.assetType,
            benchmarkData.length > 0 ? benchmarkData : undefined,
            effectiveRiskFreeRates,
            historicalDataForBetaSharpe, // 1-year subset for Beta and Sharpe
            undefined, // 3-year subset (not used here, we calculate max drawdown separately)
            dataForSeasonality // Full historical data for seasonality
          )

          // Calculate max drawdown based on selected timeframe
          const { calculateMaxDrawdown } = await import('@/lib/asset-screener/metrics-calculations')
          const dataForMaxDD = fullHistoricalData.length > 0 ? fullHistoricalData : historicalData
          let maxDD: number | null = null

          if (dataForMaxDD.length > 0) {
            // Filter data based on selected timeframe
            let filteredData = dataForMaxDD
            const now = new Date()
            if (maxDrawdownTimeframe === '1Y') {
              const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
              filteredData = dataForMaxDD.filter(point => new Date(point.date) >= oneYearAgo)
            } else if (maxDrawdownTimeframe === '3Y') {
              const threeYearsAgo = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate())
              filteredData = dataForMaxDD.filter(point => new Date(point.date) >= threeYearsAgo)
            } else if (maxDrawdownTimeframe === '5Y') {
              const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate())
              filteredData = dataForMaxDD.filter(point => new Date(point.date) >= fiveYearsAgo)
            }
            // 'All' uses all data, no filtering needed

            if (filteredData.length > 0) {
              maxDD = calculateMaxDrawdown(filteredData)
            }
          }

          // Calculate P/E Ratio for PK Equities
          let peRatio: number | undefined
          if (asset.assetType === 'pk-equity' && currentPrice) {
            try {
              const financialsRes = await fetch(`/api/financials?symbol=${asset.symbol}&period=quarterly`)
              if (financialsRes.ok) {
                const data = await financialsRes.json()
                const financials = data.financials
                // Sum EPS of last 4 quarters for TTM EPS
                if (financials && financials.length >= 4) {
                  const ttmEps = financials.slice(0, 4).reduce((sum: number, f: any) => sum + (parseFloat(f.eps_diluted) || 0), 0)
                  // Calculate PE ratio even if EPS is negative (negative PE is valid for loss-making companies)
                  // Only skip if EPS is exactly 0 to avoid division by zero
                  if (ttmEps !== 0) {
                    peRatio = currentPrice / ttmEps
                  }
                }
              }
            } catch (e) {
              console.error('Error fetching financials for P/E:', e)
            }
          }

          setMaxDrawdown(maxDD)
          setMetrics({
            currentPrice,
            peRatio,
            ...calculatedMetrics,
            maxDrawdown: maxDD // Override with timeframe-specific max drawdown
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

  // Recalculate max drawdown when timeframe changes
  useEffect(() => {
    const recalculateMaxDrawdown = async () => {
      if (fullHistoricalDataForMaxDD.length > 0) {
        const { calculateMaxDrawdown } = await import('@/lib/asset-screener/metrics-calculations')

        let filteredData = fullHistoricalDataForMaxDD
        const now = new Date()
        if (maxDrawdownTimeframe === '1Y') {
          const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
          filteredData = fullHistoricalDataForMaxDD.filter(point => new Date(point.date) >= oneYearAgo)
        } else if (maxDrawdownTimeframe === '3Y') {
          const threeYearsAgo = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate())
          filteredData = fullHistoricalDataForMaxDD.filter(point => new Date(point.date) >= threeYearsAgo)
        } else if (maxDrawdownTimeframe === '5Y') {
          const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate())
          filteredData = fullHistoricalDataForMaxDD.filter(point => new Date(point.date) >= fiveYearsAgo)
        }
        // 'All' uses all data, no filtering needed

        if (filteredData.length > 0) {
          const maxDD = calculateMaxDrawdown(filteredData)
          setMaxDrawdown(maxDD)
          setMetrics(prev => {
            if (prev) {
              return {
                ...prev,
                maxDrawdown: maxDD
              }
            }
            return prev
          })
        }
      }
    }

    recalculateMaxDrawdown()
  }, [maxDrawdownTimeframe, fullHistoricalDataForMaxDD])

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
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="mb-6">
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        {asset.assetType === 'pk-equity' && (
          <TabsTrigger value="financials">Financials</TabsTrigger>
        )}
        {asset.assetType === 'pk-equity' && (
          <TabsTrigger value="dividends">Dividends</TabsTrigger>
        )}
        <TabsTrigger value="prices">Prices & Ratios</TabsTrigger>
        <TabsTrigger value="seasonality">Seasonality</TabsTrigger>
      </TabsList>

      <TabsContent value="analytics" className="space-y-4">
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

          {metrics?.peRatio !== undefined && (
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>P/E Ratio (TTM)</CardDescription>
                <CardTitle className="text-lg">
                  {metrics.peRatio.toFixed(2)}
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
      </TabsContent>

      {asset.assetType === 'pk-equity' && (
        <TabsContent value="financials" className="space-y-4">
          <AssetFinancialsView symbol={asset.symbol} assetType={asset.assetType} />
        </TabsContent>
      )}

      {asset.assetType === 'pk-equity' && (
        <TabsContent value="dividends" className="space-y-4">
          <DividendTable assetType={asset.assetType} symbol={asset.symbol} />
        </TabsContent>
      )}

      <TabsContent value="prices" className="space-y-4">
        <AssetPriceChart asset={asset} />

        <HistoricPEChart asset={asset} />

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Risk Metrics</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Max Drawdown Period:</span>
            <Select value={maxDrawdownTimeframe} onValueChange={(value) => setMaxDrawdownTimeframe(value as MaxDrawdownTimeframe)}>
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

          {metrics?.sortinoRatio1Year !== undefined && metrics.sortinoRatio1Year !== null && (
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>
                  1-Year Sortino Ratio
                  <span className="text-xs text-muted-foreground ml-2">
                    (Annualized, Downside Risk)
                  </span>
                </CardDescription>
                <CardTitle className={`text-lg ${metrics.sortinoRatio1Year >= 1 ? 'text-green-600 dark:text-green-400' : metrics.sortinoRatio1Year >= 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                  {metrics.sortinoRatio1Year.toFixed(2)}
                </CardTitle>
              </CardHeader>
            </Card>
          )}

          {maxDrawdown !== null && (
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>
                  Max Drawdown
                  <span className="text-xs text-muted-foreground ml-2">
                    ({maxDrawdownTimeframe === 'All' ? 'All Time' : maxDrawdownTimeframe})
                  </span>
                </CardDescription>
                <CardTitle className="text-lg text-red-600 dark:text-red-400">
                  {formatPercentage(maxDrawdown)}
                </CardTitle>
              </CardHeader>
            </Card>
          )}
        </div>
      </TabsContent>

      <TabsContent value="seasonality" className="space-y-4">
        {metrics?.monthlySeasonality ? (
          <SeasonalityTable
            monthlySeasonality={metrics.monthlySeasonality}
          />
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No seasonality data available</p>
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  )
}

