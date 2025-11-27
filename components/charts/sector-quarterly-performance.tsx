"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface QuarterPerformance {
  quarter: string
  startDate: string
  endDate: string
  isOngoing: boolean
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

  // Load sectors on mount
  useEffect(() => {
    loadSectors()
    setCurrentYear(new Date().getFullYear())
  }, [])

  // Load data when sector or year changes
  useEffect(() => {
    if (selectedSector) {
      loadData()
    } else {
      setData([])
      setTotalStocksInSector(null)
    }
  }, [selectedSector, year])

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

      const response = await fetch('/api/screener/stocks', {
        headers: { 'Cache-Control': 'max-age=86400' },
      })
      if (!response.ok) throw new Error('Failed to fetch sectors')
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
      console.error("Failed to load sectors:", err)
    } finally {
      setLoadingSectors(false)
    }
  }

  const loadData = async () => {
    if (!selectedSector) return

    try {
      setLoadingData(true)
      setError(null)
      setNoDataMessage(null)

      const params = new URLSearchParams()
      params.append('sector', selectedSector)
      params.append('year', year.toString())

      const response = await fetch(`/api/sector-performance/quarterly?${params.toString()}`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = await response.json()

      if (result.success) {
        setData(result.quarters || [])
        if (result.message && (!result.quarters || result.quarters.length === 0)) {
          setNoDataMessage(result.message)
        }
      } else {
        throw new Error(result.error || 'Failed to load data')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load sector performance data')
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setLoadingData(false)
    }
  }

  const loadStockDetails = async () => {
    if (!selectedSector) return

    try {
      setLoadingStockDetails(true)
      const params = new URLSearchParams()
      params.append('sector', selectedSector)
      params.append('year', year.toString())
      // Dividends disabled for now in main view, so disabled here too for consistency
      params.append('includeDividends', 'false')

      const response = await fetch(`/api/sector-performance/quarterly/stocks?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch stock details')

      const result = await response.json()
      if (result.success && result.quarters) {
        setStockDetails(result.quarters)
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setLoadingStockDetails(false)
    }
  }

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) return 'N/A'
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  const getReturnColor = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) return 'text-muted-foreground'
    return value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
  }

  const formatMarketCap = (value: number) => {
    if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  // Format quarter as date range
  const formatQuarterAsDateRange = (quarter: string, startDate: string, endDate: string): string => {
    try {
      const start = new Date(startDate)
      const end = new Date(endDate)

      const startDay = start.getDate()
      const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
      const startYear = start.getFullYear()

      const endDay = end.getDate()
      const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
      const endYear = end.getFullYear()

      // Format: "Jan 1 - Mar 31, 2025" or "Jan 1, 2025 - Mar 31, 2025" if different years
      if (startYear === endYear) {
        return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${startYear}`
      } else {
        return `${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`
      }
    } catch (error) {
      // Fallback to quarter label if date parsing fails
      return quarter
    }
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>

          {/* Content */}
          {!selectedSector ? (
            <div className="flex items-center justify-center h-[300px] border rounded-lg bg-muted/10">
              <p className="text-muted-foreground">Select a sector to view performance</p>
            </div>
          ) : loadingData ? (
            <div className="flex items-center justify-center h-[300px] border rounded-lg bg-muted/10">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p>Loading data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-[300px] border rounded-lg bg-muted/10">
              <div className="text-center text-muted-foreground">
                <p className="font-medium">Error loading data</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] border rounded-lg bg-muted/10">
              <div className="text-center text-muted-foreground">
                <p className="font-medium">No performance data found for {selectedSector} in {year}</p>
                {noDataMessage && <p className="text-sm mt-1">{noDataMessage}</p>}
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quarter</TableHead>
                      <TableHead className="text-center">Sector Return</TableHead>
                      <TableHead className="text-center">KSE100 Return</TableHead>
                      <TableHead className="text-center">Outperformance</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row) => (
                      <TableRow key={row.quarter}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{row.quarter}</span>
                            {row.isOngoing && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                                ONGOING
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground font-normal mt-0.5">
                            {formatQuarterAsDateRange(row.quarter, row.startDate, row.endDate)}
                          </div>
                        </TableCell>
                        <TableCell className={`text-center font-semibold ${getReturnColor(row.sectorReturn)}`}>
                          {formatPercent(row.sectorReturn)}
                        </TableCell>
                        <TableCell className={`text-center font-semibold ${getReturnColor(row.kse100Return)}`}>
                          {formatPercent(row.kse100Return)}
                        </TableCell>
                        <TableCell className={`text-center font-semibold ${getReturnColor(row.outperformance)}`}>
                          {formatPercent(row.outperformance)}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.outperformed ? (
                            <div className="flex items-center justify-center gap-1 text-green-600 dark:text-green-400">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-xs">Outperformed</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1 text-red-600 dark:text-red-400">
                              <XCircle className="h-4 w-4" />
                              <span className="text-xs">Underperformed</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Summary & Details */}
              <div className="flex items-center justify-between pt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {data.length} quarters for {selectedSector}
                </div>

                <Dialog open={stockDetailsOpen} onOpenChange={(open) => {
                  setStockDetailsOpen(open)
                  if (open) loadStockDetails()
                }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <List className="h-4 w-4" />
                      View Stock Details
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Stock Performance Details</DialogTitle>
                      <DialogDescription>
                        Breakdown by stock for {selectedSector} in {year}
                      </DialogDescription>
                    </DialogHeader>

                    {loadingStockDetails ? (
                      <div className="flex justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : stockDetails.length === 0 ? (
                      <div className="text-center p-8 text-muted-foreground">
                        No detailed data available
                      </div>
                    ) : (
                      <Tabs defaultValue={stockDetails[0]?.quarter} className="w-full">
                        <TabsList className="grid w-full grid-cols-4 mb-4">
                          {stockDetails.map(q => (
                            <TabsTrigger key={q.quarter} value={q.quarter}>{q.quarter}</TabsTrigger>
                          ))}
                        </TabsList>
                        {stockDetails.map(q => (
                          <TabsContent key={q.quarter} value={q.quarter}>
                            <div className="border rounded-lg overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Symbol</TableHead>
                                    <TableHead className="text-right">Market Cap</TableHead>
                                    <TableHead className="text-right">Weight</TableHead>
                                    <TableHead className="text-right">Return</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {q.stocks.map(stock => (
                                    <TableRow key={stock.symbol}>
                                      <TableCell className="font-medium">
                                        {stock.symbol}
                                        {stock.name && <div className="text-xs text-muted-foreground">{stock.name}</div>}
                                      </TableCell>
                                      <TableCell className="text-right font-mono">{formatMarketCap(stock.marketCap)}</TableCell>
                                      <TableCell className="text-right font-mono">{stock.weight.toFixed(2)}%</TableCell>
                                      <TableCell className={`text-right font-mono font-semibold ${getReturnColor(stock.return)}`}>
                                        {formatPercent(stock.return)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TabsContent>
                        ))}
                      </Tabs>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

