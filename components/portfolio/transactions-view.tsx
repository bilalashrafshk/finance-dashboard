"use client"

import { useState, useEffect, useMemo, Fragment } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { TrendingUp, TrendingDown, Plus, Minus, Loader2, Edit2, Trash2 } from "lucide-react"
import { formatCurrency, calculateInvested, calculateCurrentValue, calculateGainLoss, calculateGainLossPercent } from "@/lib/portfolio/portfolio-utils"
import { ASSET_TYPE_LABELS } from "@/lib/portfolio/types"
import type { AssetType } from "@/lib/portfolio/types"
import { SellHoldingDialog } from "./sell-holding-dialog"
import { AddTransactionDialog } from "./add-transaction-dialog"
import type { Holding } from "@/lib/portfolio/types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { addTransaction, updateTransaction, deleteTransaction, type Trade as TradeType } from "@/lib/portfolio/portfolio-db-storage"
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
  assetType: string
  symbol: string
  name: string
  quantity: number
  price: number
  totalAmount: number
  currency: string
  tradeDate: string
  notes: string | null
}

interface TransactionsViewProps {
  holdings: Holding[]
  onSell?: (holding: Holding, quantity: number, price: number, date: string, fees?: number, notes?: string) => Promise<void>
  onEdit?: (holding: Holding) => void
  onDelete?: (id: string) => void
  selectedAsset?: { assetType: string; symbol: string; currency: string; name?: string } | null
  onClearAssetFilter?: () => void
  onHoldingsUpdate?: () => void // Callback to refresh holdings after transaction changes
}

