"use client"

import Link from "next/link"
import { TableCell, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2 } from "lucide-react"
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS } from "@/lib/portfolio/types"
import type { TrackedAsset } from "./add-asset-dialog"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"
import { formatPercentage, formatCurrency } from "@/lib/asset-screener/metrics-calculations"

interface AssetMetrics {
    price: number | null
    ytdReturn: number | null
    beta: number | null
    sharpeRatio: number | null
    maxDrawdown: number | null
    loading: boolean
}

interface AssetTableRowProps {
    asset: TrackedAsset
    metrics?: AssetMetrics
    onDelete: () => void
}

export function AssetTableRow({ asset, metrics, onDelete }: AssetTableRowProps) {
    const isLoading = !metrics || metrics.loading

    return (
        <TableRow className="group">
            <TableCell className="font-medium">
                <Link
                    href={`/my-list/${generateAssetSlug(asset.assetType, asset.symbol)}`}
                    className="block hover:underline"
                >
                    <div className="flex flex-col">
                        <span className="font-bold">{asset.symbol}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[150px]">{asset.name}</span>
                        <Badge
                            variant="outline"
                            className="w-fit mt-1 text-[10px] px-1 py-0 h-5"
                            style={{
                                borderColor: ASSET_TYPE_COLORS[asset.assetType as keyof typeof ASSET_TYPE_COLORS],
                                color: ASSET_TYPE_COLORS[asset.assetType as keyof typeof ASSET_TYPE_COLORS]
                            }}
                        >
                            {ASSET_TYPE_LABELS[asset.assetType as keyof typeof ASSET_TYPE_LABELS]}
                        </Badge>
                    </div>
                </Link>
            </TableCell>
            <TableCell>
                {isLoading ? (
                    <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                ) : (
                    <span className="font-mono">
                        {metrics?.price ? formatCurrency(metrics.price, asset.currency, asset.assetType === 'crypto' ? 4 : 2) : '-'}
                    </span>
                )}
            </TableCell>
            <TableCell>
                {isLoading ? (
                    <div className="h-4 w-12 bg-muted animate-pulse rounded" />
                ) : (
                    <span className={`font-mono ${(metrics?.ytdReturn ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        }`}>
                        {metrics?.ytdReturn !== null ? formatPercentage(metrics.ytdReturn) : '-'}
                    </span>
                )}
            </TableCell>
            <TableCell className="hidden md:table-cell">
                {isLoading ? (
                    <div className="h-4 w-10 bg-muted animate-pulse rounded" />
                ) : (
                    <span className="font-mono">
                        {metrics?.beta !== null ? metrics.beta.toFixed(2) : '-'}
                    </span>
                )}
            </TableCell>
            <TableCell className="hidden md:table-cell">
                {isLoading ? (
                    <div className="h-4 w-10 bg-muted animate-pulse rounded" />
                ) : (
                    <span className={`font-mono ${(metrics?.sharpeRatio ?? 0) >= 1 ? 'text-green-600 dark:text-green-400' :
                        (metrics?.sharpeRatio ?? 0) >= 0 ? 'text-yellow-600 dark:text-yellow-400' :
                            'text-red-600 dark:text-red-400'
                        }`}>
                        {metrics?.sharpeRatio !== null ? metrics.sharpeRatio.toFixed(2) : '-'}
                    </span>
                )}
            </TableCell>
            <TableCell className="hidden lg:table-cell">
                {isLoading ? (
                    <div className="h-4 w-12 bg-muted animate-pulse rounded" />
                ) : (
                    <span className="font-mono text-red-600 dark:text-red-400">
                        {metrics?.maxDrawdown !== null ? formatPercentage(metrics.maxDrawdown) : '-'}
                    </span>
                )}
            </TableCell>
            <TableCell>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                        e.stopPropagation()
                        onDelete()
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </TableCell>
        </TableRow>
    )
}
