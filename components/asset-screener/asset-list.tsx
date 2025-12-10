"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2, Loader2 } from "lucide-react"
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS } from "@/lib/portfolio/types"
import type { TrackedAsset } from "./add-asset-dialog"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"
import { formatPercentage, formatCurrency } from "@/lib/asset-screener/metrics-calculations"
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
import type { AssetMetrics } from "./asset-table"

interface AssetListProps {
  assets: TrackedAsset[]
  onDelete: (id: string) => Promise<void>
  loading?: boolean
}

export function AssetList({ assets, onDelete, loading }: AssetListProps) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [metrics, setMetrics] = useState<Record<string, AssetMetrics>>({})

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
        {assets.map((asset) => {
          const m = metrics[asset.id]
          const isLoading = !m || m.loading

          return (
            <Card key={asset.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <Link
                    href={`/my-list/${generateAssetSlug(asset.assetType, asset.symbol)}`}
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

                    {/* Metrics Display */}
                    <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                      {isLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Loading metrics...</span>
                        </div>
                      ) : (
                        <>
                          {m.price !== null && (
                            <div>
                              <span className="text-muted-foreground">Price: </span>
                              <span className="font-semibold">
                                {formatCurrency(m.price, asset.currency, asset.assetType === 'crypto' ? 4 : 2)}
                              </span>
                            </div>
                          )}

                          {m.ytdReturn !== null && (
                            <div>
                              <span className="text-muted-foreground">YTD: </span>
                              <span className={`font-semibold ${m.ytdReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                {formatPercentage(m.ytdReturn)}
                              </span>
                            </div>
                          )}

                          {m.beta !== null && (
                            <div>
                              <span className="text-muted-foreground">Beta: </span>
                              <span className="font-semibold">{Number(m.beta).toFixed(2)}</span>
                            </div>
                          )}

                          {m.sharpeRatio !== null && (
                            <div>
                              <span className="text-muted-foreground">Sharpe: </span>
                              <span className={`font-semibold ${m.sharpeRatio >= 1 ? 'text-green-600 dark:text-green-400' :
                                m.sharpeRatio >= 0 ? 'text-yellow-600 dark:text-yellow-400' :
                                  'text-red-600 dark:text-red-400'
                                }`}>
                                {Number(m.sharpeRatio).toFixed(2)}
                              </span>
                            </div>
                          )}

                          {m.dividendYield !== null && (
                            <div>
                              <span className="text-muted-foreground">Yield: </span>
                              <span className="font-semibold text-green-600 dark:text-green-400">
                                {Number(m.dividendYield).toFixed(2)}%
                              </span>
                            </div>
                          )}

                          {m.maxDrawdown !== null && (
                            <div>
                              <span className="text-muted-foreground">Max DD: </span>
                              <span className="font-semibold text-red-600 dark:text-red-400">
                                {formatPercentage(m.maxDrawdown)}
                              </span>
                            </div>
                          )}

                          {!m.price && !m.ytdReturn && (
                            <span className="text-muted-foreground text-xs">No metrics available</span>
                          )}
                        </>
                      )}
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
          )
        })}
      </div>

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Asset?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-1">
              <span className="block">Are you sure you want to remove this asset from your screener?</span>
              <span className="block">This action cannot be undone.</span>
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

