"use client"

import { useState, useEffect } from "react"
import { SharedNavbar } from "@/components/shared-navbar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"

export default function ScreenerPage() {
  const [loading, setLoading] = useState(true)
  
  // All stocks with price data (PK equities and US equities)
  interface StockInfo {
    symbol: string
    name: string
    sector: string
    industry: string
    assetType?: 'pk-equity' | 'us-equity' // Add asset type
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
  
  // Asset class filter
  const [assetClassFilter, setAssetClassFilter] = useState<'all' | 'pk-equity' | 'us-equity'>('pk-equity')
  
  // Pagination for lazy loading
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50
  const [allStocks, setAllStocks] = useState<StockInfo[]>([])
  const [stocksWithMetrics, setStocksWithMetrics] = useState<StockWithMetrics[]>([])
  const [loadingStocks, setLoadingStocks] = useState(true)
  
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
    loadAllStocks()
  }, [])

  // Load metrics and merge with stocks
  useEffect(() => {
    async function loadMetrics() {
      try {
        const res = await fetch('/api/screener/metrics')
        if (res.ok) {
          const data = await res.json()
          const metrics = data.data || []
          
          if (allStocks.length > 0 && metrics.length > 0) {
            const merged = allStocks.map(stock => {
              const metric = metrics.find((m: any) => m.symbol === stock.symbol)
              if (!metric) {
                return { ...stock, assetType: 'pk-equity' } as StockWithMetrics
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
                assetType: 'pk-equity', // Default to pk-equity for now
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
            setStocksWithMetrics(allStocks.map(s => ({ ...s, assetType: 'pk-equity' } as StockWithMetrics)))
          }
        }
      } catch (e) {
        console.error("Failed to load screener metrics", e)
        // If metrics fail, still show stocks without metrics
        if (allStocks.length > 0) {
          setStocksWithMetrics(allStocks.map(s => ({ ...s } as StockWithMetrics)))
        }
      } finally {
        setLoading(false)
      }
    }
    
    if (allStocks.length > 0) {
      loadMetrics()
    }
  }, [allStocks])

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
      setLoading(false)
    }
  }


  // Get unique sectors and industries for filters
  const uniqueSectors = Array.from(new Set(allStocks.map(s => s.sector).filter(Boolean))).sort()
  const uniqueIndustries = Array.from(new Set(allStocks.map(s => s.industry).filter(Boolean))).sort()

  // Filter and sort stocks
  const filteredAndSortedStocks = stocksWithMetrics
    .filter(stock => {
      // Asset class filter
      const matchesAssetClass = assetClassFilter === 'all' || stock.assetType === assetClassFilter
      
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
      
      return matchesAssetClass && matchesSearch && matchesSector && matchesIndustry && matchesPE && 
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
  
  // Pagination
  const totalPages = Math.ceil(filteredAndSortedStocks.length / itemsPerPage)
  const paginatedStocks = filteredAndSortedStocks.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterSector, filterIndustry, assetClassFilter, minPE, maxPE, minRelativePE, maxRelativePE, minMarketCap, maxMarketCap, minPrice, maxPrice])

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

        <div className="space-y-4">

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
                      <Label className="mb-2 block">Asset Class</Label>
                      <Select value={assetClassFilter} onValueChange={(value) => setAssetClassFilter(value as 'all' | 'pk-equity' | 'us-equity')}>
                        <SelectTrigger>
                          <SelectValue placeholder="All Asset Classes" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pk-equity">PK Equities</SelectItem>
                          <SelectItem value="us-equity" disabled>US Equities (Coming Soon)</SelectItem>
                          <SelectItem value="all">All Asset Classes</SelectItem>
                        </SelectContent>
                      </Select>
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
                          <TableHead className="px-2 py-2 text-xs">
                            <SortButton field="symbol">Symbol</SortButton>
                          </TableHead>
                          <TableHead className="px-2 py-2 text-xs">
                            <SortButton field="name">Name</SortButton>
                          </TableHead>
                          <TableHead className="px-2 py-2 text-xs">
                            <SortButton field="sector">Sector</SortButton>
                          </TableHead>
                          <TableHead className="px-2 py-2 text-xs">
                            <SortButton field="industry">Industry</SortButton>
                          </TableHead>
                          <TableHead className="text-right px-2 py-2 text-xs">
                            <SortButton field="price">Price</SortButton>
                          </TableHead>
                          <TableHead className="text-right px-2 py-2 text-xs">
                            <SortButton field="pe_ratio">P/E</SortButton>
                          </TableHead>
                          <TableHead className="text-right px-2 py-2 text-xs">
                            <SortButton field="relative_pe">Rel P/E</SortButton>
                          </TableHead>
                          <TableHead className="text-right px-2 py-2 text-xs">
                            <SortButton field="sector_pe">Sector P/E</SortButton>
                          </TableHead>
                          <TableHead className="text-right px-2 py-2 text-xs">
                            <SortButton field="market_cap">Mkt Cap</SortButton>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedStocks.map((stock) => {
                          const assetType = stock.assetType || 'pk-equity'
                          const assetSlug = generateAssetSlug(assetType, stock.symbol)
                          return (
                            <TableRow key={stock.symbol} className="hover:bg-muted/50">
                              <TableCell className="px-2 py-1.5 text-xs">
                                <Link 
                                  href={`/asset/${assetSlug}`}
                                  className="font-mono font-medium hover:text-primary hover:underline"
                                >
                                  {stock.symbol}
                                </Link>
                              </TableCell>
                              <TableCell className="px-2 py-1.5 text-xs">
                                <Link 
                                  href={`/asset/${assetSlug}`}
                                  className="hover:text-primary hover:underline"
                                >
                                  {stock.name}
                                </Link>
                              </TableCell>
                              <TableCell className="px-2 py-1.5 text-xs">{stock.sector || "N/A"}</TableCell>
                              <TableCell className="px-2 py-1.5 text-xs">{stock.industry && stock.industry !== "Unknown" ? stock.industry : "N/A"}</TableCell>
                              <TableCell className="text-right px-2 py-1.5 text-xs">{formatCurrency(stock.price)}</TableCell>
                              <TableCell className="text-right px-2 py-1.5 text-xs">{formatNumber(stock.pe_ratio)}</TableCell>
                              <TableCell className="text-right px-2 py-1.5 text-xs">
                                {stock.relative_pe !== null && stock.relative_pe !== undefined && !isNaN(stock.relative_pe) ? (
                                  <span className={typeof stock.relative_pe === 'number' && stock.relative_pe < 1 ? "text-green-600 dark:text-green-400 font-medium" : ""}>
                                    {formatNumber(stock.relative_pe)}
                                  </span>
                                ) : "N/A"}
                              </TableCell>
                              <TableCell className="text-right px-2 py-1.5 text-xs">{formatNumber(stock.sector_pe)}</TableCell>
                              <TableCell className="text-right px-2 py-1.5 text-xs">{formatCurrency(stock.market_cap)}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredAndSortedStocks.length)} of {filteredAndSortedStocks.length} stocks
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        <div className="text-sm text-muted-foreground">
                          Page {currentPage} of {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
        </div>

      </main>
    </div>
  )
}

