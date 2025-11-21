"use client"

import { useState, useEffect } from "react"
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

interface AddTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (trade: Omit<Trade, 'id'>) => Promise<void>
  editingTrade?: Trade | null
}

export function AddTransactionDialog({ open, onOpenChange, onSave, editingTrade }: AddTransactionDialogProps) {
  const [tradeType, setTradeType] = useState<'buy' | 'sell' | 'add' | 'remove'>('buy')
  const [assetType, setAssetType] = useState<AssetType>('us-equity')
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().split('T')[0])
  const [currency, setCurrency] = useState('USD')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

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
    }
  }, [editingTrade, open])

  // Auto-set currency based on asset type
  useEffect(() => {
    if (!editingTrade && open) {
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
    }
  }, [assetType, editingTrade, open])

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

  const isFormValid = 
    symbol && 
    name && 
    quantity && 
    parseFloat(quantity) > 0 &&
    price && 
    parseFloat(price) > 0 &&
    tradeDate

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingTrade ? 'Edit Transaction' : 'Add Transaction'}</DialogTitle>
          <DialogDescription>
            {editingTrade 
              ? 'Update the transaction details.' 
              : 'Record a new transaction (buy, sell, add, or remove).'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tradeType">Transaction Type *</Label>
                <Select value={tradeType} onValueChange={(value) => setTradeType(value as 'buy' | 'sell' | 'add' | 'remove')}>
                  <SelectTrigger id="tradeType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                    <SelectItem value="add">Add (Cash/Deposit)</SelectItem>
                    <SelectItem value="remove">Remove (Withdrawal)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assetType">Asset Type *</Label>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol/Ticker *</Label>
                {assetType === 'crypto' ? (
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
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Asset name"
                  required
                />
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
                  required
                />
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

