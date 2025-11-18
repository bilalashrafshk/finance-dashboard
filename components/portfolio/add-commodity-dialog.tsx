"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { RefreshCw } from "lucide-react"
import type { Holding } from "@/lib/portfolio/types"

interface AddCommodityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (holding: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>) => void
  editingHolding?: Holding | null
}

export function AddCommodityDialog({ open, onOpenChange, onSave, editingHolding }: AddCommodityDialogProps) {
  const [commodityName, setCommodityName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [buyingRate, setBuyingRate] = useState('')
  const [currentRate, setCurrentRate] = useState('')
  const [buyingDate, setBuyingDate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (editingHolding) {
      setCommodityName(editingHolding.name)
      setQuantity(editingHolding.quantity.toString())
      setBuyingRate(editingHolding.purchasePrice.toString())
      setCurrentRate(editingHolding.currentPrice.toString())
      setBuyingDate(editingHolding.purchaseDate)
      setCurrency(editingHolding.currency)
      setNotes(editingHolding.notes || '')
    } else {
      setCommodityName('')
      setQuantity('')
      setBuyingRate('')
      setCurrentRate('')
      setBuyingDate(new Date().toISOString().split('T')[0])
      setCurrency('USD')
      setNotes('')
    }
  }, [editingHolding, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const holding: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'> = {
      assetType: 'commodities',
      symbol: commodityName.toUpperCase().trim(),
      name: commodityName.trim(),
      quantity: parseFloat(quantity) || 0,
      purchasePrice: parseFloat(buyingRate) || 0,
      purchaseDate: buyingDate || new Date().toISOString().split('T')[0],
      currentPrice: parseFloat(currentRate) || 0,
      currency: currency.trim(),
      notes: notes.trim() || undefined,
    }

    // Store initial buying rate and current rate in historical_price_data
    if (!editingHolding) {
      try {
        await fetch('/api/commodity/price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: commodityName.toUpperCase().trim(),
            date: buyingDate,
            price: parseFloat(buyingRate) || 0,
          }),
        })
        
        // Store current rate for today
        const today = new Date().toISOString().split('T')[0]
        if (today !== buyingDate) {
          await fetch('/api/commodity/price', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbol: commodityName.toUpperCase().trim(),
              date: today,
              price: parseFloat(currentRate) || 0,
            }),
          })
        }
      } catch (error) {
        console.error('Error storing commodity prices:', error)
        // Continue anyway - the holding will be saved
      }
    }

    onSave(holding)
    onOpenChange(false)
  }

  const handleUpdateCurrentRate = async () => {
    if (!commodityName || !currentRate) return
    
    try {
      const today = new Date().toISOString().split('T')[0]
      const response = await fetch('/api/commodity/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: commodityName.toUpperCase().trim(),
          date: today,
          price: parseFloat(currentRate) || 0,
        }),
      })
      
      if (response.ok) {
        // Update the holding's current price if editing
        if (editingHolding) {
          // This will be handled by the parent component when it refreshes
        }
      }
    } catch (error) {
      console.error('Error updating commodity price:', error)
    }
  }

  const isFormValid = commodityName.trim() && 
                     quantity && parseFloat(quantity) > 0 &&
                     buyingRate && parseFloat(buyingRate) > 0 &&
                     currentRate && parseFloat(currentRate) > 0 &&
                     buyingDate

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingHolding ? 'Edit Commodity' : 'Add Commodity'}</DialogTitle>
          <DialogDescription>
            {editingHolding ? 'Update your commodity holding. You can update the current rate to track price changes over time.' : 'Add a commodity to your portfolio. Enter buying rate and current rate.'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="commodityName">Commodity Name *</Label>
                <Input
                  id="commodityName"
                  value={commodityName}
                  onChange={(e) => setCommodityName(e.target.value)}
                  placeholder="e.g., Oil, Wheat, Coffee, Gold"
                  required
                />
              </div>

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
                  placeholder="0"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="buyingRate">Buying Rate *</Label>
                <Input
                  id="buyingRate"
                  type="number"
                  step="any"
                  value={buyingRate}
                  onChange={(e) => setBuyingRate(e.target.value)}
                  placeholder="0.00"
                  required
                />
                <p className="text-xs text-muted-foreground">Price per unit when purchased</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currentRate">Current Rate *</Label>
                <div className="flex gap-2">
                  <Input
                    id="currentRate"
                    type="number"
                    step="any"
                    value={currentRate}
                    onChange={(e) => setCurrentRate(e.target.value)}
                    placeholder="0.00"
                    required
                    className="flex-1"
                  />
                  {editingHolding && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleUpdateCurrentRate}
                      title="Update current rate and save to history"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Current price per unit</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="buyingDate">Buying Date *</Label>
              <Input
                id="buyingDate"
                type="date"
                value={buyingDate}
                onChange={(e) => setBuyingDate(e.target.value)}
                required
              />
            </div>

            {editingHolding && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  💡 <strong>Tip:</strong> Use the refresh button next to Current Rate to update the price and save it to your price history.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes (e.g., grade, quality, storage location)..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid}>
              {editingHolding ? 'Update' : 'Add'} Commodity
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

