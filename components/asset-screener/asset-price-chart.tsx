"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useTheme } from "next-themes"
import { Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Line } from "react-chartjs-2"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js"
import type { TrackedAsset } from "./add-asset-dialog"
import type { PriceDataPoint } from "@/lib/asset-screener/metrics-calculations"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"
import Link from "next/link"
import { useVideoMode } from "@/hooks/use-video-mode"
import { VideoModeToggle } from "@/components/ui/video-mode-toggle"
import { getThemeColors } from "@/lib/charts/theme-colors"
import { createAssetPriceYAxisScaleConfig } from "@/lib/charts/portfolio-chart-utils"
import {
  calculateDividendAdjustedPrices,
  normalizeToPercentage,
  normalizeOriginalPricesToPercentage,
  type DividendRecord
} from "@/lib/asset-screener/dividend-adjusted-prices"

ChartJS.register(
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

type ChartPeriod = '1M' | '3M' | '6M' | '1Y' | '2Y' | '5Y' | 'ALL'

interface AssetPriceChartProps {
  asset: TrackedAsset
}

export function AssetPriceChart({ asset }: AssetPriceChartProps) {
  const { theme } = useTheme()
  const { isVideoMode, toggleVideoMode, containerClassName } = useVideoMode()
  const colors = useMemo(() => getThemeColors(), [theme])
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1Y')
  const [showComparison, setShowComparison] = useState(false)
  const [showTotalReturn, setShowTotalReturn] = useState(false)
  const [useLogScale, setUseLogScale] = useState(false)
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<{
    labels: string[]
    datasets: Array<{
      label: string
      data: number[]
      borderColor: string
      backgroundColor: string
      fill: boolean
      borderDash?: number[]
    }>
  } | null>(null)

  // Show comparison for PK equities (KSE100) and US equities (SPX500)
  const canShowComparison = asset.assetType === 'pk-equity' || asset.assetType === 'us-equity'
  const canShowTotalReturn = asset.assetType === 'pk-equity'
  const comparisonIndex = asset.assetType === 'pk-equity' ? 'KSE100' : asset.assetType === 'us-equity' ? 'SPX500' : null

  // Handle comparison toggle - auto-enable total return for PK equity
  const handleComparisonChange = (checked: boolean) => {
    if (checked && asset.assetType === 'pk-equity' && canShowTotalReturn) {
      // Auto-enable total return when comparison is enabled for PK equities
      setShowTotalReturn(true)
      toast({
        title: "Total Return Enabled",
        description: "KSE100 is dividend-adjusted. Total return (dividend-adjusted) has been enabled for accurate comparison.",
        variant: "default",
      })
    }
    setShowComparison(checked)
  }

  useEffect(() => {
    const loadChartData = async () => {
      setLoading(true)
      try {
        // Determine data limit based on period
        const periodLimits: Record<ChartPeriod, number> = {
          '1M': 30,
          '3M': 90,
          '6M': 180,
          '1Y': 252,
          '2Y': 504,
          '5Y': 1260,
          'ALL': 10000, // Large number for all data
        }
        const limit = periodLimits[chartPeriod]

        // Fetch historical data for the asset
        let historicalDataUrl = ''

        if (asset.assetType === 'crypto') {
          const { parseSymbolToBinance } = await import('@/lib/portfolio/binance-api')
          const binanceSymbol = parseSymbolToBinance(asset.symbol)
          historicalDataUrl = `/api/historical-data?assetType=crypto&symbol=${encodeURIComponent(binanceSymbol)}&limit=${limit}`
        } else if (asset.assetType === 'pk-equity') {
          historicalDataUrl = `/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(asset.symbol)}&market=PSX&limit=${limit}`
        } else if (asset.assetType === 'us-equity') {
          historicalDataUrl = `/api/historical-data?assetType=us-equity&symbol=${encodeURIComponent(asset.symbol)}&market=US&limit=${limit}`
        } else if (asset.assetType === 'metals') {
          historicalDataUrl = `/api/historical-data?assetType=metals&symbol=${encodeURIComponent(asset.symbol)}&limit=${limit}`
        } else if (asset.assetType === 'kse100' || asset.assetType === 'spx500') {
          const apiAssetType = asset.assetType === 'kse100' ? 'kse100' : 'spx500'
          historicalDataUrl = `/api/historical-data?assetType=${apiAssetType}&symbol=${encodeURIComponent(asset.symbol)}&limit=${limit}`
        }

        // Fetch asset data
        const assetResponse = await fetch(historicalDataUrl)
        let assetData: PriceDataPoint[] = []

        if (assetResponse.ok) {
          const responseData = await assetResponse.json()

          // Handle client-side fetch requirement
          if (responseData.needsClientFetch && responseData.instrumentId) {
            const { fetchInvestingHistoricalDataClient } = await import('@/lib/portfolio/investing-client-api')
            // Fetch data based on limit/period
            // For simplicity, fetch last 5 years if period is long, or 1 year if short
            const startDate = '2015-01-01'
            const endDate = new Date().toISOString().split('T')[0]

            const clientData = await fetchInvestingHistoricalDataClient(
              responseData.instrumentId,
              startDate,
              endDate
            )

            if (clientData && clientData.length > 0) {
              // Store in DB
              try {
                await fetch('/api/historical-data/store', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    assetType: asset.assetType,
                    symbol: asset.symbol,
                    data: clientData,
                    source: 'investing',
                  }),
                })
              } catch (e) {
                console.error("Failed to store client data", e)
              }

              assetData = clientData.map(d => ({
                date: d.date,
                close: d.close
              })).sort((a, b) => a.date.localeCompare(b.date))
            }
          } else if (responseData.data && Array.isArray(responseData.data)) {
            assetData = responseData.data
              .map((record: any) => ({
                date: record.date,
                close: parseFloat(record.close)
              }))
              .filter((point: PriceDataPoint) => !isNaN(point.close))
              .sort((a: PriceDataPoint, b: PriceDataPoint) => a.date.localeCompare(b.date))
          }
        }

        if (assetData.length === 0) {
          setChartData(null)
          setLoading(false)
          return
        }

        // Filter by period
        const now = new Date()
        const periodCutoffs: Record<ChartPeriod, Date> = {
          '1M': new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
          '3M': new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()),
          '6M': new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()),
          '1Y': new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
          '2Y': new Date(now.getFullYear() - 2, now.getMonth(), now.getDate()),
          '5Y': new Date(now.getFullYear() - 5, now.getMonth(), now.getDate()),
          'ALL': new Date(0),
        }

        const cutoffDate = periodCutoffs[chartPeriod]
        const filteredAssetData = assetData.filter((point: PriceDataPoint) => {
          const pointDate = new Date(point.date)
          return pointDate >= cutoffDate
        })

        // Fetch dividend data if total return is enabled and asset is PK equity
        let dividendData: DividendRecord[] = []
        if (showTotalReturn && canShowTotalReturn) {
          try {
            const dividendResponse = await fetch(`/api/pk-equity/dividend?ticker=${encodeURIComponent(asset.symbol)}`)
            if (dividendResponse.ok) {
              const dividendResponseData = await dividendResponse.json()
              if (dividendResponseData.dividends && Array.isArray(dividendResponseData.dividends)) {
                dividendData = dividendResponseData.dividends.map((d: any) => ({
                  date: d.date,
                  dividend_amount: d.dividend_amount
                }))
              }
            }
          } catch (error) {
            console.error('Error fetching dividend data:', error)
          }
        }

        // Fetch comparison index data (KSE100 for PK equities, SPX500 for US equities)
        let comparisonData: PriceDataPoint[] = []
        if (showComparison && canShowComparison && comparisonIndex) {
          const comparisonAssetType = asset.assetType === 'pk-equity' ? 'kse100' : 'spx500'
          const comparisonSymbol = comparisonIndex
          const comparisonResponse = await fetch(`/api/historical-data?assetType=${comparisonAssetType}&symbol=${comparisonSymbol}&limit=${limit}`)
          if (comparisonResponse.ok) {
            const comparisonResponseData = await comparisonResponse.json()
            if (comparisonResponseData.data && Array.isArray(comparisonResponseData.data)) {
              comparisonData = comparisonResponseData.data
                .map((record: any) => ({
                  date: record.date,
                  close: parseFloat(record.close)
                }))
                .filter((point: PriceDataPoint) => !isNaN(point.close))
                .sort((a: PriceDataPoint, b: PriceDataPoint) => a.date.localeCompare(b.date))
                .filter((point: PriceDataPoint) => {
                  const pointDate = new Date(point.date)
                  return pointDate >= cutoffDate
                })
            }
          }
        }

        // Calculate dividend-adjusted prices if total return is enabled
        let adjustedPriceData: PriceDataPoint[] = []
        if (showTotalReturn && canShowTotalReturn && dividendData.length > 0) {
          const adjustedPoints = calculateDividendAdjustedPrices(filteredAssetData, dividendData)
          adjustedPriceData = normalizeToPercentage(adjustedPoints)
        }

        // Normalize original prices to percentage if total return is enabled
        let normalizedOriginalPrices: PriceDataPoint[] = []
        if (showTotalReturn && canShowTotalReturn) {
          normalizedOriginalPrices = normalizeOriginalPricesToPercentage(filteredAssetData)
        }

        // Align dates for comparison
        let alignedDates: string[] = []
        let alignedAssetPrices: number[] = []
        let alignedAdjustedPrices: number[] = []
        let alignedComparisonPrices: number[] = []

        // Handle case when both total return and comparison are enabled
        if (showTotalReturn && canShowTotalReturn && adjustedPriceData.length > 0 && showComparison && comparisonData.length > 0) {
          // Both total return and comparison enabled
          const adjustedMap = new Map<string, number>()
          adjustedPriceData.forEach((point: PriceDataPoint) => {
            adjustedMap.set(point.date, point.close)
          })

          const comparisonMap = new Map<string, number>()
          comparisonData.forEach((point: PriceDataPoint) => {
            comparisonMap.set(point.date, point.close)
          })

          // Find common dates between adjusted prices and comparison
          const commonDates = new Set<string>()
          adjustedMap.forEach((_, date) => {
            if (comparisonMap.has(date)) {
              commonDates.add(date)
            }
          })

          alignedDates = Array.from(commonDates).sort()
          alignedAdjustedPrices = alignedDates.map(date => adjustedMap.get(date) || 100)

          // Normalize comparison to percentage change from start
          const comparisonStart = comparisonMap.get(alignedDates[0]) || 1
          alignedComparisonPrices = alignedDates.map(date => {
            const price = comparisonMap.get(date) || comparisonStart
            return (price / comparisonStart) * 100
          })
        } else if (showTotalReturn && canShowTotalReturn && adjustedPriceData.length > 0) {
          // When total return is enabled, use normalized prices
          alignedDates = normalizedOriginalPrices.map((point: PriceDataPoint) => point.date)
          alignedAssetPrices = normalizedOriginalPrices.map((point: PriceDataPoint) => point.close)

          // Align adjusted prices to same dates
          const adjustedMap = new Map<string, number>()
          adjustedPriceData.forEach((point: PriceDataPoint) => {
            adjustedMap.set(point.date, point.close)
          })
          alignedAdjustedPrices = alignedDates.map(date => adjustedMap.get(date) || 100)
        } else if (showComparison && comparisonData.length > 0) {
          // Create a map of dates to prices for both datasets
          const assetMap = new Map<string, number>()
          filteredAssetData.forEach((point: PriceDataPoint) => {
            assetMap.set(point.date, point.close)
          })

          const comparisonMap = new Map<string, number>()
          comparisonData.forEach((point: PriceDataPoint) => {
            comparisonMap.set(point.date, point.close)
          })

          // Find common dates
          const commonDates = new Set<string>()
          assetMap.forEach((_, date) => {
            if (comparisonMap.has(date)) {
              commonDates.add(date)
            }
          })

          alignedDates = Array.from(commonDates).sort()
          alignedAssetPrices = alignedDates.map(date => assetMap.get(date) || 0)

          // Normalize comparison to percentage change from start (for better comparison)
          const comparisonStart = comparisonMap.get(alignedDates[0]) || 1
          alignedComparisonPrices = alignedDates.map(date => {
            const price = comparisonMap.get(date) || comparisonStart
            return (price / comparisonStart) * 100
          })

          // Normalize asset prices to percentage change from start
          const assetStart = alignedAssetPrices[0] || 1
          alignedAssetPrices = alignedAssetPrices.map(price => (price / assetStart) * 100)
        } else {
          alignedDates = filteredAssetData.map((point: PriceDataPoint) => point.date)
          alignedAssetPrices = filteredAssetData.map((point: PriceDataPoint) => point.close)
        }

        // Create datasets
        const datasets: Array<{
          label: string
          data: number[]
          borderColor: string
          backgroundColor: string
          fill: boolean
          borderDash?: number[]
        }> = []

        // Add asset line(s)
        if (showTotalReturn && canShowTotalReturn && alignedAdjustedPrices.length > 0) {
          // When total return is enabled, show only the total return line
          datasets.push({
            label: `${asset.symbol} (Total Return)`,
            data: alignedAdjustedPrices,
            borderColor: '#10b981', // Green for total return
            backgroundColor: '#10b981' + '20',
            fill: true,
          })
        } else {
          // Normal price chart
          datasets.push({
            label: asset.symbol,
            data: alignedAssetPrices,
            borderColor: colors.price || '#3b82f6',
            backgroundColor: (colors.price || '#3b82f6') + '20',
            fill: true,
          })
        }

        // Add comparison index line if enabled (KSE100 for PK equities, SPX500 for US equities)
        if (showComparison && canShowComparison && alignedComparisonPrices.length > 0 && comparisonIndex) {
          datasets.push({
            label: `${comparisonIndex} Index`,
            data: alignedComparisonPrices,
            borderColor: '#a855f7', // Purple for comparison index
            backgroundColor: 'transparent',
            fill: false,
            borderDash: [5, 5], // Dashed line for comparison
          })
        }

        // Create chart data
        setChartData({
          labels: alignedDates.map(date => {
            const d = new Date(date)
            // Show year for periods that span multiple years (1Y, 2Y, 5Y, ALL)
            const showYear = chartPeriod === 'ALL' || chartPeriod === '1Y' || chartPeriod === '2Y' || chartPeriod === '5Y'
            return d.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: showYear ? 'numeric' : undefined
            })
          }),
          datasets,
        })
      } catch (error) {
        console.error('Error loading chart data:', error)
        setChartData(null)
      } finally {
        setLoading(false)
      }
    }

    loadChartData()
  }, [asset, chartPeriod, showComparison, showTotalReturn, canShowComparison, canShowTotalReturn, comparisonIndex, colors.price])

  const formatCurrency = (value: number, currency: string, decimals: number = 2): string => {
    if (isNaN(value)) return 'N/A'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value)
  }

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: (context: any) => {
            const value = context.parsed.y
            if ((showTotalReturn && canShowTotalReturn) || (showComparison && canShowComparison)) {
              return `${context.dataset.label}: ${value.toFixed(2)}%`
            }
            return `${context.dataset.label}: ${formatCurrency(value, asset.currency, asset.assetType === 'crypto' ? 4 : 2)}`
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: {
          display: false,
        },
      },
      y: createAssetPriceYAxisScaleConfig({
        useLogScale,
        isPercentage: (showTotalReturn && canShowTotalReturn) || (showComparison && canShowComparison),
        currency: asset.currency,
        assetType: asset.assetType,
        formatCurrency,
        theme,
      }),
    },
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
  }), [asset, showComparison, showTotalReturn, canShowComparison, canShowTotalReturn, theme, formatCurrency, useLogScale])

  return (
    <Card className={containerClassName}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Price Chart - {asset.symbol}</CardTitle>
            <CardDescription>
              {asset.name} ({asset.currency})
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            {canShowTotalReturn && (
              <div className="flex items-center gap-2">
                <Switch
                  id="total-return"
                  checked={showTotalReturn}
                  onCheckedChange={setShowTotalReturn}
                />
                <Label htmlFor="total-return" className="text-sm">
                  Account for Dividends
                </Label>
              </div>
            )}
            {canShowComparison && (
              <div className="flex items-center gap-2">
                <Switch
                  id="comparison"
                  checked={showComparison}
                  onCheckedChange={handleComparisonChange}
                />
                <Label htmlFor="comparison" className="text-sm">
                  Compare with {comparisonIndex}
                </Label>
              </div>
            )}
            <VideoModeToggle isVideoMode={isVideoMode} onToggle={toggleVideoMode} />
            <Select value={chartPeriod} onValueChange={(value) => setChartPeriod(value as ChartPeriod)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1M">1 Month</SelectItem>
                <SelectItem value="3M">3 Months</SelectItem>
                <SelectItem value="6M">6 Months</SelectItem>
                <SelectItem value="1Y">1 Year</SelectItem>
                <SelectItem value="2Y">2 Years</SelectItem>
                <SelectItem value="5Y">5 Years</SelectItem>
                <SelectItem value="ALL">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {showComparison && canShowComparison && !showTotalReturn && asset.assetType === 'pk-equity' && (
          <Alert className="mb-4">
            <AlertDescription>
              KSE100 is dividend-adjusted. For accurate comparison, consider using total return (dividend-adjusted).
            </AlertDescription>
          </Alert>
        )}
        <div className="flex gap-4">
          <div className="flex flex-col items-start gap-2 pt-2">
            <div className="flex items-center gap-2">
              <Switch
                id="log-scale"
                checked={useLogScale}
                onCheckedChange={setUseLogScale}
              />
              <Label htmlFor="log-scale" className="text-sm cursor-pointer whitespace-nowrap">
                Log Scale
              </Label>
            </div>
          </div>
          <div className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : chartData ? (
              <div className="h-[400px]">
                <Line data={chartData} options={chartOptions} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                Unable to load chart data
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

