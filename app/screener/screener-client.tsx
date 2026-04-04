"use client"

import { useState, useEffect } from "react"
import { SharedNavbar } from "@/components/shared-navbar"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown, X, ChevronDown, ChevronUp, Sparkles, TrendingUp, Building2, DollarSign } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"

// Quick filter presets
const FILTER_PRESETS = [
  {
    id: 'undervalued',
    label: 'Undervalued',
    icon: Sparkles,
    description: 'P/E below sector avg',
    filters: { maxRelativePE: 0.8, minPE: 0, maxPE: 30 },
    color: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10',
  },
  {
    id: 'high-dividend',
    label: 'High Dividend',
    icon: DollarSign,
    description: 'Yield > 5%',
    filters: { minDividendYield: 5 },
    color: 'text-blue-600 dark:text-blue-400 border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10',
  },
  {
    id: 'large-cap',
    label: 'Large Cap',
    icon: Building2,
    description: 'Market cap > 50B PKR',
    filters: { minMarketCap: 50 },
    color: 'text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10',
  },
  {
    id: 'growth',
    label: 'Growth',
    icon: TrendingUp,
    description: 'Low P/E + Large Cap',
    filters: { maxPE: 15, minMarketCap: 20 },
    color: 'text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10',
  },
] as const

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
  const [minDividendYield, setMinDividendYield] = useState<number | "">("")

  // Advanced filters toggle
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  
  // Active preset
  const [activePreset, setActivePreset] = useState<string | null>(null)

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

  // Apply a preset
  const applyPreset = (presetId: string) => {
    if (activePreset === presetId) {
      // Toggle off — clear all filters
      clearAllFilters()
      return
    }
    
    const preset = FILTER_PRESETS.find(p => p.id === presetId)
    if (!preset) return

    // Clear existing filters first
    setMinPE("")
    setMaxPE("")
    setMinRelativePE("")
    setMaxRelativePE("")
    setMinMarketCap(0)
    setMaxMarketCap("")
    setMinPrice("")
    setMaxPrice("")
    setMinDividendYield("")
    setFilterSector("all")
    setFilterIndustry("all")
    setSearchQuery("")

    // Apply preset filters
    const f = preset.filters as any
    if (f.maxRelativePE !== undefined) setMaxRelativePE(f.maxRelativePE)
    if (f.minPE !== undefined) setMinPE(f.minPE)
    if (f.maxPE !== undefined) setMaxPE(f.maxPE)
    if (f.minMarketCap !== undefined) setMinMarketCap(f.minMarketCap)
    if (f.minDividendYield !== undefined) setMinDividendYield(f.minDividendYield)
    
    setActivePreset(presetId)
  }

  const clearAllFilters = () => {
    setSearchQuery("")
    setFilterSector("all")
    setFilterIndustry("all")
    setMinPE("")
    setMaxPE("")
    setMinRelativePE("")
    setMaxRelativePE("")
    setMinMarketCap(0)
    setMaxMarketCap("")
    setMinPrice("")
    setMaxPrice("")
    setMinDividendYield("")
    setActivePreset(null)
  }

  // Get unique sectors and industries for filters
  const uniqueSectors = Array.from(new Set(allStocks.map(s => s.sector).filter(Boolean))).sort()
  const uniqueIndustries = Array.from(new Set(allStocks.map(s => s.industry).filter(Boolean))).sort()

  // Count active filters
  const activeFilterCount = [
    searchQuery !== "",
    filterSector !== "all",
    filterIndustry !== "all",
    minPE !== "",
    maxPE !== "",
    minRelativePE !== "",
    maxRelativePE !== "",
    minMarketCap > 0,
    maxMarketCap !== "",
    minPrice !== "",
    maxPrice !== "",
    minDividendYield !== "",
  ].filter(Boolean).length

  // Build active filter chips
  const activeFilters: { label: string; onRemove: () => void }[] = []
  if (filterSector !== "all") activeFilters.push({ label: `Sector: ${filterSector}`, onRemove: () => setFilterSector("all") })
  if (filterIndustry !== "all") activeFilters.push({ label: `Industry: ${filterIndustry}`, onRemove: () => setFilterIndustry("all") })
  if (minPE !== "") activeFilters.push({ label: `P/E ≥ ${minPE}`, onRemove: () => setMinPE("") })
  if (maxPE !== "") activeFilters.push({ label: `P/E ≤ ${maxPE}`, onRemove: () => setMaxPE("") })
  if (minRelativePE !== "") activeFilters.push({ label: `Rel P/E ≥ ${minRelativePE}`, onRemove: () => setMinRelativePE("") })
  if (maxRelativePE !== "") activeFilters.push({ label: `Rel P/E ≤ ${maxRelativePE}`, onRemove: () => setMaxRelativePE("") })
  if (minMarketCap > 0) activeFilters.push({ label: `Mkt Cap ≥ ${minMarketCap}B`, onRemove: () => setMinMarketCap(0) })
  if (maxMarketCap !== "") activeFilters.push({ label: `Mkt Cap ≤ ${maxMarketCap}B`, onRemove: () => setMaxMarketCap("") })
  if (minPrice !== "") activeFilters.push({ label: `Price ≥ ${minPrice}`, onRemove: () => setMinPrice("") })
  if (maxPrice !== "") activeFilters.push({ label: `Price ≤ ${maxPrice}`, onRemove: () => setMaxPrice("") })
  if (minDividendYield !== "") activeFilters.push({ label: `Div Yield ≥ ${minDividendYield}%`, onRemove: () => setMinDividendYield("") })

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

      // Dividend yield filter
      const divYield = typeof stock.dividend_yield === 'number' ? stock.dividend_yield : null
      const matchesDividendYield = minDividendYield === "" || (divYield !== null && divYield >= minDividendYield)

      return matchesAssetClass && matchesSearch && matchesSector && matchesIndustry && matchesPE &&
        matchesRelativePE && matchesMarketCap && matchesPrice && matchesDividendYield
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
  }, [searchQuery, filterSector, filterIndustry, assetClassFilter, minPE, maxPE, minRelativePE, maxRelativePE, minMarketCap, maxMarketCap, minPrice, maxPrice, minDividendYield])

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

  // Color coding for Relative P/E
  const getRelativePEColor = (value: number | undefined) => {
    if (value === undefined || isNaN(value)) return ""
    if (value < 0.8) return "text-green-600 dark:text-green-400 font-semibold"
    if (value <= 1.2) return "text-amber-600 dark:text-amber-400"
    return "text-red-600 dark:text-red-400"
  }

  const getRelativePEBg = (value: number | undefined) => {
    if (value === undefined || isNaN(value)) return ""
    if (value < 0.8) return "bg-green-500/5"
    if (value <= 1.2) return "bg-amber-500/5"
    return "bg-red-500/5"
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

          {/* Quick Filter Presets */}
          <div className="flex flex-wrap gap-2">
            {FILTER_PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                  activePreset === preset.id
                    ? `${preset.color} ring-2 ring-offset-1 ring-offset-background ring-current`
                    : `border-border text-muted-foreground hover:text-foreground hover:border-foreground/20`
                }`}
              >
                <preset.icon className="h-4 w-4" />
                <span>{preset.label}</span>
                <span className="text-xs opacity-60 hidden sm:inline">{preset.description}</span>
              </button>
            ))}
          </div>

          {/* Search and Basic Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {/* Search and Basic Filters */}
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by symbol, name, sector, or industry..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setActivePreset(null) }}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="w-full md:w-48">
                    <Select value={assetClassFilter} onValueChange={(value) => setAssetClassFilter(value as 'all' | 'pk-equity' | 'us-equity')}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Asset Classes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pk-equity">PK Equities</SelectItem>
                        <SelectItem value="all">All Asset Classes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-full md:w-48">
                    <Select value={filterSector} onValueChange={(v) => { setFilterSector(v); setActivePreset(null) }}>
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
                  <Button
                    variant={showAdvancedFilters ? "secondary" : "outline"}
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    className="gap-2"
                  >
                    {showAdvancedFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    Advanced
                    {activeFilterCount > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full text-xs">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </div>

                {/* Advanced Filters — Collapsible */}
                {showAdvancedFilters && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Advanced Filters</Label>
                      {activeFilterCount > 0 && (
                        <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs h-7">
                          Clear all filters
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <Label className="mb-2 block text-xs text-muted-foreground">P/E Ratio</Label>
                        <div className="flex gap-2">
                          <Input type="number" placeholder="Min" value={minPE} onChange={(e) => { setMinPE(e.target.value === "" ? "" : parseFloat(e.target.value)); setActivePreset(null) }} className="flex-1" />
                          <Input type="number" placeholder="Max" value={maxPE} onChange={(e) => { setMaxPE(e.target.value === "" ? "" : parseFloat(e.target.value)); setActivePreset(null) }} className="flex-1" />
                        </div>
                      </div>
                      <div>
                        <Label className="mb-2 block text-xs text-muted-foreground">Relative P/E</Label>
                        <div className="flex gap-2">
                          <Input type="number" step="0.1" placeholder="Min" value={minRelativePE} onChange={(e) => { setMinRelativePE(e.target.value === "" ? "" : parseFloat(e.target.value)); setActivePreset(null) }} className="flex-1" />
                          <Input type="number" step="0.1" placeholder="Max" value={maxRelativePE} onChange={(e) => { setMaxRelativePE(e.target.value === "" ? "" : parseFloat(e.target.value)); setActivePreset(null) }} className="flex-1" />
                        </div>
                      </div>
                      <div>
                        <Label className="mb-2 block text-xs text-muted-foreground">Market Cap (Billion PKR)</Label>
                        <div className="flex gap-2">
                          <Input type="number" step="0.1" placeholder="Min" value={minMarketCap || ""} onChange={(e) => { setMinMarketCap(parseFloat(e.target.value) || 0); setActivePreset(null) }} className="flex-1" />
                          <Input type="number" step="0.1" placeholder="Max" value={maxMarketCap} onChange={(e) => { setMaxMarketCap(e.target.value === "" ? "" : parseFloat(e.target.value)); setActivePreset(null) }} className="flex-1" />
                        </div>
                      </div>
                      <div>
                        <Label className="mb-2 block text-xs text-muted-foreground">Price (PKR)</Label>
                        <div className="flex gap-2">
                          <Input type="number" step="0.01" placeholder="Min" value={minPrice} onChange={(e) => { setMinPrice(e.target.value === "" ? "" : parseFloat(e.target.value)); setActivePreset(null) }} className="flex-1" />
                          <Input type="number" step="0.01" placeholder="Max" value={maxPrice} onChange={(e) => { setMaxPrice(e.target.value === "" ? "" : parseFloat(e.target.value)); setActivePreset(null) }} className="flex-1" />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <Label className="mb-2 block text-xs text-muted-foreground">Industry</Label>
                        <Select value={filterIndustry} onValueChange={(v) => { setFilterIndustry(v); setActivePreset(null) }}>
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
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Active Filter Chips */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground font-medium">Active filters:</span>
              {activeFilters.map((filter, i) => (
                <Badge key={i} variant="secondary" className="gap-1 pl-2.5 pr-1.5 py-1 text-xs">
                  {filter.label}
                  <button
                    onClick={() => { filter.onRemove(); setActivePreset(null) }}
                    className="ml-1 hover:bg-foreground/10 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs h-6 px-2">
                Clear all
              </Button>
            </div>
          )}

          {/* Results count */}
          {!loading && !loadingStocks && allStocks.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Showing <strong className="text-foreground">{filteredAndSortedStocks.length}</strong> of {stocksWithMetrics.length} stocks
              {activePreset && (
                <span className="ml-2">
                  — preset: <strong className="text-foreground">{FILTER_PRESETS.find(p => p.id === activePreset)?.label}</strong>
                </span>
              )}
            </div>
          )}

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
                <Button variant="outline" onClick={clearAllFilters}>Clear all filters</Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow className="border-b-2">
                        <TableHead className="px-3 py-3 text-xs font-semibold">
                          <SortButton field="symbol">Symbol</SortButton>
                        </TableHead>
                        <TableHead className="px-3 py-3 text-xs font-semibold">
                          <SortButton field="name">Name</SortButton>
                        </TableHead>
                        <TableHead className="px-3 py-3 text-xs font-semibold">
                          <SortButton field="sector">Sector</SortButton>
                        </TableHead>
                        <TableHead className="text-right px-3 py-3 text-xs font-semibold">
                          <SortButton field="price">Price</SortButton>
                        </TableHead>
                        <TableHead className="text-right px-3 py-3 text-xs font-semibold">
                          <SortButton field="pe_ratio">P/E</SortButton>
                        </TableHead>
                        <TableHead className="text-right px-3 py-3 text-xs font-semibold">
                          <SortButton field="relative_pe">Rel P/E</SortButton>
                        </TableHead>
                        <TableHead className="text-right px-3 py-3 text-xs font-semibold">
                          <SortButton field="sector_pe">Sector P/E</SortButton>
                        </TableHead>
                        <TableHead className="text-right px-3 py-3 text-xs font-semibold">
                          <SortButton field="dividend_yield">Div Yield</SortButton>
                        </TableHead>
                        <TableHead className="text-right px-3 py-3 text-xs font-semibold">
                          <SortButton field="market_cap">Mkt Cap</SortButton>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedStocks.map((stock, idx) => {
                        const assetType = stock.assetType || 'pk-equity'
                        const assetSlug = generateAssetSlug(assetType, stock.symbol)
                        return (
                          <TableRow key={stock.symbol} className={`hover:bg-muted/50 transition-colors ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                            <TableCell className="px-3 py-2.5 text-sm">
                              <Link
                                href={`/asset/${assetSlug}`}
                                className="font-mono font-semibold hover:text-primary hover:underline"
                              >
                                {stock.symbol}
                              </Link>
                            </TableCell>
                            <TableCell className="px-3 py-2.5 text-sm">
                              <Link
                                href={`/asset/${assetSlug}`}
                                className="hover:text-primary hover:underline text-muted-foreground"
                              >
                                {stock.name}
                              </Link>
                            </TableCell>
                            <TableCell className="px-3 py-2.5 text-sm text-muted-foreground">{stock.sector || "N/A"}</TableCell>
                            <TableCell className="text-right px-3 py-2.5 text-sm font-medium">{formatCurrency(stock.price)}</TableCell>
                            <TableCell className="text-right px-3 py-2.5 text-sm">{formatNumber(stock.pe_ratio)}</TableCell>
                            <TableCell className={`text-right px-3 py-2.5 text-sm ${getRelativePEColor(stock.relative_pe)} ${getRelativePEBg(stock.relative_pe)}`}>
                              {stock.relative_pe !== null && stock.relative_pe !== undefined && !isNaN(stock.relative_pe) ? (
                                <span>
                                  {formatNumber(stock.relative_pe)}
                                </span>
                              ) : "N/A"}
                            </TableCell>
                            <TableCell className="text-right px-3 py-2.5 text-sm text-muted-foreground">{formatNumber(stock.sector_pe)}</TableCell>
                            <TableCell className="text-right px-3 py-2.5 text-sm">
                              {stock.dividend_yield !== null && stock.dividend_yield !== undefined && !isNaN(stock.dividend_yield)
                                ? <span className={stock.dividend_yield >= 5 ? 'text-green-600 dark:text-green-400 font-medium' : ''}>{formatNumber(stock.dividend_yield)}%</span>
                                : "N/A"}
                            </TableCell>
                            <TableCell className="text-right px-3 py-2.5 text-sm text-muted-foreground">{formatCurrency(stock.market_cap)}</TableCell>
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

