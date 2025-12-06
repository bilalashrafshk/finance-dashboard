"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { ArrowUpDown, ChevronDown, Trash2, Loader2, Search } from "lucide-react"
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS } from "@/lib/portfolio/types"
import type { TrackedAsset } from "./add-asset-dialog"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"
import { formatCurrency, formatPercentage } from "@/lib/asset-screener/metrics-calculations"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AssetTableRow } from "./asset-table-row"

// Interface for the metrics we want to display and sort by
export interface AssetMetrics {
    price: number | null
    ytdReturn: number | null
    beta: number | null
    sharpeRatio: number | null
    sortinoRatio: number | null
    maxDrawdown: number | null
    rsi: number | null

    // Valuation
    peRatio: number | null
    pbRatio: number | null
    psRatio: number | null
    pegRatio: number | null

    // Dividends
    dividendYield: number | null
    payoutRatio: number | null

    // Profitability
    roe: number | null
    netMargin: number | null

    // Health
    debtToEquity: number | null
    currentRatio: number | null

    // Growth
    revenueGrowth: number | null
    netIncomeGrowth: number | null

    loading: boolean
}

interface AssetTableProps {
    assets: TrackedAsset[]
    onDelete: (id: string) => Promise<void>
    loading?: boolean
}

type SortKey = 'symbol' | 'name' | 'price' | 'ytdReturn' | 'beta' | 'sharpeRatio' | 'maxDrawdown' | 'peRatio' | 'dividendYield' | 'roe'
type SortOrder = 'asc' | 'desc'

