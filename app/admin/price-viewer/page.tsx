"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { SharedNavbar } from "@/components/shared-navbar"
import { useAuth, getAuthToken } from "@/lib/auth/auth-context"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
    Loader2,
    Search,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Calendar as CalendarIcon,
    Filter,
    Download,
    X
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { format } from "date-fns"

interface PriceRecord {
    date: string
    open: number | null
    high: number | null
    low: number | null
    close: number
    volume: number | null
    change_pct: number | null
    source: string
}

interface PaginationInfo {
    total: number
    page: number
    limit: number
    totalPages: number
}

interface StockInfo {
    symbol: string
    name: string
    sector: string
}

export default function PriceViewerPage() {
    const { user, loading: authLoading } = useAuth()
    const router = useRouter()

    // State
    const [stocks, setStocks] = useState<StockInfo[]>([])
    const [selectedSymbol, setSelectedSymbol] = useState<string>("")
    const [openSymbolPicker, setOpenSymbolPicker] = useState(false)

    const [priceData, setPriceData] = useState<PriceRecord[]>([])
    const [loading, setLoading] = useState(false)
    const [loadingStocks, setLoadingStocks] = useState(true)
    const [pagination, setPagination] = useState<PaginationInfo | null>(null)

    // Filters
    const [page, setPage] = useState(1)
    const [limit, setLimit] = useState(50)
    const [sortBy, setSortBy] = useState("date")
    const [sortOrder, setSortOrder] = useState<"ASC" | "DESC">("DESC")
    const [startDate, setStartDate] = useState("")
    const [endDate, setEndDate] = useState("")

    // Auth protection
    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                router.push("/auth/login")
            } else if (user.role !== "admin") {
                router.push("/dashboard")
            }
        }
    }, [user, authLoading, router])

    // Load stocks on mount
    useEffect(() => {
        if (user?.role === "admin") {
            async function loadStocks() {
                try {
                    const res = await fetch('/api/screener/stocks')
                    const data = await res.json()
                    if (data.success) {
                        setStocks(data.stocks)
                    }
                } catch (e) {
                    console.error("Failed to load stocks", e)
                } finally {
                    setLoadingStocks(false)
                }
            }
            loadStocks()
        }
    }, [user])

    // Load price data when filters change
    const fetchPriceData = useCallback(async () => {
        if (!selectedSymbol) return

        setLoading(true)
        try {
            const params = new URLSearchParams({
                symbol: selectedSymbol,
                page: page.toString(),
                limit: limit.toString(),
                sortBy,
                sortOrder,
                ...(startDate && { startDate }),
                ...(endDate && { endDate }),
            })

            const token = getAuthToken()
            const res = await fetch(`/api/admin/historical-data?${params.toString()}`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            })
            const result = await res.json()

            if (result.success) {
                setPriceData(result.data)
                setPagination(result.pagination)
            }
        } catch (e) {
            console.error("Failed to fetch price data", e)
        } finally {
            setLoading(false)
        }
    }, [selectedSymbol, page, limit, sortBy, sortOrder, startDate, endDate])

    useEffect(() => {
        fetchPriceData()
    }, [fetchPriceData])

    const handleSort = (field: string) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === "ASC" ? "DESC" : "ASC")
        } else {
            setSortBy(field)
            setSortOrder("DESC")
        }
        setPage(1)
    }

    const formatNumber = (val: number | null, decimals = 2) => {
        if (val === null || isNaN(val)) return "-"
        return val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    }

    const formatVolume = (val: number | null) => {
        if (val === null || isNaN(val)) return "-"
        return val.toLocaleString()
    }

    const clearFilters = () => {
        setStartDate("")
        setEndDate("")
        setPage(1)
    }

    if (authLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!user || user.role !== "admin") {
        return null
    }

    return (
        <div className="min-h-screen bg-background pb-12">
            <SharedNavbar />

            <main className="container mx-auto p-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Internal Price Viewer</h1>
                        <p className="text-muted-foreground">
                            Deep dive into historical OHLCV data for PSX assets.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => fetchPriceData()}>
                            Refresh Data
                        </Button>
                        <Button variant="outline" size="sm" disabled={!priceData.length}>
                            <Download className="h-4 w-4 mr-2" />
                            Export CSV
                        </Button>
                    </div>
                </div>

                {/* Filters and Controls */}
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* Asset Selector */}
                            <div className="space-y-2">
                                <Label>Select Asset</Label>
                                <Popover open={openSymbolPicker} onOpenChange={setOpenSymbolPicker}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openSymbolPicker}
                                            className="w-full justify-between font-mono"
                                            disabled={loadingStocks}
                                        >
                                            {selectedSymbol
                                                ? stocks.find(s => s.symbol === selectedSymbol)?.symbol || selectedSymbol
                                                : "Search symbol..."}
                                            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Search symbol or name..." />
                                            <CommandList>
                                                <CommandEmpty>No stock found.</CommandEmpty>
                                                <CommandGroup>
                                                    {stocks.map((stock) => (
                                                        <CommandItem
                                                            key={stock.symbol}
                                                            value={`${stock.symbol} ${stock.name}`}
                                                            onSelect={() => {
                                                                setSelectedSymbol(stock.symbol)
                                                                setOpenSymbolPicker(false)
                                                                setPage(1)
                                                            }}
                                                            className="font-mono"
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className="font-bold">{stock.symbol}</span>
                                                                <span className="text-xs text-muted-foreground">{stock.name}</span>
                                                            </div>
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Date Filters */}
                            <div className="space-y-2">
                                <Label>Start Date</Label>
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => {
                                        setStartDate(e.target.value)
                                        setPage(1)
                                    }}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>End Date</Label>
                                <Input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => {
                                        setEndDate(e.target.value)
                                        setPage(1)
                                    }}
                                />
                            </div>

                            {/* Limit Selector */}
                            <div className="space-y-2">
                                <Label>Rows Per Page</Label>
                                <Select value={limit.toString()} onValueChange={(v) => {
                                    setLimit(parseInt(v))
                                    setPage(1)
                                }}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="25">25 rows</SelectItem>
                                        <SelectItem value="50">50 rows</SelectItem>
                                        <SelectItem value="100">100 rows</SelectItem>
                                        <SelectItem value="250">250 rows</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {(startDate || endDate) && (
                            <div className="mt-4 flex justify-end">
                                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">
                                    <X className="h-3 w-3 mr-1" /> Clear Date Filters
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Data Table */}
                <Card className="border-border/50 overflow-hidden">
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-24 gap-4">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">Fetching records...</p>
                            </div>
                        ) : !selectedSymbol ? (
                            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                                <Search className="h-12 w-12 text-muted-foreground/20" />
                                <div className="space-y-1">
                                    <p className="font-medium text-lg">No Asset Selected</p>
                                    <p className="text-sm text-muted-foreground">Select a PSX symbol from the dropdown above to view historical data.</p>
                                </div>
                            </div>
                        ) : priceData.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                                <Filter className="h-12 w-12 text-muted-foreground/20" />
                                <div className="space-y-1">
                                    <p className="font-medium text-lg">No Data Found</p>
                                    <p className="text-sm text-muted-foreground">No records match the selected symbol and date range.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="relative">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead className="w-[150px]">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="-ml-3 h-8 data-[state=open]:bg-accent"
                                                    onClick={() => handleSort('date')}
                                                >
                                                    <span>Date</span>
                                                    {sortBy === 'date' ? (
                                                        sortOrder === 'ASC' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />
                                                    ) : <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />}
                                                </Button>
                                            </TableHead>
                                            <TableHead className="text-right">Open</TableHead>
                                            <TableHead className="text-right">High</TableHead>
                                            <TableHead className="text-right">Low</TableHead>
                                            <TableHead className="text-right font-bold text-foreground">Close</TableHead>
                                            <TableHead className="text-right">Volume</TableHead>
                                            <TableHead className="text-right">Change %</TableHead>
                                            <TableHead className="text-right">Source</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {priceData.map((row, idx) => (
                                            <TableRow key={`${row.date}-${idx}`} className="hover:bg-muted/30 transition-colors">
                                                <TableCell className="font-mono text-xs">{row.date}</TableCell>
                                                <TableCell className="text-right font-mono text-xs">{formatNumber(row.open)}</TableCell>
                                                <TableCell className="text-right font-mono text-xs">{formatNumber(row.high)}</TableCell>
                                                <TableCell className="text-right font-mono text-xs">{formatNumber(row.low)}</TableCell>
                                                <TableCell className="text-right font-mono text-xs font-bold text-foreground">{formatNumber(row.close)}</TableCell>
                                                <TableCell className="text-right font-mono text-xs">{formatVolume(row.volume)}</TableCell>
                                                <TableCell className={cn(
                                                    "text-right font-mono text-xs",
                                                    row.change_pct && row.change_pct > 0 ? "text-green-500" : row.change_pct && row.change_pct < 0 ? "text-red-500" : ""
                                                )}>
                                                    {row.change_pct ? `${row.change_pct > 0 ? '+' : ''}${row.change_pct.toFixed(2)}%` : '0.00%'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <span className="text-[10px] uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                                        {row.source}
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 bg-card p-4 rounded-lg border border-border/50">
                        <p className="text-sm text-muted-foreground">
                            Showing page <span className="font-medium text-foreground">{pagination.page}</span> of <span className="font-medium text-foreground">{pagination.totalPages}</span> ({pagination.total} total records)
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                                disabled={page === pagination.totalPages}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}
