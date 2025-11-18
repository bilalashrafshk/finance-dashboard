"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Holding } from "@/lib/portfolio/types"

interface AddCashDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (holding: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>) => void
  editingHolding?: Holding | null
}

export function AddCashDialog({ open, onOpenChange, onSave, editingHolding }: AddCashDialogProps) {
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (editingHolding) {
      setAmount(editingHolding.quantity.toString())
      setCurrency(editingHolding.currency)
      setNotes(editingHolding.notes || '')
    } else {
      setAmount('')
      setCurrency('USD')
      setNotes('')
    }
  }, [editingHolding, open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const holding: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'> = {
      assetType: 'cash',
      symbol: 'CASH',
      name: `Cash (${currency})`,
      quantity: parseFloat(amount) || 0,
      purchasePrice: 1, // Cash is always 1:1
      purchaseDate: new Date().toISOString().split('T')[0],
      currentPrice: 1, // Cash is always 1:1
      currency: currency.trim(),
      notes: notes.trim() || undefined,
    }

    onSave(holding)
    onOpenChange(false)
  }

  const isFormValid = amount && parseFloat(amount) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editingHolding ? 'Edit Cash' : 'Add Cash'}</DialogTitle>
          <DialogDescription>
            {editingHolding ? 'Update your cash holding.' : 'Add cash to your portfolio.'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
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

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes (e.g., location, account type)..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid}>
              {editingHolding ? 'Update' : 'Add'} Cash
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

