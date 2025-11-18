"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, Settings2, Info, AlertTriangle, Calculator } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PriceChart } from "./price-chart"
import { SummaryPanel } from "./summary-panel"
import { EthBtcProperChart } from "./eth-btc-proper-chart"
import { SValChart } from "./s-val-chart"
import { SRelChart } from "./s-rel-chart"
import { RiskEqChart } from "./risk-eq-chart"
import { HeatMapChart } from "./heat-map-chart"
import { ThemeToggle } from "./theme-toggle"
import { InverseRiskCalculator } from "./inverse-risk-calculator"
import { type RiskMetrics, type RiskWeights } from "@/lib/eth-analysis"
import {
  DEFAULT_FAIR_VALUE_BAND_PARAMS,
  DEFAULT_RISK_WEIGHTS,
  RISK_THRESHOLDS,
  S_VAL_CUTOFF_CONFIG,
} from "@/lib/config/app.config"
import { METRIC_NAMES, METRIC_LABELS } from "@/lib/config/metric-names.config"

export function EthRiskDashboard() {
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [bandParams, setBandParams] = useState(DEFAULT_FAIR_VALUE_BAND_PARAMS)

  const [sValCutoffDate, setSValCutoffDate] = useState<string>("")
  const [hoveredDatePrice, setHoveredDatePrice] = useState<Date | null>(null) // For ETH/USD and S_val pair
  const [hoveredDateBtc, setHoveredDateBtc] = useState<Date | null>(null) // For ETH/BTC and S_rel pair
  const [riskWeights, setRiskWeights] = useState<RiskWeights>(DEFAULT_RISK_WEIGHTS)

  // Default S_val cutoff to last date of 2024 in data
  const [defaultCutoffDate, setDefaultCutoffDate] = useState<string>("")

  // Prevent duplicate API calls
  const fetchInProgressRef = useRef(false)
  const requestIdRef = useRef(0)
  const apiCallLogRef = useRef<Array<{ id: number; timestamp: string; action: string; params?: string }>>([])

  const logApiCall = (action: string, params?: string) => {
    const id = ++requestIdRef.current
    const timestamp = new Date().toISOString()
    const logEntry = { id, timestamp, action, params }
    apiCallLogRef.current.push(logEntry)
    
    // Keep only last 50 entries
    if (apiCallLogRef.current.length > 50) {
      apiCallLogRef.current.shift()
    }
    
    // Log to console
    console.log(`[API Call #${id}] ${timestamp} - ${action}`, params ? `Params: ${params.substring(0, 100)}...` : '')
    
    // Also log to window for easy access
    if (typeof window !== 'undefined') {
      (window as any).__apiCallLog = apiCallLogRef.current
      // Helper function to view logs
      ;(window as any).getApiCallLog = () => {
        console.table(apiCallLogRef.current)
        return apiCallLogRef.current
      }
      ;(window as any).clearApiCallLog = () => {
        apiCallLogRef.current = []
        requestIdRef.current = 0
        console.log('API call log cleared')
      }
    }
  }

  const fetchData = async () => {
    // Prevent duplicate calls
    if (fetchInProgressRef.current) {
      logApiCall('BLOCKED - Request already in progress')
      return
    }

    try {
      fetchInProgressRef.current = true
      setLoading(true)
      setError(null)

      // Determine cutoff date: use user input if provided, otherwise use default (last date of 2024)
      const cutoffDate = sValCutoffDate || defaultCutoffDate ? new Date(sValCutoffDate || defaultCutoffDate) : null
      
      // Build API request URL with parameters
      const params = new URLSearchParams()
      params.set('bandParams', JSON.stringify(bandParams))
      if (cutoffDate) {
        params.set('cutoffDate', cutoffDate.toISOString())
      }
      params.set('riskWeights', JSON.stringify(riskWeights))

      const requestUrl = `/api/risk-metrics?${params}`
      logApiCall('STARTING', requestUrl)

      // Add timeout wrapper (3 minute timeout - increased for first load)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Request timeout: Data fetching took too long. This may happen on first load when fetching historical data from Binance.")), 180000)
      })
      
      const startTime = Date.now()
      
      // Call API route instead of direct calculation
      const response = await Promise.race([
        fetch(requestUrl),
        timeoutPromise,
      ])

      const fetchTime = Date.now() - startTime
      const cacheStatus = response.headers.get('X-Cache')
      logApiCall(`COMPLETED in ${fetchTime}ms`, `Cache: ${cacheStatus || 'unknown'}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      // Deserialize dates from ISO strings back to Date objects
      const metrics: RiskMetrics = {
        ...data,
        dates: data.dates.map((dateStr: string) => new Date(dateStr)),
        currentState: {
          ...data.currentState,
        },
      }

      // Set default cutoff date to last date of configured year if not already set
      if (!defaultCutoffDate && metrics.dates.length > 0) {
        const datesInYear = metrics.dates.filter((d) => d.getFullYear() === S_VAL_CUTOFF_CONFIG.defaultYear)
        if (datesInYear.length > 0) {
          const lastDateInYear = datesInYear[datesInYear.length - 1]
          setDefaultCutoffDate(lastDateInYear.toISOString().split("T")[0])
          if (!sValCutoffDate) {
            setSValCutoffDate(lastDateInYear.toISOString().split("T")[0])
          }
        }
      }

      setRiskMetrics(metrics)
      logApiCall('SUCCESS - Data loaded')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch data"
      logApiCall(`ERROR - ${errorMessage}`)
      setError(errorMessage)
    } finally {
      fetchInProgressRef.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    logApiCall('COMPONENT MOUNTED - useEffect triggered')
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleParameterUpdate = () => {
    fetchData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <div className="space-y-2">
            <p className="text-lg font-medium">Loading Ethereum Risk Dashboard</p>
            <p className="text-sm text-muted-foreground">
              Loading risk metrics...
            </p>
            <p className="text-xs text-muted-foreground">
              First load: Fetching ~3,500 historical records from Binance API
            </p>
            <p className="text-xs text-muted-foreground">
              This may take 30-90 seconds. Subsequent loads will be much faster (cached).
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Error Loading Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button onClick={fetchData} className="w-full">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!riskMetrics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">No data available</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6 md:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 pb-2 border-b">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">Ethereum Risk Dashboard</h1>
          <p className="text-muted-foreground text-xs sm:text-sm md:text-base">
            Real-time risk metrics and valuation analysis by Stack Them Gains
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <ThemeToggle />
          <Button onClick={fetchData} disabled={loading} variant="outline" size="sm" className="flex-1 sm:flex-initial">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="risk" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList className="flex flex-wrap w-full max-w-4xl gap-1">
            <TabsTrigger value="risk" className="text-xs sm:text-sm flex-1 min-w-[120px]">Risk Analysis</TabsTrigger>
            <TabsTrigger value="price-valuation" className="text-xs sm:text-sm flex-1 min-w-[120px]">Price & Valuation</TabsTrigger>
            <TabsTrigger value="relative" className="text-xs sm:text-sm flex-1 min-w-[120px]">Relative Risk to Bitcoin</TabsTrigger>
            <TabsTrigger value="heatmap" className="text-xs sm:text-sm flex-1 min-w-[120px]">Heat Map</TabsTrigger>
            <TabsTrigger value="inverse-calculator" className="text-xs sm:text-sm flex-1 min-w-[120px]">
              <Calculator className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Inverse Calculator</span>
              <span className="sm:hidden">Calculator</span>
            </TabsTrigger>
            <TabsTrigger value="parameters" className="text-xs sm:text-sm flex-1 min-w-[120px]">
              <Settings2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Parameters</span>
              <span className="sm:hidden">Params</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Risk Analysis Tab - Default */}
        <TabsContent value="risk" className="space-y-4">
          <SummaryPanel riskMetrics={riskMetrics} />
          <RiskEqChart riskMetrics={riskMetrics} hoveredDate={hoveredDatePrice} onHoverDate={setHoveredDatePrice} />
          <PriceChart riskMetrics={riskMetrics} hoveredDate={hoveredDatePrice} onHoverDate={setHoveredDatePrice} />
        </TabsContent>

        {/* Price & Valuation Tab - Grouped together */}
        <TabsContent value="price-valuation" className="space-y-4">
          <PriceChart riskMetrics={riskMetrics} hoveredDate={hoveredDatePrice} onHoverDate={setHoveredDatePrice} />
          <SValChart
            riskMetrics={riskMetrics}
            hoveredDate={hoveredDatePrice}
            onHoverDate={setHoveredDatePrice}
            cutoffDate={sValCutoffDate}
            onCutoffDateChange={setSValCutoffDate}
            onRecalculate={handleParameterUpdate}
          />
        </TabsContent>

        {/* Relative Risk to Bitcoin Tab - ETH/BTC and S_rel grouped together */}
        <TabsContent value="relative" className="space-y-4">
          <EthBtcProperChart riskMetrics={riskMetrics} hoveredDate={hoveredDateBtc} onHoverDate={setHoveredDateBtc} />
          <SRelChart riskMetrics={riskMetrics} hoveredDate={hoveredDateBtc} onHoverDate={setHoveredDateBtc} />
        </TabsContent>

        {/* Heat Map Tab */}
        <TabsContent value="heatmap" className="space-y-4">
          <HeatMapChart riskMetrics={riskMetrics} hoveredDate={hoveredDatePrice} onHoverDate={setHoveredDatePrice} />
        </TabsContent>

        {/* Inverse Risk Calculator Tab */}
        <TabsContent value="inverse-calculator" className="space-y-4">
          <InverseRiskCalculator
            riskMetrics={riskMetrics}
            bandParams={bandParams}
            sValCutoffDate={sValCutoffDate ? new Date(sValCutoffDate) : null}
            riskWeights={riskWeights}
          />
        </TabsContent>

        <TabsContent value="parameters" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Fair Value Band Parameters</CardTitle>
              <CardDescription>
                Adjust the parametric log-regression model parameters (Pine script style). Default values are configured in lib/config/app.config.ts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="basePrice">Base Price ($)</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          The foundational price point in the log-regression formula. Used as the base for calculating fair value: ln(fairValue) = ln(basePrice) + baseCoeff + growthCoeff × ln(years)
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="basePrice"
                    type="number"
                    step="0.01"
                    value={bandParams.basePrice}
                    onChange={(e) =>
                      setBandParams((prev) => ({ ...prev, basePrice: Number.parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="baseCoeff">Base Coefficient</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Core coefficient in the log-regression model that influences the starting point and overall scale of the logarithmic curve. Affects the intercept of the fair value trendline.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="baseCoeff"
                    type="number"
                    step="0.01"
                    value={bandParams.baseCoeff}
                    onChange={(e) =>
                      setBandParams((prev) => ({ ...prev, baseCoeff: Number.parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="growthCoeff">Growth Coefficient</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Determines the rate of growth in the log-regression model. Multiplied by ln(years) to control how the fair value increases over time. Higher values = steeper growth curve.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="growthCoeff"
                    type="number"
                    step="0.01"
                    value={bandParams.growthCoeff}
                    onChange={(e) =>
                      setBandParams((prev) => ({ ...prev, growthCoeff: Number.parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="startYear">Start Year</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          The reference year for calculating "years since start" in the log-regression formula. Combined with Start Month/Day to establish the time origin for the model.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="startYear"
                    type="number"
                    value={bandParams.startYear}
                    onChange={(e) =>
                      setBandParams((prev) => ({ ...prev, startYear: Number.parseInt(e.target.value) || 2014 }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="startMonth">Start Month</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          The month (1-12) within the Start Year that defines the time origin. Used with Start Year and Start Day to calculate years since start for the regression.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="startMonth"
                    type="number"
                    min="1"
                    max="12"
                    value={bandParams.startMonth}
                    onChange={(e) =>
                      setBandParams((prev) => ({ ...prev, startMonth: Number.parseInt(e.target.value) || 12 }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="startDay">Start Day</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          The day of the month that completes the time origin. Together with Start Year and Start Month, this defines the exact reference point for calculating years in the model.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="startDay"
                    type="number"
                    min="1"
                    max="31"
                    value={bandParams.startDay}
                    onChange={(e) =>
                      setBandParams((prev) => ({ ...prev, startDay: Number.parseInt(e.target.value) || 3 }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="mainMult">Main Multiplier</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Multiplier applied to the calculated fair value from the log-regression. Scales the entire fair value trendline. Default is 1.0 (no scaling).
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="mainMult"
                    type="number"
                    step="0.01"
                    value={bandParams.mainMult}
                    onChange={(e) =>
                      setBandParams((prev) => ({ ...prev, mainMult: Number.parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="upperMult">Upper Multiplier</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Multiplier used to calculate the upper ±1σ band. Applied to the regression price to create the upper parametric band. Higher values = wider bands above fair value.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="upperMult"
                    type="number"
                    step="0.01"
                    value={bandParams.upperMult}
                    onChange={(e) =>
                      setBandParams((prev) => ({ ...prev, upperMult: Number.parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="lowerMult">Lower Multiplier</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Multiplier used to calculate the lower ±1σ band. Applied to the regression price to create the lower parametric band. Lower values = wider bands below fair value.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="lowerMult"
                    type="number"
                    step="0.01"
                    value={bandParams.lowerMult}
                    onChange={(e) =>
                      setBandParams((prev) => ({ ...prev, lowerMult: Number.parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>
              <div className="pt-4 flex flex-col sm:flex-row gap-2">
                <Button onClick={handleParameterUpdate} className="flex-1">
                  <span className="hidden sm:inline">Update Parameters & Recalculate</span>
                  <span className="sm:hidden">Update & Recalculate</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setBandParams(DEFAULT_FAIR_VALUE_BAND_PARAMS)
                  }}
                >
                  Reset to Defaults
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{METRIC_NAMES.riskEq.short} Weights</CardTitle>
              <CardDescription>
                Adjust the weights for {METRIC_NAMES.riskEq.long} calculation. Default values are configured in lib/config/app.config.ts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sValWeight">{METRIC_NAMES.sVal.short} Weight</Label>
                  <Input
                    id="sValWeight"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={riskWeights.sValWeight}
                    onChange={(e) =>
                      setRiskWeights((prev) => ({
                        ...prev,
                        sValWeight: Number.parseFloat(e.target.value) || 0.5,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Weight for {METRIC_NAMES.sVal.short} in {METRIC_NAMES.riskEq.short} calculation (default: {DEFAULT_RISK_WEIGHTS.sValWeight})
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sRelWeight">{METRIC_NAMES.sRel.short} Weight</Label>
                  <Input
                    id="sRelWeight"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={riskWeights.sRelWeight}
                    onChange={(e) =>
                      setRiskWeights((prev) => ({
                        ...prev,
                        sRelWeight: Number.parseFloat(e.target.value) || 0.5,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Weight for {METRIC_NAMES.sRel.short} in {METRIC_NAMES.riskEq.short} calculation (default: {DEFAULT_RISK_WEIGHTS.sRelWeight})
                  </p>
                </div>
              </div>
              <div className="pt-4 flex flex-col sm:flex-row gap-2">
                <Button onClick={handleParameterUpdate} className="flex-1">
                  <span className="hidden sm:inline">Update Weights & Recalculate</span>
                  <span className="sm:hidden">Update & Recalculate</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRiskWeights(DEFAULT_RISK_WEIGHTS)
                  }}
                >
                  Reset to Defaults
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
