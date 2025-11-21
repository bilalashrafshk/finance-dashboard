"use client"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"
import { CryptoSelector } from "./crypto-selector"
import { MetalsSelector } from "./metals-selector"
import type { AssetType } from "@/lib/portfolio/types"
import { ASSET_TYPE_LABELS } from "@/lib/portfolio/types"
import { formatSymbolForDisplay, parseSymbolToBinance } from "@/lib/portfolio/binance-api"
import { formatMetalForDisplay } from "@/lib/portfolio/metals-api"
import type { Holding } from "@/lib/portfolio/types"
import { combineHoldingsByAsset } from "@/lib/portfolio/portfolio-utils"

interface Trade {
  id: number
  tradeType: 'buy' | 'sell' | 'add'
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

interface AddTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (trade: Omit<Trade, 'id'>) => Promise<void>
  editingTrade?: Trade | null
  holdings?: Holding[] // Holdings to show when selling
}

export function AddTransactionDialog({ open, onOpenChange, onSave, editingTrade, holdings = [] }: AddTransactionDialogProps) {
  const [tradeType, setTradeType] = useState<'buy' | 'sell' | 'add'>('buy')
  const [assetType, setAssetType] = useState<AssetType>('us-equity')
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().split('T')[0])
  const [currency, setCurrency] = useState('USD')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedHoldingId, setSelectedHoldingId] = useState<string>('')

  useEffect(() => {
    if (editingTrade) {
      setTradeType(editingTrade.tradeType)
      setAssetType(editingTrade.assetType as AssetType)
      setSymbol(editingTrade.symbol)
      setName(editingTrade.name)
      setQuantity(editingTrade.quantity.toString())
      setPrice(editingTrade.price.toString())
      setTradeDate(editingTrade.tradeDate)
      setCurrency(editingTrade.currency)
      setNotes(editingTrade.notes || '')
    } else {
      // Reset form
      setTradeType('buy')
      setAssetType('us-equity')
      setSymbol('')
      setName('')
      setQuantity('')
      setPrice('')
      setTradeDate(new Date().toISOString().split('T')[0])
      setCurrency('USD')
      setNotes('')
      setSelectedHoldingId('')
    }
  }, [editingTrade, open])

  // Get available holdings for sell (combined by asset) - show ALL holdings user owns
  const availableHoldings = useMemo(() => {
    if (tradeType !== 'sell' || holdings.length === 0) {
      return []
    }
    // Combine holdings by asset and show only those with quantity > 0
    const combined = combineHoldingsByAsset(holdings)
    return combined.filter(h => h.quantity > 0) // Only show holdings with quantity > 0
  }, [holdings, tradeType])

  // When holding is selected for sell, auto-fill fields
  useEffect(() => {
    if (tradeType === 'sell' && selectedHoldingId && availableHoldings.length > 0) {
      const holding = availableHoldings.find(h => h.id === selectedHoldingId)
      if (holding) {
        setAssetType(holding.assetType)
        setSymbol(holding.symbol)
        setName(holding.name)
        setCurrency(holding.currency)
        setPrice(holding.currentPrice.toString())
        // Don't auto-set quantity - let user enter how much to sell
      }
    }
  }, [selectedHoldingId, tradeType, availableHoldings])

  // Auto-set currency based on asset type (for buy/add, and when asset type changes)
  useEffect(() => {
    if (!editingTrade && open) {
      // For sell, currency is set when holding is selected, so skip auto-setting
      if (tradeType === 'sell' && selectedHoldingId) {
        return
      }
      
      // Auto-set currency based on asset type
      if (assetType === 'pk-equity' || assetType === 'kse100') {
        setCurrency('PKR')
        if (assetType === 'kse100') {
          setSymbol('KSE100')
          setName('KSE 100 Index')
        }
      } else if (assetType === 'us-equity' || assetType === 'spx500' || assetType === 'crypto' || assetType === 'metals' || assetType === 'commodities') {
        setCurrency('USD')
        if (assetType === 'spx500') {
          setSymbol('SPX500')
          setName('S&P 500 Index')
        }
      }
      // Cash and FD can be in any currency, don't auto-set
    }
  }, [assetType, editingTrade, open, tradeType, selectedHoldingId])

  const handleCryptoSelect = (crypto: string) => {
    setSymbol(crypto)
    const displayName = formatSymbolForDisplay(crypto)
    setName(displayName)
  }

  const handleMetalSelect = (metal: string) => {
    setSymbol(metal)
    const displayName = formatMetalForDisplay(metal)
    setName(displayName)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const quantityNum = parseFloat(quantity)
    const priceNum = parseFloat(price)
    
    if (!quantityNum || !priceNum || !symbol || !name || !tradeDate) {
      return
    }

    // Validate sell quantity doesn't exceed available
    if (tradeType === 'sell' && selectedHolding) {
      if (quantityNum > selectedHolding.quantity) {
        alert(`Cannot sell more than available. You have ${selectedHolding.quantity.toLocaleString()} ${selectedHolding.symbol.toUpperCase()}`)
        return
      }
    }

    const totalAmount = quantityNum * priceNum

    setSaving(true)
    try {
      await onSave({
        tradeType,
        assetType,
        symbol: symbol.toUpperCase(),
        name,
        quantity: quantityNum,
        price: priceNum,
        totalAmount,
        currency,
        tradeDate,
        notes: notes || null,
      })
      onOpenChange(false)
    } catch (error) {
      console.error('Error saving transaction:', error)
    } finally {
      setSaving(false)
    }
  }

  // Get selected holding for validation
  const selectedHolding = selectedHoldingId ? availableHoldings.find(h => h.id === selectedHoldingId) : null
  const maxQuantity = selectedHolding ? selectedHolding.quantity : Infinity
  const quantityNum = parseFloat(quantity) || 0
  const exceedsAvailable = tradeType === 'sell' && selectedHolding && quantityNum > maxQuantity

  const isFormValid = 
    symbol && 
    name && 
    quantity && 
    quantityNum > 0 &&
    !exceedsAvailable &&
    price && 
    parseFloat(price) > 0 &&
    tradeDate &&
    (tradeType !== 'sell' || selectedHoldingId) // For sell, must select a holding

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingTrade ? 'Edit Transaction' : 'Add Transaction'}</DialogTitle>
          <DialogDescription>
            {editingTrade 
              ? 'Update the transaction details.' 
              : 'Record a new transaction (buy, sell, or add cash/deposit).'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tradeType">Transaction Type *</Label>
                <Select value={tradeType} onValueChange={(value) => {
                  setTradeType(value as 'buy' | 'sell' | 'add')
                  setSelectedHoldingId('') // Reset holding selection when changing type
                }}>
                  <SelectTrigger id="tradeType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                    <SelectItem value="add">Add (Cash/Deposit)</SelectItem>
                  </SelectContent>
                </Select>
                {tradeType === 'add' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Add cash or deposits to your portfolio
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="assetType">Asset Type *</Label>
                {tradeType === 'sell' && selectedHoldingId ? (
                  <Input
                    id="assetType"
                    value={ASSET_TYPE_LABELS[assetType as AssetType]}
                    disabled
                    className="bg-muted cursor-not-allowed"
                    required
                  />
                ) : (
                  <Select value={assetType} onValueChange={(value) => setAssetType(value as AssetType)}>
                    <SelectTrigger id="assetType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ASSET_TYPE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currency">Currency *</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="PKR">PKR</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tradeDate">Transaction Date *</Label>
                <Input
                  id="tradeDate"
                  type="date"
                  value={tradeDate}
                  onChange={(e) => setTradeDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Show holdings selector when selling */}
            {tradeType === 'sell' && availableHoldings.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="holdingSelect">Select Holding to Sell *</Label>
                <Select value={selectedHoldingId} onValueChange={setSelectedHoldingId}>
                  <SelectTrigger id="holdingSelect">
                    <SelectValue placeholder="Select a holding to sell" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableHoldings.map((holding) => (
                      <SelectItem key={holding.id} value={holding.id}>
                        {holding.name || holding.symbol} ({holding.symbol.toUpperCase()}) - {holding.quantity.toLocaleString()} {ASSET_TYPE_LABELS[holding.assetType as AssetType]} - {holding.currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedHoldingId && (() => {
                  const selectedHolding = availableHoldings.find(h => h.id === selectedHoldingId)
                  return selectedHolding ? (
                    <p className="text-xs text-muted-foreground">
                      Available: {selectedHolding.quantity.toLocaleString()} {selectedHolding.symbol.toUpperCase()} at {selectedHolding.currentPrice.toLocaleString('en-US', { style: 'currency', currency: selectedHolding.currency, minimumFractionDigits: 2 })}
                    </p>
                  ) : null
                })()}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol/Ticker *</Label>
                {tradeType === 'sell' && selectedHoldingId ? (
                  <Input
                    id="symbol"
                    value={symbol}
                    disabled
                    className="bg-muted cursor-not-allowed"
                    required
                  />
                ) : assetType === 'crypto' ? (
                  <CryptoSelector
                    value={symbol}
                    onValueChange={handleCryptoSelect}
                  />
                ) : assetType === 'metals' ? (
                  <MetalsSelector
                    value={symbol}
                    onValueChange={handleMetalSelect}
                  />
                ) : assetType === 'kse100' || assetType === 'spx500' ? (
                  <Input
                    id="symbol"
                    value={symbol}
                    disabled
                    className="bg-muted cursor-not-allowed"
                    placeholder={assetType === 'kse100' ? 'KSE100' : 'SPX500'}
                    required
                  />
                ) : (
                  <Input
                    id="symbol"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder={
                      assetType === 'pk-equity'
                        ? 'PTC, HBL, UBL, etc.'
                        : assetType === 'cash'
                        ? 'CASH'
                        : 'AAPL, TSLA, etc.'
                    }
                    required
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                {tradeType === 'sell' && selectedHoldingId ? (
                  <Input
                    id="name"
                    value={name}
                    disabled
                    className="bg-muted cursor-not-allowed"
                    required
                  />
                ) : (
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Asset name"
                    required
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0.00"
                  max={tradeType === 'sell' && selectedHolding ? selectedHolding.quantity : undefined}
                  required
                />
                {tradeType === 'sell' && selectedHolding && (
                  <p className="text-xs text-muted-foreground">
                    Max: {selectedHolding.quantity.toLocaleString()} {selectedHolding.symbol.toUpperCase()}
                    {exceedsAvailable && (
                      <span className="text-red-600 dark:text-red-400 ml-2">
                        (Exceeds available quantity)
                      </span>
                    )}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Price per Unit *</Label>
                <Input
                  id="price"
                  type="number"
                  step="any"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Total Amount</Label>
                <div className="h-10 px-3 py-2 bg-muted rounded-md flex items-center">
                  {quantity && price && parseFloat(quantity) > 0 && parseFloat(price) > 0
                    ? (parseFloat(quantity) * parseFloat(price)).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : '0.00'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes about this transaction"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingTrade ? 'Update Transaction' : 'Add Transaction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

