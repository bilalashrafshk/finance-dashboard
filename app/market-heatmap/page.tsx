"use client"

import { useState, useEffect, useRef, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { SharedNavbar } from "@/components/shared-navbar"
import { MarketHeatmapTreemap, type MarketHeatmapStock, type SizeMode } from "@/components/market-heatmap/treemap"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, Calendar, Info, Filter } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { getTodayInMarketTimezone } from "@/lib/portfolio/market-hours"

function MarketHeatmapPageContent() {
  const searchParams = useSearchParams()
  const [stocks, setStocks] = useState<MarketHeatmapStock[]>([])
  const [allStocks, setAllStocks] = useState<MarketHeatmapStock[]>([]) // Store all stocks for filtering
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [selectedSector, setSelectedSector] = useState<string>("all")
  const [sizeMode, setSizeMode] = useState<SizeMode>('marketCap')
  // Significantly increase default height for better readability
  const [treemapSize, setTreemapSize] = useState({ width: 1200, height: 1200 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Check if a date is a weekend
  const isWeekend = (dateString: string): boolean => {
    const date = new Date(dateString)
    const day = date.getDay()
    return day === 0 || day === 6 // 0 = Sunday, 6 = Saturday
  }

  // Get the previous weekday if the selected date is a weekend
  const getPreviousWeekday = (dateString: string): string => {
    const date = new Date(dateString)
    while (isWeekend(dateString)) {
      date.setDate(date.getDate() - 1)
      dateString = date.toISOString().split('T')[0]
    }
    return dateString
  }

  // Initialize with date from query params, or today's date, or last working day if today is weekend
  useEffect(() => {
    const dateFromQuery = searchParams.get('date')
    if (dateFromQuery) {
      setSelectedDate(dateFromQuery)
    } else {
      const today = getTodayInMarketTimezone('PSX')
      const dateToSet = isWeekend(today) ? getPreviousWeekday(today) : today
      setSelectedDate(dateToSet)
    }
  }, [searchParams])

  // Update treemap size on window resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const container = containerRef.current
        const containerRect = container.getBoundingClientRect()
        const width = containerRect.width - 32 // Account for padding (16px on each side)
        
        // Calculate required height based on stock count to ensure readability
        // 100 stocks need more space than 10. Let's aim for a minimum box size of roughly 80x80px on average
        // Total area needed approx = num_stocks * 6400 pixels
        const estimatedAreaPerStock = 100 * 80; 
        const stockCount = stocks.length || 100;
        const minTotalArea = stockCount * estimatedAreaPerStock;
        
        // Height = Area / Width
        // But ensure a healthy minimum height regardless of width
        const calculatedHeight = Math.max(800, minTotalArea / width);
        const height = Math.max(calculatedHeight, containerRect.height - 32); 
        
        setTreemapSize({ width, height })
      }
    }

    // Wait for DOM to be ready, then calculate
    const timeoutId = setTimeout(() => {
      updateSize()
    }, 100)

    // Update on resize with debounce
    let resizeTimeout: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(updateSize, 100)
    }
    
    window.addEventListener('resize', handleResize)
    
    // Also update when container size changes (e.g., when stats appear/disappear)
    const resizeObserver = new ResizeObserver(() => {
      updateSize()
    })
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', handleResize)
      clearTimeout(resizeTimeout)
      resizeObserver.disconnect()
    }
  }, [stocks.length, loading]) // Recalculate when stocks load or loading state changes

  // Fetch market heatmap data
  useEffect(() => {
    if (!selectedDate) return

    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/market-heatmap?date=${selectedDate}&limit=100`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch market heatmap data')
        }

        if (data.success) {
          setAllStocks(data.stocks || [])
        } else {
          throw new Error(data.error || 'Failed to fetch market heatmap data')
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load market heatmap data')
        setAllStocks([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [selectedDate])

  // Filter stocks by sector
  useEffect(() => {
    if (selectedSector === 'all') {
      setStocks(allStocks)
    } else {
      setStocks(allStocks.filter(stock => stock.sector === selectedSector))
    }
  }, [allStocks, selectedSector])

  // Get unique sectors from all stocks
  const uniqueSectors = Array.from(new Set(allStocks.map(s => s.sector).filter(Boolean))).sort()

  // Get min and max dates for date input
  const today = getTodayInMarketTimezone('PSX')
  const minDate = "2020-01-01" // Reasonable minimum date
  const maxDate = today

  // Handle date change with weekend validation
  const handleDateChange = (newDate: string) => {
    if (isWeekend(newDate)) {
      // If weekend selected, move to previous weekday
      const previousWeekday = getPreviousWeekday(newDate)
      setSelectedDate(previousWeekday)
      setError('Weekends are not trading days. Showing previous weekday.')
      setTimeout(() => setError(null), 3000)
    } else {
      setSelectedDate(newDate)
      setError(null)
    }
  }

  // Calculate statistics
  const stats = {
    total: stocks.length,
    increased: stocks.filter(s => s.changePercent !== null && s.changePercent > 0).length,
    decreased: stocks.filter(s => s.changePercent !== null && s.changePercent < 0).length,
    unchanged: stocks.filter(s => s.changePercent === null || s.changePercent === 0).length,
    avgChange: stocks.length > 0
      ? stocks
          .filter(s => s.changePercent !== null)
          .reduce((sum, s) => sum + (s.changePercent || 0), 0) / stocks.filter(s => s.changePercent !== null).length
      : 0,
  }

  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main className="container mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Market Heatmap</h1>
          <p className="text-muted-foreground">
            Visual representation of top 100 PK equities by market cap. Box size represents market cap, color indicates price change.
          </p>
        </div>

        {/* Date Selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Date Selection</CardTitle>
            <CardDescription className="text-xs">Select a date to view market performance</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="date-selector" className="text-sm">Trading Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="date-selector"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    min={minDate}
                    max={maxDate}
                    className="pl-10"
                    onKeyDown={(e) => {
                      // Prevent manual entry of weekend dates
                      if (e.key === 'Enter') {
                        const input = e.target as HTMLInputElement
                        if (input.value && isWeekend(input.value)) {
                          e.preventDefault()
                          handleDateChange(input.value)
                        }
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Note: Weekend dates will automatically adjust to the previous weekday
                </p>
              </div>
              <Button
                onClick={() => {
                  const dateToSet = isWeekend(today) ? getPreviousWeekday(today) : today
                  setSelectedDate(dateToSet)
                }}
                variant="outline"
                size="sm"
              >
                Today
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sector Filter */}
        {!loading && allStocks.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Filter by Sector</CardTitle>
              <CardDescription className="text-xs">Select a sector to filter stocks</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Select value={selectedSector} onValueChange={setSelectedSector}>
                <SelectTrigger className="w-full sm:w-[300px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="All Sectors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sectors ({allStocks.length})</SelectItem>
                  {uniqueSectors.map((sector) => {
                    const count = allStocks.filter(s => s.sector === sector).length
                    return (
                      <SelectItem key={sector} value={sector}>
                        {sector} ({count})
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Statistics */}
        {!loading && stocks.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Total Stocks</div>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground text-green-600 dark:text-green-400">Increased</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.increased}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground text-red-600 dark:text-red-400">Decreased</div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.decreased}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Unchanged</div>
                <div className="text-2xl font-bold">{stats.unchanged}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Avg Change</div>
                <div className={`text-2xl font-bold ${stats.avgChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {stats.avgChange >= 0 ? '+' : ''}{stats.avgChange.toFixed(2)}%
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Treemap Visualization */}
        <Card className="flex flex-col" style={{ height: 'calc(100vh - 150px)', minHeight: '800px' }}>
          <CardHeader className="pb-3 flex-shrink-0">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Market Heatmap</CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Hover over boxes to see details. Box size = {sizeMode === 'marketCap' ? 'Market Cap' : 'Market Cap Change'}, Color = Price Change
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-green-500"></div>
                    <span>Increase</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-red-500"></div>
                    <span>Decrease</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Size represents:</Label>
                <ToggleGroup
                  type="single"
                  value={sizeMode}
                  onValueChange={(value) => {
                    if (value === 'marketCap' || value === 'marketCapChange') {
                      setSizeMode(value)
                    }
                  }}
                  variant="outline"
                  className="bg-background"
                >
                  <ToggleGroupItem value="marketCap" aria-label="Market Cap" className="px-4 py-1.5 text-xs">
                    Market Cap
                  </ToggleGroupItem>
                  <ToggleGroupItem value="marketCapChange" aria-label="Market Cap Change" className="px-4 py-1.5 text-xs">
                    Market Cap Change
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-4" style={{ overflow: 'auto' }}>
            {loading ? (
              <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : stocks.length === 0 ? (
              <div className="flex items-center justify-center h-96 text-muted-foreground">
                <div className="text-center">
                  <p className="mb-2">No data available for the selected date</p>
                  <p className="text-sm">Try selecting a different date</p>
                </div>
              </div>
            ) : (
              <div
                ref={containerRef}
                className="w-full h-full border rounded-lg p-4 bg-muted/20"
                style={{ 
                  // Allow container to grow large enough to support readability
                  minHeight: '500px',
                  overflow: 'auto',
                  display: 'block' // Ensure block context for scrolling
                }}
              >
                <MarketHeatmapTreemap
                  stocks={stocks}
                  width={Math.max(treemapSize.width, 800)} // Enforce minimum width
                  height={treemapSize.height}
                  sizeMode={sizeMode}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">How to Read the Heatmap</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Box Size:</strong> Represents market capitalization. Larger boxes = larger market cap.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Color:</strong> Indicates price change from previous trading day. Green = increase, Red = decrease. Darker shades = larger percentage changes.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <strong>Interaction:</strong> Hover over any box to see detailed information including symbol, price, change percentage, and market cap.
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default function MarketHeatmapPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background">
        <SharedNavbar />
        <main className="container mx-auto p-4 sm:p-6">
          <div className="flex items-center justify-center h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      </div>
    }>
      <MarketHeatmapPageContent />
    </Suspense>
  )
}