export function AssetTable({ assets, onDelete, loading }: AssetTableProps) {
    const [filterValue, setFilterValue] = useState("")
    const [sortKey, setSortKey] = useState<SortKey>('symbol')
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
    const [metrics, setMetrics] = useState<Record<string, AssetMetrics>>({})
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [selectedTypes, setSelectedTypes] = useState<string[]>([])

    // Load metrics for assets using bulk fetch API
    useEffect(() => {
        const fetchMetrics = async () => {
            if (assets.length === 0) return

            // Initialize loading state for new assets
            setMetrics(prev => {
                const next = { ...prev }
                assets.forEach(asset => {
                    if (!next[asset.id]) {
                        next[asset.id] = {
                            price: null,
                            ytdReturn: null,
                            beta: null,
                            sharpeRatio: null,
                            sortinoRatio: null,
                            maxDrawdown: null,
                            rsi: null,
                            peRatio: null,
                            pbRatio: null,
                            psRatio: null,
                            pegRatio: null,
                            dividendYield: null,
                            payoutRatio: null,
                            roe: null,
                            netMargin: null,
                            debtToEquity: null,
                            currentRatio: null,
                            revenueGrowth: null,
                            netIncomeGrowth: null,
                            loading: true
                        }
                    }
                })
                return next
            })

            try {
                const response = await fetch('/api/assets/metrics', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ assets }),
                })

                if (response.ok) {
                    const data = await response.json()
                    if (data.metrics) {
                        setMetrics(prev => ({
                            ...prev,
                            ...data.metrics
                        }))
                    }
                }
            } catch (error) {
                console.error('Error fetching bulk metrics:', error)
                // Stop loading state on error
                setMetrics(prev => {
                    const next = { ...prev }
                    assets.forEach(asset => {
                        if (next[asset.id]?.loading) {
                            next[asset.id] = { ...next[asset.id], loading: false }
                        }
                    })
                    return next
                })
            }
        }

        fetchMetrics()
    }, [assets])

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
        } else {
            setSortKey(key)
            setSortOrder('asc')
        }
    }

    const handleDelete = async (id: string) => {
        setDeleting(true)
        try {
            await onDelete(id)
            setDeleteConfirmId(null)
        } catch (error) {
            console.error('Error deleting asset:', error)
        } finally {
            setDeleting(false)
        }
    }

    const uniqueAssetTypes = useMemo(() => {
        const types = new Set(assets.map(a => a.assetType))
        return Array.from(types)
    }, [assets])

    const filteredAndSortedAssets = useMemo(() => {
        let result = [...assets]

        // Filter by text
        if (filterValue) {
            const lowerFilter = filterValue.toLowerCase()
            result = result.filter(asset =>
                asset.symbol.toLowerCase().includes(lowerFilter) ||
                asset.name.toLowerCase().includes(lowerFilter)
            )
        }

        // Filter by type
        if (selectedTypes.length > 0) {
            result = result.filter(asset => selectedTypes.includes(asset.assetType))
        }

        // Sort
        result.sort((a, b) => {
            let valA: any
            let valB: any

            switch (sortKey) {
                case 'symbol':
                    valA = a.symbol
                    valB = b.symbol
                    break
                case 'name':
                    valA = a.name
                    valB = b.name
                    break
                default:
                    // Sort by metrics
                    valA = metrics[a.id]?.[sortKey] ?? -Infinity
                    valB = metrics[b.id]?.[sortKey] ?? -Infinity
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1
            return 0
        })

        return result
    }, [assets, filterValue, sortKey, sortOrder, metrics, selectedTypes])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (assets.length === 0) {
        return (
            <div className="text-center py-12 border rounded-lg bg-muted/10">
                <p className="text-muted-foreground">No assets tracked yet. Add your first asset to get started.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-1 max-w-sm">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Filter assets..."
                        value={filterValue}
                        onChange={(e) => setFilterValue(e.target.value)}
                        className="h-8"
                    />
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="ml-auto">
                            Filter Type <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {uniqueAssetTypes.map((type) => (
                            <DropdownMenuCheckboxItem
                                key={type}
                                checked={selectedTypes.includes(type)}
                                onCheckedChange={(checked) => {
                                    setSelectedTypes(prev =>
                                        checked ? [...prev, type] : prev.filter(t => t !== type)
                                    )
                                }}
                            >
                                {ASSET_TYPE_LABELS[type as keyof typeof ASSET_TYPE_LABELS]}
                            </DropdownMenuCheckboxItem>
                        ))}
                        {selectedTypes.length > 0 && (
                            <>
                                <div className="h-px bg-border my-1" />
                                <DropdownMenuCheckboxItem
                                    checked={false}
                                    onSelect={() => setSelectedTypes([])}
                                    className="text-destructive focus:text-destructive"
                                >
                                    Clear Filters
                                </DropdownMenuCheckboxItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="rounded-md border overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[180px]">
                                <Button variant="ghost" onClick={() => handleSort('symbol')} className="-ml-4 h-8">
                                    Asset
                                    <ArrowUpDown className="ml-2 h-4 w-4" />
                                </Button>
                            </TableHead>
                            <TableHead>
                                <Button variant="ghost" onClick={() => handleSort('price')} className="-ml-4 h-8">
                                    Price
                                    <ArrowUpDown className="ml-2 h-4 w-4" />
                                </Button>
                            </TableHead>
                            <TableHead>
                                <Button variant="ghost" onClick={() => handleSort('ytdReturn')} className="-ml-4 h-8">
                                    YTD
                                    <ArrowUpDown className="ml-2 h-4 w-4" />
                                </Button>
                            </TableHead>
                            <TableHead className="hidden md:table-cell">
                                <Button variant="ghost" onClick={() => handleSort('peRatio')} className="-ml-4 h-8">
                                    P/E
                                    <ArrowUpDown className="ml-2 h-4 w-4" />
                                </Button>
                            </TableHead>
                            <TableHead className="hidden md:table-cell">
                                <Button variant="ghost" onClick={() => handleSort('dividendYield')} className="-ml-4 h-8">
                                    Yield
                                    <ArrowUpDown className="ml-2 h-4 w-4" />
                                </Button>
                            </TableHead>
                            <TableHead className="hidden lg:table-cell">
                                <Button variant="ghost" onClick={() => handleSort('beta')} className="-ml-4 h-8">
                                    Beta (3Y)
                                    <ArrowUpDown className="ml-2 h-4 w-4" />
                                </Button>
                            </TableHead>
                            <TableHead className="hidden lg:table-cell">
                                <Button variant="ghost" onClick={() => handleSort('sharpeRatio')} className="-ml-4 h-8">
                                    Sharpe
                                    <ArrowUpDown className="ml-2 h-4 w-4" />
                                </Button>
                            </TableHead>
                            <TableHead className="hidden xl:table-cell">
                                <Button variant="ghost" onClick={() => handleSort('maxDrawdown')} className="-ml-4 h-8">
                                    Max DD
                                    <ArrowUpDown className="ml-2 h-4 w-4" />
                                </Button>
                            </TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredAndSortedAssets.map((asset) => {
                            const m = metrics[asset.id]

                            return (
                                <AssetTableRow
                                    key={asset.id}
                                    asset={asset}
                                    metrics={m}
                                    onDelete={() => setDeleteConfirmId(asset.id)}
                                />
                            )
                        })}
                    </TableBody>
                </Table>
            </div>

            <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove Asset?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to remove {assets.find(a => a.id === deleteConfirmId)?.symbol} from your list?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                            disabled={deleting}
                            className="bg-red-600 text-white hover:bg-red-700"
                        >
                            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Remove'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}


