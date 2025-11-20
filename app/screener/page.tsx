"use client"

import { useState, useEffect } from "react"
import { SharedNavbar } from "@/components/shared-navbar"
import { ValuationScatterChart } from "@/components/screener/valuation-scatter-chart"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Filter, Plus, AlertCircle, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/lib/auth/auth-context"
import { AddAssetDialog, type TrackedAsset } from "@/components/asset-screener/add-asset-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function ScreenerPage() {
  const { user, loading: authLoading } = useAuth()
  const [metrics, setMetrics] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [groupBy, setGroupBy] = useState<'sector' | 'industry'>('sector')
  
  // Filters for chart view
  const [minMarketCapChart, setMinMarketCapChart] = useState(0) // In Billions
  const [sectorFilter, setSectorFilter] = useState<string>("")
  
  // All stocks with price data (PK equities only)
  interface StockInfo {
    symbol: string
    name: string
    sector: string
    industry: string
  }
  interface StockWithMetrics extends StockInfo {
    price?: number
    pe_ratio?: number
    sector_pe?: number
    relative_pe?: number
    industry_pe?: number
    relative_pe_industry?: number
    dividend_yield?: number
    market_cap?: number
  }
  const [allStocks, setAllStocks] = useState<StockInfo[]>([])
  const [stocksWithMetrics, setStocksWithMetrics] = useState<StockWithMetrics[]>([])
  const [loadingStocks, setLoadingStocks] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [addingKSE100, setAddingKSE100] = useState(false)
  const [kse100Error, setKse100Error] = useState<string | null>(null)
  const [kse100Success, setKse100Success] = useState<string | null>(null)
  
  // Search, Sort, Filter states for stocks list
  const [searchQuery, setSearchQuery] = useState("")
  const [sortField, setSortField] = useState<keyof StockWithMetrics>("symbol")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [filterSector, setFilterSector] = useState<string>("all")
  const [filterIndustry, setFilterIndustry] = useState<string>("all")
  
  // Traditional screener filters for stocks list
  const [minPE, setMinPE] = useState<number | "">("")
  const [maxPE, setMaxPE] = useState<number | "">("")
  const [minRelativePE, setMinRelativePE] = useState<number | "">("")
  const [maxRelativePE, setMaxRelativePE] = useState<number | "">("")
  const [minMarketCap, setMinMarketCap] = useState<number>(0) // In Billions
  const [maxMarketCap, setMaxMarketCap] = useState<number | "">("")
  const [minPrice, setMinPrice] = useState<number | "">("")
  const [maxPrice, setMaxPrice] = useState<number | "">("")

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/screener/metrics')
        if (res.ok) {
            const data = await res.json()
            setMetrics(data.data || [])
        }
      } catch (e) {
        console.error("Failed to load screener metrics", e)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    loadAllStocks()
  }, [])

  // Merge stocks with metrics when both are loaded
  useEffect(() => {
    if (allStocks.length > 0 && metrics.length > 0) {
      const merged = allStocks.map(stock => {
        const metric = metrics.find(m => m.symbol === stock.symbol)
        if (!metric) {
          return { ...stock } as StockWithMetrics
        }
        // Convert string numbers to actual numbers (PostgreSQL may return strings)
        const convertToNumber = (val: any): number | undefined => {
          if (val === null || val === undefined) return undefined
          if (typeof val === 'number') return isNaN(val) ? undefined : val
          if (typeof val === 'string') {
            const parsed = parseFloat(val)
            return isNaN(parsed) ? undefined : parsed
          }
          return undefined
        }
        return {
          ...stock,
          price: convertToNumber(metric.price),
          pe_ratio: convertToNumber(metric.pe_ratio),
          sector_pe: convertToNumber(metric.sector_pe),
          relative_pe: convertToNumber(metric.relative_pe),
          industry_pe: convertToNumber(metric.industry_pe),
          relative_pe_industry: convertToNumber(metric.relative_pe_industry),
          dividend_yield: convertToNumber(metric.dividend_yield),
          market_cap: convertToNumber(metric.market_cap),
        } as StockWithMetrics
      })
      setStocksWithMetrics(merged)
    } else if (allStocks.length > 0) {
      // If metrics not loaded yet, just use stocks
      setStocksWithMetrics(allStocks.map(s => ({ ...s } as StockWithMetrics)))
    }
  }, [allStocks, metrics])

  const loadAllStocks = async () => {
    try {
      setLoadingStocks(true)
      const response = await fetch('/api/screener/stocks')

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setAllStocks(data.stocks || [])
        }
      }
    } catch (error) {
      console.error('Error loading stocks:', error)
      setAllStocks([])
    } finally {
      setLoadingStocks(false)
    }
  }

  const handleAddStock = async (assetData: Omit<TrackedAsset, 'id' | 'createdAt' | 'updatedAt'>) => {
    // Ensure it's a PK equity
    if (assetData.assetType !== 'pk-equity') {
      throw new Error('Only PK equities can be added to the screener')
    }

    // Check for duplicate symbol (case-insensitive)
    const symbolUpper = assetData.symbol.toUpperCase().trim()
    const existingStock = allStocks.find(
      stock => stock.symbol.toUpperCase() === symbolUpper
    )
    
    if (existingStock) {
      throw new Error(`Stock "${symbolUpper}" already exists in the database`)
    }

    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        throw new Error('Authentication required')
      }

      // Add to user tracked assets (for personal tracking)
      const response = await fetch('/api/user/tracked-assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(assetData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add stock')
      }

      // Reload all stocks to show the newly added one
      await loadAllStocks()
    } catch (error: any) {
      console.error('Error adding stock:', error)
      throw error
    }
  }

  const handleAddAllKSE100 = async () => {
    try {
      setAddingKSE100(true)
      setKse100Error(null)
      setKse100Success(null)

      const token = localStorage.getItem('auth_token')
      if (!token) {
        throw new Error('Authentication required')
      }

      const response = await fetch('/api/screener/add-kse100-stocks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add KSE100 stocks')
      }

      if (data.success) {
      setKse100Success(
        `Successfully added ${data.added} stocks. ${data.failed > 0 ? `${data.failed} failed.` : ''}`
      )
      // Reload all stocks to show newly added ones
      await loadAllStocks()
      }
    } catch (error: any) {
      console.error('Error adding KSE100 stocks:', error)
      setKse100Error(error.message || 'Failed to add KSE100 stocks')
    } finally {
      setAddingKSE100(false)
    }
  }
  
  const filteredMetrics = metrics.filter(m => {
      const groupName = groupBy === 'industry' ? (m.industry || m.sector) : m.sector
      const matchesGroup = sectorFilter ? groupName?.toLowerCase().includes(sectorFilter.toLowerCase()) : true
      // Assuming market_cap stored in raw rupees. 1 Billion = 1,000,000,000
      const matchesCap = (m.market_cap || 0) >= (minMarketCapChart * 1_000_000_000)
      return matchesGroup && matchesCap
  })

  // Get unique sectors and industries for filters
  const uniqueSectors = Array.from(new Set(allStocks.map(s => s.sector).filter(Boolean))).sort()
  const uniqueIndustries = Array.from(new Set(allStocks.map(s => s.industry).filter(Boolean))).sort()

  // Filter and sort stocks
  const filteredAndSortedStocks = stocksWithMetrics
    .filter(stock => {
      // Search filter
      const matchesSearch = searchQuery === "" || 
        stock.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        stock.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        stock.sector.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (stock.industry && stock.industry.toLowerCase().includes(searchQuery.toLowerCase()))
      
      // Sector filter
      const matchesSector = filterSector === "all" || stock.sector === filterSector
      
      // Industry filter
      const matchesIndustry = filterIndustry === "all" || stock.industry === filterIndustry
      
      // P/E Ratio filter
      const pe = typeof stock.pe_ratio === 'number' ? stock.pe_ratio : null
      const matchesPE = (minPE === "" || pe === null || pe >= minPE) && 
                        (maxPE === "" || pe === null || pe <= maxPE)
      
      // Relative P/E filter
      const relPE = typeof stock.relative_pe === 'number' ? stock.relative_pe : null
      const matchesRelativePE = (minRelativePE === "" || relPE === null || relPE >= minRelativePE) && 
                                (maxRelativePE === "" || relPE === null || relPE <= maxRelativePE)
      
      // Market Cap filter (in billions)
      const marketCapB = stock.market_cap ? stock.market_cap / 1_000_000_000 : 0
      const matchesMarketCap = marketCapB >= minMarketCap && 
                               (maxMarketCap === "" || marketCapB <= maxMarketCap)
      
      // Price filter
      const price = typeof stock.price === 'number' ? stock.price : null
      const matchesPrice = (minPrice === "" || price === null || price >= minPrice) && 
                          (maxPrice === "" || price === null || price <= maxPrice)
      
      return matchesSearch && matchesSector && matchesIndustry && matchesPE && 
             matchesRelativePE && matchesMarketCap && matchesPrice
    })
    .sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]
      
      // Handle null/undefined values
      if (aVal === null || aVal === undefined) aVal = sortDirection === "asc" ? Infinity : -Infinity
      if (bVal === null || bVal === undefined) bVal = sortDirection === "asc" ? Infinity : -Infinity
      
      // Handle string comparison
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal)
      }
      
      // Handle number comparison
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal
      }
      
      return 0
    })

  const handleSort = (field: keyof StockWithMetrics) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  const formatCurrency = (value: number | string | null | undefined) => {
    if (value === null || value === undefined) return "N/A"
    const numValue = typeof value === "string" ? parseFloat(value) : value
    if (isNaN(numValue)) return "N/A"
    if (numValue >= 1_000_000_000) {
      return `PKR ${(numValue / 1_000_000_000).toFixed(2)}B`
    } else if (numValue >= 1_000_000) {
      return `PKR ${(numValue / 1_000_000).toFixed(2)}M`
    } else if (numValue >= 1_000) {
      return `PKR ${(numValue / 1_000).toFixed(2)}K`
    }
    return `PKR ${numValue.toFixed(2)}`
  }

  const formatNumber = (value: number | string | null | undefined, decimals: number = 2) => {
    if (value === null || value === undefined) return "N/A"
    const numValue = typeof value === "string" ? parseFloat(value) : value
    if (isNaN(numValue)) return "N/A"
    return numValue.toFixed(decimals)
  }

  const SortButton = ({ field, children }: { field: keyof StockWithMetrics, children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {children}
      {sortField === field ? (
        sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  )

  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Value Hunter Screener</h1>
            <p className="text-muted-foreground">
                Find undervalued companies relative to their sector peers.
            </p>
        </div>

        <Tabs defaultValue="chart" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="chart">Valuation Chart</TabsTrigger>
            <TabsTrigger value="stocks">List of Stocks</TabsTrigger>
          </TabsList>

          <TabsContent value="chart" className="space-y-6">
            {/* Filter Controls */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col gap-6">
                        <div className="flex items-center gap-4">
                            <Label>Group By:</Label>
                            <ToggleGroup type="single" value={groupBy} onValueChange={(value) => value && setGroupBy(value as 'sector' | 'industry')}>
                                <ToggleGroupItem value="sector" aria-label="Sector">
                                    Sector
                                </ToggleGroupItem>
                                <ToggleGroupItem value="industry" aria-label="Industry">
                                    Industry
                                </ToggleGroupItem>
                            </ToggleGroup>
                        </div>
                        
                        <div className="flex flex-wrap gap-6 items-end">
                            <div className="space-y-2 w-full md:w-64">
                                <Label className="flex items-center gap-2">
                                    <Filter className="h-4 w-4" />
                                    Filter by {groupBy === 'industry' ? 'Industry' : 'Sector'}
                                </Label>
                                <Input 
                                    placeholder={groupBy === 'industry' ? "e.g. Oil & Gas, Banking..." : "e.g. Cement, Bank..."} 
                                    value={sectorFilter}
                                    onChange={(e) => setSectorFilter(e.target.value)}
                                />
                            </div>
                            
                            <div className="space-y-4 w-full md:w-64">
                                <Label>Min Market Cap: {minMarketCapChart} Billion PKR</Label>
                                <Slider 
                                    min={0} 
                                    max={100} 
                                    step={1} 
                                    value={[minMarketCapChart]} 
                                    onValueChange={(v) => setMinMarketCapChart(v[0])} 
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {loading ? (
              <div className="flex justify-center py-20">
                 <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid gap-6">
                 <ValuationScatterChart data={filteredMetrics} groupBy={groupBy} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="stocks" className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold">All PK Equities</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Showing {filteredAndSortedStocks.length} of {allStocks.length} stocks
                </p>
              </div>
              {user && (
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    onClick={handleAddAllKSE100}
                    disabled={addingKSE100}
                  >
                    {addingKSE100 ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Add All KSE100 Stocks
                      </>
                    )}
                  </Button>
                  <Button onClick={() => setIsAddDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Stock
                  </Button>
                </div>
              )}
            </div>

            {kse100Error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{kse100Error}</AlertDescription>
              </Alert>
            )}
            {kse100Success && (
              <Alert>
                <AlertDescription>{kse100Success}</AlertDescription>
              </Alert>
            )}

            {/* Search and Filter Controls */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-6">
                  {/* Search and Basic Filters */}
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                      <Label className="flex items-center gap-2 mb-2">
                        <Search className="h-4 w-4" />
                        Search
                      </Label>
                      <Input
                        placeholder="Search by symbol, name, sector, or industry..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="w-full md:w-48">
                      <Label className="mb-2 block">Filter by Sector</Label>
                      <Select value={filterSector} onValueChange={setFilterSector}>
                        <SelectTrigger>
                          <SelectValue placeholder="All Sectors" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sectors</SelectItem>
                          {uniqueSectors.map(sector => (
                            <SelectItem key={sector} value={sector}>{sector}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-full md:w-48">
                      <Label className="mb-2 block">Filter by Industry</Label>
                      <Select value={filterIndustry} onValueChange={setFilterIndustry}>
                        <SelectTrigger>
                          <SelectValue placeholder="All Industries" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Industries</SelectItem>
                          {uniqueIndustries.map(industry => (
                            <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Valuation Filters */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <Label className="mb-2 block">P/E Ratio</Label>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-12">Min:</span>
                            <Input
                              type="number"
                              placeholder="More than..."
                              value={minPE}
                              onChange={(e) => setMinPE(e.target.value === "" ? "" : parseFloat(e.target.value))}
                              className="flex-1"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-12">Max:</span>
                            <Input
                              type="number"
                              placeholder="Less than..."
                              value={maxPE}
                              onChange={(e) => setMaxPE(e.target.value === "" ? "" : parseFloat(e.target.value))}
                              className="flex-1"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label className="mb-2 block">Relative P/E</Label>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-12">Min:</span>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="More than..."
                              value={minRelativePE}
                              onChange={(e) => setMinRelativePE(e.target.value === "" ? "" : parseFloat(e.target.value))}
                              className="flex-1"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-12">Max:</span>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="Less than..."
                              value={maxRelativePE}
                              onChange={(e) => setMaxRelativePE(e.target.value === "" ? "" : parseFloat(e.target.value))}
                              className="flex-1"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label className="mb-2 block">Market Cap (Billion PKR)</Label>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-12">Min:</span>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="More than..."
                              value={minMarketCap}
                              onChange={(e) => setMinMarketCap(parseFloat(e.target.value) || 0)}
                              className="flex-1"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-12">Max:</span>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="Less than..."
                              value={maxMarketCap}
                              onChange={(e) => setMaxMarketCap(e.target.value === "" ? "" : parseFloat(e.target.value))}
                              className="flex-1"
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label className="mb-2 block">Price (PKR)</Label>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-12">Min:</span>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="More than..."
                              value={minPrice}
                              onChange={(e) => setMinPrice(e.target.value === "" ? "" : parseFloat(e.target.value))}
                              className="flex-1"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-12">Max:</span>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Less than..."
                              value={maxPrice}
                              onChange={(e) => setMaxPrice(e.target.value === "" ? "" : parseFloat(e.target.value))}
                              className="flex-1"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      💡 Tip: Leave Min empty for "less than" filter, or leave Max empty for "more than" filter
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {loadingStocks || loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : allStocks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground mb-4">
                    No stocks with price data found. Add stocks to get started.
                  </p>
                </CardContent>
              </Card>
            ) : filteredAndSortedStocks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground mb-4">
                    No stocks match your search criteria.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <SortButton field="symbol">Symbol</SortButton>
                          </TableHead>
                          <TableHead>
                            <SortButton field="name">Name</SortButton>
                          </TableHead>
                          <TableHead>
                            <SortButton field="sector">Sector</SortButton>
                          </TableHead>
                          <TableHead>
                            <SortButton field="industry">Industry</SortButton>
                          </TableHead>
                          <TableHead className="text-right">
                            <SortButton field="price">Price (PKR)</SortButton>
                          </TableHead>
                          <TableHead className="text-right">
                            <SortButton field="pe_ratio">P/E Ratio</SortButton>
                          </TableHead>
                          <TableHead className="text-right">
                            <SortButton field="relative_pe">Relative P/E</SortButton>
                          </TableHead>
                          <TableHead className="text-right">
                            <SortButton field="sector_pe">Sector P/E</SortButton>
                          </TableHead>
                          <TableHead className="text-right">
                            <SortButton field="market_cap">Market Cap</SortButton>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAndSortedStocks.map((stock) => (
                          <TableRow key={stock.symbol} className="hover:bg-muted/50">
                            <TableCell className="font-mono font-medium">{stock.symbol}</TableCell>
                            <TableCell>{stock.name}</TableCell>
                            <TableCell>{stock.sector || "N/A"}</TableCell>
                            <TableCell>{stock.industry && stock.industry !== "Unknown" ? stock.industry : "N/A"}</TableCell>
                            <TableCell className="text-right">{formatCurrency(stock.price)}</TableCell>
                            <TableCell className="text-right">{formatNumber(stock.pe_ratio)}</TableCell>
                            <TableCell className="text-right">
                              {stock.relative_pe !== null && stock.relative_pe !== undefined && !isNaN(stock.relative_pe) ? (
                                <span className={typeof stock.relative_pe === 'number' && stock.relative_pe < 1 ? "text-green-600 dark:text-green-400 font-medium" : ""}>
                                  {formatNumber(stock.relative_pe)}
                                </span>
                              ) : "N/A"}
                            </TableCell>
                            <TableCell className="text-right">{formatNumber(stock.sector_pe)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(stock.market_cap)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                          </div>
                </CardContent>
                  </Card>
            )}
          </TabsContent>
        </Tabs>

        {user && (
          <AddAssetDialog
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            onSave={handleAddStock}
            defaultAssetType="pk-equity"
            restrictToAssetType="pk-equity"
          />
        )}
      </main>
    </div>
  )
}

