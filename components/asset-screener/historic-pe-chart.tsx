"use client"

import { useState, useEffect, useMemo } from "react"
import { useTheme } from "next-themes"
import { Loader2, ChevronDown } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
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
import type { PriceDataPoint } from "@/lib/asset-screener/metrics-calculations"
import { getThemeColors } from "@/lib/charts/theme-colors"

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

interface HistoricPEChartProps {
  asset: TrackedAsset
}

interface PEDataPoint {
  date: string
  peRatio: number
  price: number
  eps: number
}

export function HistoricPEChart({ asset }: HistoricPEChartProps) {
  const { theme } = useTheme()
  const colors = getThemeColors()
  const [loading, setLoading] = useState(false)
  const [peData, setPeData] = useState<PEDataPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [accordionValue, setAccordionValue] = useState<string>('')

  // Only load data when accordion is opened for the first time
  useEffect(() => {
    if (accordionValue === 'pe-chart' && !hasLoaded && asset.assetType === 'pk-equity') {
      loadHistoricPE()
      setHasLoaded(true)
    }
  }, [accordionValue, hasLoaded, asset.assetType])

  const loadHistoricPE = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch historical price data (all available)
      let historicalDataUrl = ''
      if (asset.assetType === 'pk-equity') {
        historicalDataUrl = `/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(asset.symbol)}&market=PSX`
      } else {
        setError('Historic P/E chart is only available for PK equities')
        setLoading(false)
        return
      }

      // Fetch financial data (quarterly)
      const financialsUrl = `/api/financials?symbol=${asset.symbol}&period=quarterly`

      const [priceResponse, financialsResponse] = await Promise.all([
        fetch(historicalDataUrl),
        fetch(financialsUrl)
      ])

      if (!priceResponse.ok || !financialsResponse.ok) {
        throw new Error('Failed to fetch data')
      }

      const priceData = await priceResponse.json()
      const financialsData = await financialsResponse.json()

      const historicalPrices: PriceDataPoint[] = priceData.data?.map((record: any) => ({
        date: record.date,
        close: parseFloat(record.close)
      })).filter((point: PriceDataPoint) => !isNaN(point.close))
        .sort((a: PriceDataPoint, b: PriceDataPoint) => a.date.localeCompare(b.date)) || []

      const financials = financialsData.financials || []

      if (financials.length === 0) {
        setError('No financial data available')
        setLoading(false)
        return
      }

      // Calculate P/E ratio for each financial period
      // For quarterly data, we'll calculate TTM P/E by using the last 4 quarters
      const calculatedPE: PEDataPoint[] = []
      
      // Sort financials by date (oldest first)
      const sortedFinancials = [...financials].sort((a, b) => 
        new Date(a.period_end_date).getTime() - new Date(b.period_end_date).getTime()
      )

      // For each financial period, find the closest price date
      // We'll use a rolling 4-quarter window for TTM EPS
      for (let i = 3; i < sortedFinancials.length; i++) {
        const quarters = sortedFinancials.slice(i - 3, i + 1) // Last 4 quarters
        const periodEndDate = sortedFinancials[i].period_end_date
        
        // Calculate TTM EPS (sum of last 4 quarters)
        const ttmEps = quarters.reduce((sum, q) => {
          const eps = parseFloat(q.eps_diluted) || 0
          return sum + eps
        }, 0)

        if (ttmEps <= 0) continue

        // Find price on or after the period end date
        const periodDate = new Date(periodEndDate)
        let closestPrice: PriceDataPoint | null = null
        let minDaysDiff = Infinity

        for (const pricePoint of historicalPrices) {
          const priceDate = new Date(pricePoint.date)
          if (priceDate >= periodDate) {
            const daysDiff = Math.abs((priceDate.getTime() - periodDate.getTime()) / (1000 * 60 * 60 * 24))
            if (daysDiff < minDaysDiff) {
              minDaysDiff = daysDiff
              closestPrice = pricePoint
            }
          }
        }

        // Also check for prices before the period end date (within 30 days)
        if (!closestPrice) {
          for (const pricePoint of historicalPrices) {
            const priceDate = new Date(pricePoint.date)
            const daysDiff = Math.abs((priceDate.getTime() - periodDate.getTime()) / (1000 * 60 * 60 * 24))
            if (daysDiff < 30 && daysDiff < minDaysDiff) {
              minDaysDiff = daysDiff
              closestPrice = pricePoint
            }
          }
        }

        if (closestPrice && closestPrice.close > 0) {
          const peRatio = closestPrice.close / ttmEps
          calculatedPE.push({
            date: periodEndDate,
            peRatio,
            price: closestPrice.close,
            eps: ttmEps
          })
        }
      }

      // Sort by date
      calculatedPE.sort((a, b) => a.date.localeCompare(b.date))
      setPeData(calculatedPE)

    } catch (err: any) {
      console.error('Error loading historic P/E data:', err)
      setError(err.message || 'Failed to load historic P/E data')
    } finally {
      setLoading(false)
    }
  }

  const chartData = useMemo(() => {
    if (peData.length === 0) return null

    const labels = peData.map(d => {
      const date = new Date(d.date)
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
    })

    return {
      labels,
      datasets: [
        {
          label: 'P/E Ratio',
          data: peData.map(d => d.peRatio),
          borderColor: colors.price,
          backgroundColor: colors.price + '20',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 5,
        }
      ]
    }
  }, [peData, colors])

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: colors.foreground,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: (context: any) => {
            const index = context.dataIndex
            const dataPoint = peData[index]
            return [
              `P/E Ratio: ${dataPoint.peRatio.toFixed(2)}x`,
              `Price: ${dataPoint.price.toFixed(2)}`,
              `TTM EPS: ${dataPoint.eps.toFixed(2)}`
            ]
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: colors.grid,
        },
        ticks: {
          color: colors.foreground,
          maxRotation: 45,
          minRotation: 45,
        }
      },
      y: {
        grid: {
          color: colors.grid,
        },
        ticks: {
          color: colors.foreground,
          callback: function(value: any) {
            return value + 'x'
          }
        },
        title: {
          display: true,
          text: 'P/E Ratio',
          color: colors.foreground
        }
      }
    }
  }), [peData, colors])

  // Only show for PK equities
  if (asset.assetType !== 'pk-equity') {
    return null
  }

  return (
    <Accordion type="single" collapsible className="w-full" value={accordionValue} onValueChange={setAccordionValue}>
      <AccordionItem value="pe-chart" className="border rounded-lg">
        <AccordionTrigger className="px-6 py-4 hover:no-underline">
          <div className="flex items-center gap-2">
            <ChevronDown className="h-4 w-4 transition-transform" />
            <CardTitle className="text-lg">Historic P/E Ratio</CardTitle>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <Card className="border-0 shadow-none">
            <CardContent className="pt-4">
              {loading && (
                <div className="flex items-center justify-center h-[400px]">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}

              {error && !loading && (
                <div className="flex items-center justify-center h-[400px]">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              {!loading && !error && peData.length === 0 && (
                <div className="flex items-center justify-center h-[400px]">
                  <p className="text-sm text-muted-foreground">No P/E ratio data available</p>
                </div>
              )}

              {!loading && !error && chartData && (
                <div className="h-[400px] w-full">
                  <Line data={chartData} options={chartOptions} />
                </div>
              )}

              {!loading && !error && peData.length > 0 && (
                <CardDescription className="mt-4 text-xs">
                  P/E Ratio calculated using TTM (Trailing Twelve Months) EPS and closing price on or near the period end date.
                </CardDescription>
              )}
            </CardContent>
          </Card>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

