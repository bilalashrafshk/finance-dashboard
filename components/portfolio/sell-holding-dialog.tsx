"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Holding } from "@/lib/portfolio/types"
import { formatCurrency } from "@/lib/portfolio/portfolio-utils"

interface SellHoldingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  holding: Holding | null
  onSell: (holding: Holding, quantity: number, price: number, date: string, fees?: number, notes?: string) => Promise<void>
}

export function SellHoldingDialog({ open, onOpenChange, holding, onSell }: SellHoldingDialogProps) {
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState('')
  const [fees, setFees] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (holding && open) {
      setQuantity('')
      setPrice(holding.currentPrice.toString())
      setDate(new Date().toISOString().split('T')[0])
      setFees('')
      setNotes('')
      setError(null)
    }
  }, [holding, open])

  if (!holding) return null

  const maxQuantity = holding.quantity
  const quantityNum = parseFloat(quantity) || 0
  const priceNum = parseFloat(price) || 0
  const feesNum = parseFloat(fees) || 0
  const proceeds = quantityNum * priceNum - feesNum
  const purchasePrice = holding.purchasePrice
  const realizedPnL = (priceNum - purchasePrice) * quantityNum - feesNum
  const realizedPnLPercent = purchasePrice > 0 ? ((priceNum - purchasePrice) / purchasePrice) * 100 : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!quantity || quantityNum <= 0) {
      setError('Please enter a valid quantity')
      return
    }

    if (quantityNum > maxQuantity) {
      setError(`Cannot sell more than ${maxQuantity.toLocaleString()} shares`)
      return
    }

    if (!price || priceNum <= 0) {
      setError('Please enter a valid sell price')
      return
    }

    if (!date) {
      setError('Please select a sell date')
      return
    }

    setIsSubmitting(true)
    try {
      await onSell(
        holding,
        quantityNum,
        priceNum,
        date,
        feesNum > 0 ? feesNum : undefined,
        notes.trim() || undefined
      )
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || 'Failed to sell holding')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isFormValid = quantity && quantityNum > 0 && quantityNum <= maxQuantity && price && priceNum > 0 && date

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sell {holding.symbol}</DialogTitle>
          <DialogDescription>
            Sell shares of {holding.name || holding.symbol}. Proceeds will be added to Cash ({holding.currency}).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Current Holding Info */}
            <div className="p-3 bg-muted rounded-lg space-y-1">
              <div className="text-sm text-muted-foreground">Available to Sell</div>
              <div className="text-lg font-semibold">{maxQuantity.toLocaleString()} shares</div>
              <div className="text-xs text-muted-foreground">
                Avg. Purchase Price: {formatCurrency(purchasePrice, holding.currency)}
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity to Sell *</Label>
              <Input
                id="quantity"
                type="number"
                step="any"
                min="0"
                max={maxQuantity}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                required
              />
              <div className="text-xs text-muted-foreground">
                Max: {maxQuantity.toLocaleString()} shares
              </div>
            </div>

            {/* Sell Price */}
            <div className="space-y-2">
              <Label htmlFor="price">Sell Price per Share *</Label>
              <Input
                id="price"
                type="number"
                step="any"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                required
              />
              <div className="text-xs text-muted-foreground">
                Current Price: {formatCurrency(holding.currentPrice, holding.currency)}
              </div>
            </div>

            {/* Sell Date */}
            <div className="space-y-2">
              <Label htmlFor="date">Sell Date *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                required
              />
            </div>

            {/* Fees (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="fees">Fees/Commissions (Optional)</Label>
              <Input
                id="fees"
                type="number"
                step="any"
                min="0"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this sale..."
                rows={2}
              />
            </div>

            {/* Preview */}
            {isFormValid && (
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Proceeds:</span>
                  <span className="font-semibold">{formatCurrency(proceeds, holding.currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Realized P&L:</span>
                  <span className={`font-semibold ${realizedPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatCurrency(realizedPnL, holding.currency)} ({realizedPnLPercent >= 0 ? '+' : ''}{realizedPnLPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid || isSubmitting}>
              {isSubmitting ? 'Selling...' : 'Sell'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

