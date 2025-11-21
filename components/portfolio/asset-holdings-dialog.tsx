"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Edit2, Trash2, TrendingUp, TrendingDown, Loader2 } from "lucide-react"
import type { Holding } from "@/lib/portfolio/types"
import { formatCurrency, calculateInvested, calculateCurrentValue, calculateGainLoss, calculateGainLossPercent } from "@/lib/portfolio/portfolio-utils"
import { SellHoldingDialog } from "./sell-holding-dialog"
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

interface Trade {
  id: number
  tradeType: 'buy' | 'sell' | 'add' | 'remove'
  quantity: number
  price: number
  totalAmount: number
  tradeDate: string
  notes: string | null
}

interface AssetHoldingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  holdings: Holding[]
  assetName: string
  symbol: string
  onEdit?: (holding: Holding) => void
  onDelete?: (id: string) => void
  onSell?: (holding: Holding, quantity: number, price: number, date: string, fees?: number) => void
}

export function AssetHoldingsDialog({
  open,
  onOpenChange,
  holdings,
  assetName,
  symbol,
  onEdit,
  onDelete,
  onSell,
}: AssetHoldingsDialogProps) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [loadingTrades, setLoadingTrades] = useState(false)
  const [sellingHolding, setSellingHolding] = useState<Holding | null>(null)
  const assetType = holdings[0]?.assetType || ''
  const currency = holdings[0]?.currency || 'USD'

  // Fetch transaction history when dialog opens
  useEffect(() => {
    if (open && holdings.length > 0) {
      loadTransactionHistory()
    }
  }, [open, holdings])

  const loadTransactionHistory = async () => {
    setLoadingTrades(true)
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setLoadingTrades(false)
        return
      }

      const response = await fetch('/api/user/trades', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          // Filter trades for this specific asset (assetType + symbol + currency)
          const assetTrades = data.trades.filter((trade: any) => 
            trade.assetType === assetType && 
            trade.symbol.toUpperCase() === symbol.toUpperCase() &&
            trade.currency === currency
          )
          setTrades(assetTrades)
        }
      }
    } catch (error) {
      console.error('Error loading transaction history:', error)
    } finally {
      setLoadingTrades(false)
    }
  }

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

          <Tabs defaultValue="holdings" className="w-full">
            <TabsList>
              <TabsTrigger value="holdings">Holdings</TabsTrigger>
              <TabsTrigger value="transactions">Transaction History</TabsTrigger>
            </TabsList>

            <TabsContent value="holdings" className="space-y-6">
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
                        {(onEdit || onDelete || onSell) && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {onSell && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSellingHolding(holding)}
                                  title="Sell holding"
                                  className="hover:bg-orange-50 dark:hover:bg-orange-950/20"
                                >
                                  <TrendingDown className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                                </Button>
                              )}
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
            </TabsContent>

            <TabsContent value="transactions" className="space-y-4">
              {loadingTrades ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : trades.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  No transaction history found
                </div>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Total Amount</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trades.map((trade) => {
                        const isBuy = trade.tradeType === 'buy' || trade.tradeType === 'add'
                        const isSell = trade.tradeType === 'sell' || trade.tradeType === 'remove'
                        
                        return (
                          <TableRow key={trade.id}>
                            <TableCell>
                              {new Date(trade.tradeDate).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant="outline" 
                                className={isBuy ? 'text-green-600 dark:text-green-400' : isSell ? 'text-red-600 dark:text-red-400' : ''}
                              >
                                {isBuy && <TrendingUp className="h-3 w-3 mr-1" />}
                                {isSell && <TrendingDown className="h-3 w-3 mr-1" />}
                                {trade.tradeType.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {isBuy ? '+' : '-'}{trade.quantity.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(trade.price, currency)}</TableCell>
                            <TableCell className={`text-right font-semibold ${isBuy ? 'text-green-600 dark:text-green-400' : isSell ? 'text-red-600 dark:text-red-400' : ''}`}>
                              {isBuy ? '+' : '-'}{formatCurrency(trade.totalAmount, currency)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {trade.notes || '—'}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
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

      {onSell && (
        <SellHoldingDialog
          open={sellingHolding !== null}
          onOpenChange={(open) => {
            if (!open) {
              setSellingHolding(null)
            }
          }}
          holding={sellingHolding}
          onSell={async (holding, quantity, price, date, fees, notes) => {
            await onSell(holding, quantity, price, date, fees, notes)
            setSellingHolding(null)
            // Reload transaction history
            loadTransactionHistory()
          }}
        />
      )}
    </>
  )
}

