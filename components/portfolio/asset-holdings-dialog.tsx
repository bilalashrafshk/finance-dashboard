"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Edit2, Trash2 } from "lucide-react"
import type { Holding } from "@/lib/portfolio/types"
import { formatCurrency, calculateInvested, calculateCurrentValue, calculateGainLoss, calculateGainLossPercent } from "@/lib/portfolio/portfolio-utils"
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

interface AssetHoldingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  holdings: Holding[]
  assetName: string
  symbol: string
  onEdit?: (holding: Holding) => void
  onDelete?: (id: string) => void
}

export function AssetHoldingsDialog({
  open,
  onOpenChange,
  holdings,
  assetName,
  symbol,
  onEdit,
  onDelete,
}: AssetHoldingsDialogProps) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  if (holdings.length === 0) {
    return null
  }

  // Calculate combined totals
  const totalQuantity = holdings.reduce((sum, h) => sum + h.quantity, 0)
  const totalInvested = holdings.reduce((sum, h) => sum + calculateInvested(h), 0)
  const totalCurrentValue = holdings.reduce((sum, h) => sum + calculateCurrentValue(h), 0)
  const totalGainLoss = totalCurrentValue - totalInvested
  const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0
  const averagePurchasePrice = totalQuantity > 0 ? totalInvested / totalQuantity : 0
  const currentPrice = holdings[0]?.currentPrice || 0
  const currency = holdings[0]?.currency || 'USD'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{assetName} ({symbol.toUpperCase()})</DialogTitle>
            <DialogDescription>
              Individual holdings and transaction history
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Summary Card */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <div className="text-sm text-muted-foreground">Total Quantity</div>
                <div className="text-lg font-semibold">{totalQuantity.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Avg. Purchase Price</div>
                <div className="text-lg font-semibold">{formatCurrency(averagePurchasePrice, currency)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Current Price</div>
                <div className="text-lg font-semibold">{formatCurrency(currentPrice, currency)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Gain/Loss</div>
                <div className={`text-lg font-semibold ${totalGainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatCurrency(totalGainLoss, currency)} ({totalGainLossPercent >= 0 ? '+' : ''}{totalGainLossPercent.toFixed(2)}%)
                </div>
              </div>
            </div>

            {/* Holdings Table */}
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Purchase Date</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Purchase Price</TableHead>
                    <TableHead className="text-right">Invested</TableHead>
                    <TableHead className="text-right">Current Value</TableHead>
                    <TableHead className="text-right">Gain/Loss</TableHead>
                    <TableHead className="text-right">Gain/Loss %</TableHead>
                    {(onEdit || onDelete) && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.map((holding) => {
                    const invested = calculateInvested(holding)
                    const currentValue = calculateCurrentValue(holding)
                    const gainLoss = calculateGainLoss(holding)
                    const gainLossPercent = calculateGainLossPercent(holding)

                    return (
                      <TableRow key={holding.id}>
                        <TableCell>
                          {new Date(holding.purchaseDate).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="text-right">{holding.quantity.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{formatCurrency(holding.purchasePrice, holding.currency)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(invested, holding.currency)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(currentValue, holding.currency)}</TableCell>
                        <TableCell className={`text-right font-semibold ${gainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {formatCurrency(gainLoss, holding.currency)}
                        </TableCell>
                        <TableCell className={`text-right ${gainLossPercent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {gainLossPercent >= 0 ? '+' : ''}{gainLossPercent.toFixed(2)}%
                        </TableCell>
                        {(onEdit || onDelete) && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {onEdit && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    onEdit(holding)
                                    onOpenChange(false)
                                  }}
                                  title="Edit holding"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              )}
                              {onDelete && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteConfirmId(holding.id)}
                                  title="Delete holding"
                                  className="hover:bg-red-50 dark:hover:bg-red-950/20"
                                >
                                  <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this holding from your portfolio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirmId && onDelete) {
                  onDelete(deleteConfirmId)
                  setDeleteConfirmId(null)
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

