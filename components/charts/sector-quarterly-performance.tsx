"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle2, XCircle, List } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useTheme } from "next-themes"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface QuarterPerformance {
  quarter: string
  startDate: string
  endDate: string
  sectorReturn: number
  kse100Return: number
  outperformance: number
  outperformed: boolean
}

interface StockQuarterDetail {
  symbol: string
  name?: string
  marketCap: number
  weight: number
  startPrice: number | null
  endPrice: number | null
  return: number | null
}

interface QuarterStockDetails {
  quarter: string
  startDate: string
  endDate: string
  stocks: StockQuarterDetail[]
  totalMarketCap: number
}


export function SectorQuarterlyPerformance() {
  const { theme } = useTheme()
  const { toast } = useToast()
  const [loadingSectors, setLoadingSectors] = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sectors, setSectors] = useState<string[]>([])
  const [selectedSector, setSelectedSector] = useState<string>("")
  const [data, setData] = useState<QuarterPerformance[]>([])
  const [totalStocksInSector, setTotalStocksInSector] = useState<number | null>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [includeDividends, setIncludeDividends] = useState(false)
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [stockDetailsOpen, setStockDetailsOpen] = useState(false)
  const [loadingStockDetails, setLoadingStockDetails] = useState(false)
  const [stockDetails, setStockDetails] = useState<QuarterStockDetails[]>([])
  const [noDataMessage, setNoDataMessage] = useState<string | null>(null)

  // Generate years list (last 10 years)
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i)

  // Load sectors on mount (cached)
  useEffect(() => {
    loadSectors()
    setCurrentYear(new Date().getFullYear())
  }, [])

  // Load data when sector, year, or dividend setting changes
  useEffect(() => {
    if (selectedSector) {
      loadData()
    } else {
      setData([])
      setTotalStocksInSector(null)
    }
  }, [selectedSector, year, includeDividends])

  // Fetch total stocks count for the sector (separate effect for better performance)
  useEffect(() => {
    if (!selectedSector) {
      setTotalStocksInSector(null)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    // Fetch with cache (24 hours)
    fetch(`/api/advance-decline/stocks?sector=${encodeURIComponent(selectedSector)}&limit=10000`, {
      signal: controller.signal,
      headers: {
            'Cache-Control': 'max-age=86400', // 24 hours
          },
    })
      .then(res => res.ok ? res.json() : null)
      .then(result => {
        if (!cancelled && result?.success && result?.stocks) {
          setTotalStocksInSector(result.stocks.length)
        }
      })
      .catch(() => {
        // Silently fail - not critical
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [selectedSector])

  const loadSectors = async () => {
    try {
      setLoadingSectors(true)
      setError(null)

      // Fetch from API (API handles caching)
      const response = await fetch('/api/screener/stocks', {
        headers: {
          'Cache-Control': 'max-age=86400', // 24 hours
        },
      })
      if (!response.ok) {
        throw new Error('Failed to fetch sectors')
      }

      const result = await response.json()
      if (result.success && result.stocks) {
        const uniqueSectors = Array.from(
          new Set(
            result.stocks
              .map((stock: any) => stock.sector)
              .filter((sector: string | null) => sector && sector !== 'Unknown')
          )
        ).sort() as string[]

        setSectors(uniqueSectors)
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load sectors'
      setError(errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setLoadingSectors(false)
    }
  }

  const loadData = async () => {
    if (!selectedSector) {
      setData([])
      return
    }

    try {
      console.log('🔍 [Sector Quarterly Performance] Loading data:', {
        sector: selectedSector,
        year,
        includeDividends,
      })

      setLoadingData(true)
      setError(null)

      const params = new URLSearchParams()
      params.append('sector', selectedSector)
      params.append('year', year.toString())
      params.append('includeDividends', includeDividends.toString())

      const url = `/api/sector-performance/quarterly?${params.toString()}`
      console.log('📡 [Sector Quarterly Performance] Fetching from:', url)

      // API handles caching server-side
      const response = await fetch(url, {
        headers: {
          'Cache-Control': 'max-age=3600', // 1 hour
        },
      })

      console.log('📥 [Sector Quarterly Performance] Response status:', response.status, response.ok)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        console.error('❌ [Sector Quarterly Performance] Error response:', errorData)
        throw new Error(errorData.error || errorData.details || 'Failed to fetch sector performance data')
      }

      const result = await response.json()
      console.log('📊 [Sector Quarterly Performance] API Response:', {
        success: result.success,
        quartersCount: result.quarters?.length || 0,
        stockCount: result.stockCount,
        message: result.message,
        cached: result.cached,
        quarters: result.quarters,
      })

      if (!result.success || !result.quarters) {
        console.error('❌ [Sector Quarterly Performance] Invalid response format:', result)
        throw new Error('Invalid response format')
      }

      console.log('✅ [Sector Quarterly Performance] Setting data:', result.quarters.length, 'quarters')
      setData(result.quarters)
      
      // Show message if no data and message is provided (as info, not error)
      if (result.quarters.length === 0 && result.message) {
        console.warn('⚠️ [Sector Quarterly Performance] No data available:', result.message)
        console.warn('⚠️ [Sector Quarterly Performance] Stock count:', result.stockCount)
        setNoDataMessage(result.message)
        setError(null) // Clear error state
      } else {
        setNoDataMessage(null)
        setError(null)
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load sector performance data'
      setError(errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setLoadingData(false)
    }
  }


  // Format percentage
  const formatPercent = (value: number | null | undefined): string => {
    if (value === null || value === undefined || isNaN(value)) {
      return 'N/A'
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  // Get color for return value
  const getReturnColor = (value: number | null | undefined): string => {
    if (value === null || value === undefined || isNaN(value)) {
      return 'text-muted-foreground'
    }
    return value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
  }

  // Load stock details when dialog opens
  const loadStockDetails = async () => {
    if (!selectedSector) return

    try {
      setLoadingStockDetails(true)
      const params = new URLSearchParams()
      params.append('sector', selectedSector)
      params.append('year', year.toString())
      params.append('includeDividends', includeDividends.toString())

      const response = await fetch(`/api/sector-performance/quarterly/stocks?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch stock details')
      }

      const result = await response.json()
      if (result.success && result.quarters) {
        setStockDetails(result.quarters)
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || 'Failed to load stock details',
        variant: "destructive",
      })
    } finally {
      setLoadingStockDetails(false)
    }
  }

  // Format market cap
  const formatMarketCap = (value: number): string => {
    if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  // Format price
  const formatPrice = (value: number | null): string => {
    if (value === null || isNaN(value)) return 'N/A'
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sector Quarterly Performance</CardTitle>
          <CardDescription>
            Quarter-wise performance of each sector compared to KSE100
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sector">Sector</Label>
              {loadingSectors ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading sectors...
                </div>
              ) : (
                <Select value={selectedSector} onValueChange={setSelectedSector}>
                  <SelectTrigger id="sector">
                    <SelectValue placeholder="Select a sector" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectors.map(sector => (
                      <SelectItem key={sector} value={sector}>
                        {sector}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Select value={year.toString()} onValueChange={(value) => setYear(parseInt(value, 10))} disabled={!selectedSector}>
                <SelectTrigger id="year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dividends" className="flex items-center justify-between">
                <span>Include Dividends</span>
                <Switch
                  id="dividends"
                  checked={includeDividends}
                  onCheckedChange={setIncludeDividends}
                  disabled={!selectedSector}
                />
              </Label>
              <p className="text-xs text-muted-foreground">
                {includeDividends
                  ? 'Returns include dividend reinvestment'
                  : 'Returns are price-only (no dividends)'}
              </p>
            </div>
          </div>

          {/* Table */}
          {!selectedSector ? (
            <div className="flex items-center justify-center h-[400px] border rounded-lg bg-muted/10">
              <div className="text-center text-muted-foreground">
                <p className="text-lg font-medium">Select a sector to view performance</p>
                <p className="text-sm mt-2">Choose a sector from the dropdown above</p>
              </div>
            </div>
          ) : loadingData ? (
            <div className="flex items-center justify-center h-[400px] border rounded-lg bg-muted/10">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p>Loading sector performance data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-[400px] border rounded-lg bg-destructive/10">
              <div className="text-center text-destructive">
                <p className="font-medium">Error loading data</p>
                <p className="text-sm mt-2">{error}</p>
              </div>
            </div>
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center h-[400px] border rounded-lg bg-muted/10">
              <div className="text-center text-muted-foreground">
                <p className="font-medium">No data available for {selectedSector} in {year}</p>
                {noDataMessage && (
                  <p className="text-sm mt-2 text-muted-foreground/80">{noDataMessage}</p>
                )}
                <p className="text-xs mt-4 text-muted-foreground/60">
                  This may be because:
                  <br />• No price data is available for this sector in {year}
                  <br />• The year selected is in the future or has incomplete data
                  <br />• Try selecting a different year
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[150px]">Quarter</TableHead>
                    <TableHead className="text-center min-w-[120px]">Sector Return</TableHead>
                    <TableHead className="text-center min-w-[120px]">KSE100 Return</TableHead>
                    <TableHead className="text-center min-w-[120px]">Outperformance</TableHead>
                    <TableHead className="text-center min-w-[100px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((quarterData) => (
                    <TableRow key={quarterData.quarter}>
                      <TableCell className="font-medium">
                        {quarterData.quarter}
                      </TableCell>
                      <TableCell className={`text-center font-semibold ${getReturnColor(quarterData.sectorReturn)}`}>
                        {formatPercent(quarterData.sectorReturn)}
                      </TableCell>
                      <TableCell className={`text-center font-semibold ${getReturnColor(quarterData.kse100Return)}`}>
                        {formatPercent(quarterData.kse100Return)}
                      </TableCell>
                      <TableCell className={`text-center font-semibold ${getReturnColor(quarterData.outperformance)}`}>
                        {formatPercent(quarterData.outperformance)}
                      </TableCell>
                      <TableCell className="text-center">
                        {quarterData.outperformed ? (
                          <div className="flex items-center justify-center gap-1">
                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span className="text-xs text-green-600 dark:text-green-400">Outperformed</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                            <span className="text-xs text-red-600 dark:text-red-400">Underperformed</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Summary Stats */}
          {!loadingData && !error && selectedSector && data.length > 0 && (
            <div className="space-y-4 pt-4 border-t">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Selected Sector</div>
                  <div className="text-2xl font-bold mt-1">{selectedSector}</div>
                  {totalStocksInSector !== null && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {totalStocksInSector} stocks in sector
                    </div>
                  )}
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Quarters Analyzed</div>
                  <div className="text-2xl font-bold mt-1">{data.length}</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Dividend Adjustment</div>
                  <div className="text-2xl font-bold mt-1">
                    {includeDividends ? 'Enabled' : 'Disabled'}
                  </div>
                </div>
              </div>
              
              {/* Dialog to view stocks */}
              <Dialog open={stockDetailsOpen} onOpenChange={(open) => {
                setStockDetailsOpen(open)
                if (open) {
                  loadStockDetails()
                }
              }}>
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div className="flex-1">
                  <p className="text-sm font-medium">View Stocks in Sector</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    See all stocks included in the {selectedSector} sector performance calculation
                    {totalStocksInSector !== null && ` (${totalStocksInSector} stocks)`}
                  </p>
                </div>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="flex items-center gap-2">
                  <List className="h-4 w-4" />
                  View Stocks
                    </Button>
                  </DialogTrigger>
                </div>
                <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Stocks in {selectedSector} Sector</DialogTitle>
                    <DialogDescription>
                      Detailed quarter-wise performance breakdown for each stock
                    </DialogDescription>
                  </DialogHeader>
                  {loadingStockDetails ? (
                    <div className="flex items-center justify-center h-[400px]">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <p>Loading stock details...</p>
                      </div>
                    </div>
                  ) : stockDetails.length === 0 ? (
                    <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                      <p>No stock details available</p>
                    </div>
                  ) : (
                    <Tabs defaultValue={stockDetails[0]?.quarter} className="w-full">
                      <TabsList className="grid w-full grid-cols-4">
                        {stockDetails.map((quarter) => (
                          <TabsTrigger key={quarter.quarter} value={quarter.quarter}>
                            {quarter.quarter}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                      {stockDetails.map((quarter) => (
                        <TabsContent key={quarter.quarter} value={quarter.quarter} className="mt-4">
                          <div className="space-y-4">
                            <div className="text-sm text-muted-foreground">
                              Period: {new Date(quarter.startDate).toLocaleDateString()} - {new Date(quarter.endDate).toLocaleDateString()}
                            </div>
                            <div className="overflow-x-auto border rounded-lg">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Symbol</TableHead>
                                    <TableHead className="text-right">Market Cap</TableHead>
                                    <TableHead className="text-right">Weight</TableHead>
                                    <TableHead className="text-right">Start Price</TableHead>
                                    <TableHead className="text-right">End Price</TableHead>
                                    <TableHead className="text-right">Return</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {quarter.stocks.map((stock) => (
                                    <TableRow key={stock.symbol}>
                                      <TableCell className="font-medium">
                                        <div>
                                          <div>{stock.symbol}</div>
                                          {stock.name && stock.name !== stock.symbol && (
                                            <div className="text-xs text-muted-foreground">{stock.name}</div>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right font-mono">
                                        {formatMarketCap(stock.marketCap)}
                                      </TableCell>
                                      <TableCell className="text-right font-mono">
                                        {stock.weight.toFixed(2)}%
                                      </TableCell>
                                      <TableCell className="text-right font-mono">
                                        {formatPrice(stock.startPrice)}
                                      </TableCell>
                                      <TableCell className="text-right font-mono">
                                        {formatPrice(stock.endPrice)}
                                      </TableCell>
                                      <TableCell className={`text-right font-mono font-semibold ${getReturnColor(stock.return)}`}>
                                        {formatPercent(stock.return)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
              </div>
                        </TabsContent>
                      ))}
                    </Tabs>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

