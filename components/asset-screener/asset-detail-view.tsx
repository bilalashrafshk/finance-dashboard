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
import { RiskMetricsDisplay } from "./risk-metrics-display"
import { AssetAnalysisTab } from "./asset-analysis-tab"
import { DCASimulator } from "./dca-simulator"

interface AssetDetailViewProps {
  asset: TrackedAsset
  riskFreeRates?: RiskFreeRates
}

interface AssetMetrics extends CalculatedMetrics {
  currentPrice?: number
  peRatio?: number
  allTimeHigh?: number
  fiftyTwoWeekHigh?: number
}

type MaxDrawdownTimeframe = '1Y' | '3Y' | '5Y' | 'All'

export function AssetDetailView({ asset, riskFreeRates }: AssetDetailViewProps) {
  const [metrics, setMetrics] = useState<AssetMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('analytics')
  const [maxDrawdownTimeframe, setMaxDrawdownTimeframe] = useState<MaxDrawdownTimeframe>('3Y')
  const [fullHistoricalDataForMaxDD, setFullHistoricalDataForMaxDD] = useState<PriceDataPoint[]>([])
  const [fullBenchmarkData, setFullBenchmarkData] = useState<PriceDataPoint[]>([])
  const [maxDrawdown, setMaxDrawdown] = useState<number | null>(null)

  // Use provided risk-free rates or load from localStorage
  const effectiveRiskFreeRates = riskFreeRates || loadRiskFreeRates()

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true)
      setError(null)

      try {
        // Define data limits
        const dataLimitForCAGR = 1260 // ~5 years of trading days
        const dataLimitForBetaSharpe = 252 // 1 year for consistency with summary

        // A. Setup parallel fetches
        const fetchCurrentPriceFunc = async () => {
          let price: number | undefined
          if (asset.assetType === 'crypto') {
            const { parseSymbolToBinance } = await import('@/lib/portfolio/binance-api')
            const binanceSymbol = parseSymbolToBinance(asset.symbol)
            const { fetchCryptoPrice } = await import('@/lib/portfolio/unified-price-api')
            const priceData = await fetchCryptoPrice(binanceSymbol)
            price = priceData?.price
          } else if (asset.assetType === 'pk-equity') {
            const { fetchPKEquityPrice } = await import('@/lib/portfolio/unified-price-api')
            const priceData = await fetchPKEquityPrice(asset.symbol)
            price = priceData?.price
          } else if (asset.assetType === 'us-equity') {
            const { fetchUSEquityPrice } = await import('@/lib/portfolio/unified-price-api')
            const priceData = await fetchUSEquityPrice(asset.symbol)
            price = priceData?.price
          } else if (asset.assetType === 'metals') {
            const { fetchMetalsPrice } = await import('@/lib/portfolio/unified-price-api')
            const priceData = await fetchMetalsPrice(asset.symbol)
            price = priceData?.price
          } else if (asset.assetType === 'kse100' || asset.assetType === 'spx500') {
            const { fetchIndicesPrice } = await import('@/lib/portfolio/unified-price-api')
            const priceData = await fetchIndicesPrice(asset.symbol)
            price = priceData?.price
          }
          return price
        }

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

        let benchmarkDataUrl = ''
        if (asset.assetType === 'us-equity') {
          benchmarkDataUrl = `/api/historical-data?assetType=spx500&symbol=SPX500`
        } else if (asset.assetType === 'pk-equity') {
          benchmarkDataUrl = `/api/historical-data?assetType=kse100&symbol=KSE100`
        }

        let financialsUrl = ''
        if (asset.assetType === 'pk-equity') {
          financialsUrl = `/api/financials?symbol=${asset.symbol}&period=quarterly`
        }

        const metadataUrl = `/api/asset/metadata?symbol=${encodeURIComponent(asset.symbol)}&assetType=${encodeURIComponent(asset.assetType)}`

        // B. FIRE PARALLEL FETCHES
        const [
          priceRes,
          histRes,
          benchRes,
          finRes,
          metaRes
        ] = await Promise.allSettled([
          fetchCurrentPriceFunc(),
          fullHistoricalDataUrl ? fetch(fullHistoricalDataUrl).then(r => r.ok ? r.json() : null) : Promise.resolve(null),
          benchmarkDataUrl ? fetch(benchmarkDataUrl).then(r => r.ok ? r.json() : null) : Promise.resolve(null),
          financialsUrl ? fetch(financialsUrl).then(r => r.ok ? r.json() : null) : Promise.resolve(null),
          fetch(metadataUrl).then(r => r.ok ? r.json() : null)
        ])

        // C. Process Results
        let currentPrice = priceRes.status === 'fulfilled' ? priceRes.value : undefined

        let fullHistoricalData: PriceDataPoint[] = []
        if (histRes.status === 'fulfilled' && histRes.value?.data) {
          fullHistoricalData = histRes.value.data
            .map((record: any) => ({
              date: record.date,
              close: parseFloat(record.adjusted_close ?? record.close)
            }))
            .filter((point: PriceDataPoint) => !isNaN(point.close))
            .sort((a: PriceDataPoint, b: PriceDataPoint) => a.date.localeCompare(b.date))

          setFullHistoricalDataForMaxDD(fullHistoricalData)

          // Fallback currentPrice
          if (currentPrice === undefined && fullHistoricalData.length > 0) {
            currentPrice = fullHistoricalData[fullHistoricalData.length - 1].close
          }
        }

        // Slice 5Yr equivalent out of full array dynamically
        const historicalData = fullHistoricalData.slice(-dataLimitForCAGR)

        let benchmarkData: PriceDataPoint[] = []
        if (benchRes.status === 'fulfilled' && benchRes.value?.data) {
          benchmarkData = benchRes.value.data
            .map((record: any) => ({
              date: record.date,
              close: parseFloat(record.adjusted_close ?? record.close)
            }))
            .filter((point: PriceDataPoint) => !isNaN(point.close))
          setFullBenchmarkData(benchmarkData)
        }

        // Calculate PE
        let peRatio: number | undefined
        if (finRes.status === 'fulfilled' && finRes.value?.financials && currentPrice) {
          const financials = finRes.value.financials
          if (financials.length >= 4) {
            const ttmEps = financials.slice(0, 4).reduce((sum: number, f: any) => sum + (parseFloat(f.eps_diluted) || 0), 0)
            if (ttmEps !== 0) peRatio = currentPrice / ttmEps
          }
        }

        // Isolate Meta
        let allTimeHigh: number | undefined
        let fiftyTwoWeekHigh: number | undefined
        if (metaRes.status === 'fulfilled' && metaRes.value?.success) {
          allTimeHigh = metaRes.value.all_time_high ? parseFloat(metaRes.value.all_time_high) : undefined
          fiftyTwoWeekHigh = metaRes.value.fifty_two_week_high ? parseFloat(metaRes.value.fifty_two_week_high) : undefined
        }

        if (currentPrice !== undefined && historicalData.length > 0) {
          const historicalDataForBetaSharpe = historicalData.slice(-dataLimitForBetaSharpe)
          const dataForSeasonality = fullHistoricalData.length > 0 ? fullHistoricalData : historicalData

          const calculatedMetrics = calculateAllMetrics(
            currentPrice,
            historicalData, 
            asset.assetType,
            benchmarkData.length > 0 ? benchmarkData : undefined,
            effectiveRiskFreeRates,
            historicalDataForBetaSharpe,
            undefined,
            dataForSeasonality
          )

          const { calculateMaxDrawdown } = await import('@/lib/asset-screener/metrics-calculations')
          const dataForMaxDD = fullHistoricalData.length > 0 ? fullHistoricalData : historicalData
          let maxDD: number | null = null

          if (dataForMaxDD.length > 0) {
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

            if (filteredData.length > 0) {
              maxDD = calculateMaxDrawdown(filteredData)
            }
          }

          setMaxDrawdown(maxDD)
          setMetrics({
            currentPrice,
            peRatio,
            allTimeHigh,
            fiftyTwoWeekHigh,
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
        <TabsTrigger value="analysis">Analysis</TabsTrigger>
        <TabsTrigger value="dca-simulator">DCA Simulation</TabsTrigger>
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
                  {Number(metrics.peRatio).toFixed(2)}
                </CardTitle>
              </CardHeader>
            </Card>
          )}

          {metrics?.allTimeHigh !== undefined && (
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>All-Time High</CardDescription>
                <CardTitle className="text-lg">
                  {formatCurrency(metrics.allTimeHigh, asset.currency, 2)}
                </CardTitle>
              </CardHeader>
            </Card>
          )}

          {metrics?.fiftyTwoWeekHigh !== undefined && (
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>52-Week High</CardDescription>
                <CardTitle className="text-lg">
                  {formatCurrency(metrics.fiftyTwoWeekHigh, asset.currency, 2)}
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

        <RiskMetricsDisplay
          assetType={asset.assetType}
          historicalData={fullHistoricalDataForMaxDD.length > 0 ? fullHistoricalDataForMaxDD : []}
          benchmarkData={fullBenchmarkData}
          riskFreeRates={effectiveRiskFreeRates}
        />
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

      <TabsContent value="analysis" className="space-y-4">
        <AssetAnalysisTab symbol={asset.symbol} />
      </TabsContent>

      <TabsContent value="dca-simulator" className="space-y-4">
        <DCASimulator 
          asset={asset} 
          historicalData={fullHistoricalDataForMaxDD.length > 0 ? fullHistoricalDataForMaxDD : []} 
        />
      </TabsContent>
    </Tabs>
  )
}