export function TransactionsView({ 
  holdings, 
  onSell, 
  onEdit, 
  onDelete,
  selectedAsset,
  onClearAssetFilter,
  onHoldingsUpdate
}: TransactionsViewProps) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(false)
  const [currencyFilter, setCurrencyFilter] = useState<string>('all')
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>('all')
  const [sellingHolding, setSellingHolding] = useState<Holding | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false)
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null)

  // Get unique currencies and asset types
  const currencies = useMemo(() => {
    const unique = new Set<string>()
    trades.forEach(t => unique.add(t.currency))
    return Array.from(unique).sort()
  }, [trades])

  const assetTypes = useMemo(() => {
    const unique = new Set<string>()
    trades.forEach(t => unique.add(t.assetType))
    return Array.from(unique).sort()
  }, [trades])

  // Load transactions
  useEffect(() => {
    loadTransactions()
  }, [selectedAsset]) // Reload when selected asset changes

  const loadTransactions = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setLoading(false)
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
          setTrades(data.trades)
        }
      }
    } catch (error) {
      console.error('Error loading transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter transactions
  const filteredTrades = useMemo(() => {
    let filtered = trades

    // Filter by selected asset if provided
    if (selectedAsset) {
      filtered = filtered.filter(t => 
        t.assetType === selectedAsset.assetType &&
        t.symbol.toUpperCase() === selectedAsset.symbol.toUpperCase() &&
        t.currency === selectedAsset.currency
      )
    }

    // Filter by currency
    if (currencyFilter !== 'all') {
      filtered = filtered.filter(t => t.currency === currencyFilter)
    }

    // Filter by asset type
    if (assetTypeFilter !== 'all') {
      filtered = filtered.filter(t => t.assetType === assetTypeFilter)
    }

    return filtered.sort((a, b) => {
      // Sort by date descending (newest first)
      return new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime()
    })
  }, [trades, currencyFilter, assetTypeFilter, selectedAsset])

  const getTradeTypeIcon = (tradeType: string) => {
    if (tradeType === 'buy' || tradeType === 'add') {
      return <TrendingUp className="h-3 w-3" />
    }
    if (tradeType === 'sell' || tradeType === 'remove') {
      return <TrendingDown className="h-3 w-3" />
    }
    return <Minus className="h-3 w-3" />
  }

  const getTradeTypeColor = (tradeType: string) => {
    if (tradeType === 'buy' || tradeType === 'add') {
      return 'text-green-600 dark:text-green-400'
    }
    if (tradeType === 'sell' || tradeType === 'remove') {
      return 'text-red-600 dark:text-red-400'
    }
    return ''
  }

  // Get holdings for sell action
  const getHoldingForTrade = (trade: Trade): Holding | null => {
    if (trade.tradeType === 'sell' || trade.tradeType === 'remove') {
      return null // Can't sell from a sell transaction
    }
    
    // Find matching holding
    const holding = holdings.find(h => 
      h.assetType === trade.assetType &&
      h.symbol.toUpperCase() === trade.symbol.toUpperCase() &&
      h.currency === trade.currency
    )
    
    return holding || null
  }

  // Get holdings for selected asset
  const assetHoldings = useMemo(() => {
    if (!selectedAsset) return []
    return holdings.filter(h =>
      h.assetType === selectedAsset.assetType &&
      h.symbol.toUpperCase() === selectedAsset.symbol.toUpperCase() &&
      h.currency === selectedAsset.currency
    )
  }, [holdings, selectedAsset])

  // Calculate combined totals for selected asset
  const assetTotals = useMemo(() => {
    if (assetHoldings.length === 0) return null
    const totalQuantity = assetHoldings.reduce((sum, h) => sum + h.quantity, 0)
    const totalInvested = assetHoldings.reduce((sum, h) => sum + calculateInvested(h), 0)
    const totalCurrentValue = assetHoldings.reduce((sum, h) => sum + calculateCurrentValue(h), 0)
    const totalGainLoss = totalCurrentValue - totalInvested
    const totalGainLossPercent = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0
    const averagePurchasePrice = totalQuantity > 0 ? totalInvested / totalQuantity : 0
    const currentPrice = assetHoldings[0]?.currentPrice || 0
    const currency = assetHoldings[0]?.currency || 'USD'
    
    return {
      totalQuantity,
      totalInvested,
      totalCurrentValue,
      totalGainLoss,
      totalGainLossPercent,
      averagePurchasePrice,
      currentPrice,
      currency,
    }
  }, [assetHoldings])

  return (
    <Fragment>
      <div className="space-y-4">
        {/* Show loading indicator only when loading, but don't block the UI */}
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
            <span className="text-sm text-muted-foreground">Loading transactions...</span>
          </div>
        )}
        {/* Asset Summary and Clear Filter (when asset is selected) */}
        {selectedAsset && assetTotals && (
          <Fragment>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg mb-4">
              <div>
                <div className="font-semibold">{selectedAsset.name || selectedAsset.symbol} ({selectedAsset.symbol.toUpperCase()})</div>
                <div className="text-sm text-muted-foreground">
                  {ASSET_TYPE_LABELS[selectedAsset.assetType as AssetType]} • {selectedAsset.currency}
                </div>
              </div>
              {onClearAssetFilter && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClearAssetFilter}
                >
                  Clear Filter
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <div className="text-sm text-muted-foreground">Total Quantity</div>
                <div className="text-lg font-semibold">{assetTotals.totalQuantity.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Avg. Purchase Price</div>
                <div className="text-lg font-semibold">{formatCurrency(assetTotals.averagePurchasePrice, assetTotals.currency)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Current Price</div>
                <div className="text-lg font-semibold">{formatCurrency(assetTotals.currentPrice, assetTotals.currency)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Gain/Loss</div>
                <div className={`text-lg font-semibold ${assetTotals.totalGainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatCurrency(assetTotals.totalGainLoss, assetTotals.currency)} ({assetTotals.totalGainLossPercent >= 0 ? '+' : ''}{assetTotals.totalGainLossPercent.toFixed(2)}%)
                </div>
              </div>
            </div>
          </Fragment>
        )}

        {/* Holdings and Transactions Tabs (when asset is selected) */}
        {selectedAsset ? (
          <Tabs defaultValue="holdings" className="w-full">
            <TabsList>
              <TabsTrigger value="holdings">Holdings</TabsTrigger>
              <TabsTrigger value="transactions">Transaction History</TabsTrigger>
            </TabsList>

            <TabsContent value="holdings" className="space-y-4">
              {assetHoldings.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  No holdings found
                </div>
              ) : (
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
                        {(onEdit || onSell) && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assetHoldings.map((holding) => {
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
                            {(onEdit || onSell) && (
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
                                      onClick={() => onEdit(holding)}
                                      title="Edit holding"
                                    >
                                      <Edit2 className="h-4 w-4" />
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
              )}
            </TabsContent>

            <TabsContent value="transactions" className="space-y-4">
              {filteredTrades.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  No transactions found for {selectedAsset.symbol}
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
                        {filteredTrades.some(t => t.tradeType === 'sell') && (
                          <TableHead className="text-right">Realized P&L</TableHead>
                        )}
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTrades.map((trade) => {
                        const isBuy = trade.tradeType === 'buy' || trade.tradeType === 'add'
                        // Extract realized PnL from notes if present
                        const realizedPnLMatch = trade.notes?.match(/Realized P&L: ([\d.-]+)/)
                        const realizedPnL = realizedPnLMatch ? parseFloat(realizedPnLMatch[1]) : null
                        
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
                                className={getTradeTypeColor(trade.tradeType)}
                              >
                                {getTradeTypeIcon(trade.tradeType)}
                                <span className="ml-1">{trade.tradeType.toUpperCase()}</span>
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {isBuy ? '+' : '-'}{trade.quantity.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(trade.price, trade.currency)}
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${getTradeTypeColor(trade.tradeType)}`}>
                              {isBuy ? '+' : '-'}{formatCurrency(trade.totalAmount, trade.currency)}
                            </TableCell>
                            {filteredTrades.some(t => t.tradeType === 'sell') && (
                              <TableCell className={`text-right font-semibold ${realizedPnL !== null ? (realizedPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400') : ''}`}>
                                {realizedPnL !== null ? (
                                  <>
                                    {realizedPnL >= 0 ? '+' : ''}{formatCurrency(realizedPnL, trade.currency)}
                                  </>
                                ) : (
                                  '—'
                                )}
                              </TableCell>
                            )}
                            <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                              {trade.notes?.replace(/Realized P&L: [\d.-]+ [A-Z]+\.?/g, '').trim() || '—'}
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
        ) : (
          <Fragment>
            {/* Add Transaction Button and Filters */}
            <div className="flex items-center justify-between mb-4">
              <Button onClick={() => setIsAddTransactionOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Transaction
              </Button>
            </div>
            
            {/* Filters */}
            <div className="flex gap-4 items-center mb-4">
              <div className="flex-1">
                <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Currencies</SelectItem>
                    {currencies.map(currency => (
                      <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Select value={assetTypeFilter} onValueChange={setAssetTypeFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by asset type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Asset Types</SelectItem>
                    {assetTypes.map(type => (
                      <SelectItem key={type} value={type}>
                        {ASSET_TYPE_LABELS[type as AssetType] || type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* All Transactions Table */}
            {filteredTrades.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            {selectedAsset 
              ? `No transactions found for ${selectedAsset.symbol}`
              : 'No transactions found'}
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  {filteredTrades.some(t => t.tradeType === 'sell') && (
                    <TableHead className="text-right">Realized P&L</TableHead>
                  )}
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrades.map((trade) => {
                  const isBuy = trade.tradeType === 'buy' || trade.tradeType === 'add'
                  const holding = getHoldingForTrade(trade)
                  // Extract realized PnL from notes if present
                  const realizedPnLMatch = trade.notes?.match(/Realized P&L: ([\d.-]+)/)
                  const realizedPnL = realizedPnLMatch ? parseFloat(realizedPnLMatch[1]) : null

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
                          className={getTradeTypeColor(trade.tradeType)}
                        >
                          {getTradeTypeIcon(trade.tradeType)}
                          <span className="ml-1">{trade.tradeType.toUpperCase()}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {ASSET_TYPE_LABELS[trade.assetType as AssetType] || trade.assetType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{trade.symbol.toUpperCase()}</TableCell>
                      <TableCell className="text-right">
                        {isBuy ? '+' : '-'}{trade.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(trade.price, trade.currency)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${getTradeTypeColor(trade.tradeType)}`}>
                        {isBuy ? '+' : '-'}{formatCurrency(trade.totalAmount, trade.currency)}
                      </TableCell>
                      {filteredTrades.some(t => t.tradeType === 'sell') && (
                        <TableCell className={`text-right font-semibold ${realizedPnL !== null ? (realizedPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400') : ''}`}>
                          {realizedPnL !== null ? (
                            <>
                              {realizedPnL >= 0 ? '+' : ''}{formatCurrency(realizedPnL, trade.currency)}
                            </>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {trade.notes?.replace(/Realized P&L: [\d.-]+ [A-Z]+\.?/g, '').trim() || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingTrade(trade)}
                            title="Edit transaction"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirmId(trade.id.toString())}
                            title="Delete transaction"
                            className="hover:bg-red-50 dark:hover:bg-red-950/20"
                          >
                            <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
          </Fragment>
        )}
      </div>

      {/* Add/Edit Transaction Dialog */}
      <AddTransactionDialog
        open={isAddTransactionOpen || editingTrade !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddTransactionOpen(false)
            setEditingTrade(null)
          }
        }}
        onSave={async (tradeData) => {
          try {
          if (editingTrade) {
            await updateTransaction(editingTrade.id, tradeData)
          } else {
              await addTransaction(tradeData as any)
          }
          loadTransactions()
          // Refresh holdings immediately after transaction change
          if (onHoldingsUpdate) {
            onHoldingsUpdate()
          }
          setIsAddTransactionOpen(false)
          setEditingTrade(null)
          } catch (error) {
            console.error('Error saving transaction:', error)
            // Re-throw to let the dialog handle it (e.g. stop loading state)
            throw error
          }
        }}
        editingTrade={editingTrade}
        holdings={holdings}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this transaction and may affect your holdings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteConfirmId) {
                  await deleteTransaction(parseInt(deleteConfirmId))
                  setDeleteConfirmId(null)
                  loadTransactions()
                  // Refresh holdings immediately after transaction deletion
                  if (onHoldingsUpdate) {
                    onHoldingsUpdate()
                  }
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Fragment>
  )
}

