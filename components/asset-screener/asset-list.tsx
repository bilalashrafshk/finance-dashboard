"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2, Loader2 } from "lucide-react"
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS } from "@/lib/portfolio/types"
import type { TrackedAsset } from "./add-asset-dialog"
import { AssetSummaryMetrics } from "./asset-summary-metrics"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"
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

interface AssetListProps {
  assets: TrackedAsset[]
  onDelete: (id: string) => Promise<void>
  loading?: boolean
}

export function AssetList({ assets, onDelete, loading }: AssetListProps) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (assets.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No assets tracked yet. Add your first asset to get started.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {assets.map((asset) => (
          <Card key={asset.id} className="overflow-hidden hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <Link 
                  href={`/asset-screener/${generateAssetSlug(asset.assetType, asset.symbol)}`}
                  className="flex-1 hover:opacity-80 transition-opacity cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CardTitle className="text-lg">{asset.name}</CardTitle>
                    <Badge 
                      variant="outline" 
                      style={{ 
                        borderColor: ASSET_TYPE_COLORS[asset.assetType as keyof typeof ASSET_TYPE_COLORS],
                        color: ASSET_TYPE_COLORS[asset.assetType as keyof typeof ASSET_TYPE_COLORS]
                      }}
                    >
                      {ASSET_TYPE_LABELS[asset.assetType as keyof typeof ASSET_TYPE_LABELS]}
                    </Badge>
                  </div>
                  <CardDescription className="flex items-center gap-2 mb-2">
                    <span className="font-mono">{asset.symbol}</span>
                    <span className="text-muted-foreground">•</span>
                    <span>{asset.currency}</span>
                  </CardDescription>
                  <div className="mt-2">
                    <AssetSummaryMetrics asset={asset} />
                  </div>
                </Link>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setDeleteConfirmId(asset.id)
                    }}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Asset?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-1">
              <div>Are you sure you want to remove this asset from your screener?</div>
              <div>This action cannot be undone.</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

