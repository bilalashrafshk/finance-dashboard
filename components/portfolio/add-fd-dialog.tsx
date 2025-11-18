"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Holding } from "@/lib/portfolio/types"

interface AddFDDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (holding: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>) => void
  editingHolding?: Holding | null
}

export function AddFDDialog({ open, onOpenChange, onSave, editingHolding }: AddFDDialogProps) {
  const [principal, setPrincipal] = useState('')
  const [interestRate, setInterestRate] = useState('')
  const [startDate, setStartDate] = useState('')
  const [maturityDate, setMaturityDate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [bankName, setBankName] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (editingHolding) {
      setPrincipal(editingHolding.quantity.toString())
      setCurrency(editingHolding.currency)
      setNotes(editingHolding.notes || '')
      
      // Parse FD-specific data from notes or use defaults
      // For now, we'll store FD data in notes as JSON or parse it
      // In a production system, you'd have a separate table or JSONB column
      try {
        const fdData = editingHolding.notes ? JSON.parse(editingHolding.notes) : {}
        if (fdData.interestRate) setInterestRate(fdData.interestRate.toString())
        if (fdData.startDate) setStartDate(fdData.startDate)
        if (fdData.maturityDate) setMaturityDate(fdData.maturityDate)
        if (fdData.bankName) setBankName(fdData.bankName)
      } catch {
        // If notes is not JSON, try to extract from notes text
        const notesText = editingHolding.notes || ''
        // Simple parsing - in production, use structured storage
      }
    } else {
      setPrincipal('')
      setInterestRate('')
      setStartDate('')
      setMaturityDate('')
      setCurrency('USD')
      setBankName('')
      setNotes('')
    }
  }, [editingHolding, open])

  const calculateMaturityValue = () => {
    if (!principal || !interestRate || !startDate || !maturityDate) return null
    
    const principalAmount = parseFloat(principal)
    const rate = parseFloat(interestRate) / 100 // Convert percentage to decimal
    const start = new Date(startDate)
    const maturity = new Date(maturityDate)
    const daysDiff = Math.max(0, Math.floor((maturity.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
    const years = daysDiff / 365
    
    // Simple interest calculation
    const maturityValue = principalAmount * (1 + rate * years)
    return maturityValue
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const maturityValue = calculateMaturityValue() || parseFloat(principal) || 0
    
    // Store FD-specific data in notes as JSON
    const fdData = {
      interestRate: parseFloat(interestRate) || 0,
      startDate,
      maturityDate,
      bankName: bankName.trim() || undefined,
      additionalNotes: notes.trim() || undefined,
    }
    
    const holding: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'> = {
      assetType: 'fd',
      symbol: bankName.trim() || 'FD',
      name: `Fixed Deposit${bankName ? ` - ${bankName}` : ''}`,
      quantity: parseFloat(principal) || 0,
      purchasePrice: 1, // Principal amount
      purchaseDate: startDate || new Date().toISOString().split('T')[0],
      currentPrice: maturityValue, // Maturity value
      currency: currency.trim(),
      notes: JSON.stringify(fdData),
    }

    onSave(holding)
    onOpenChange(false)
  }

  const maturityValue = calculateMaturityValue()
  const isFormValid = principal && parseFloat(principal) > 0 && 
                     interestRate && parseFloat(interestRate) >= 0 &&
                     startDate && maturityDate &&
                     new Date(maturityDate) > new Date(startDate)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingHolding ? 'Edit Fixed Deposit' : 'Add Fixed Deposit'}</DialogTitle>
          <DialogDescription>
            {editingHolding ? 'Update your fixed deposit details.' : 'Add a fixed deposit to your portfolio.'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="principal">Principal Amount *</Label>
                <Input
                  id="principal"
                  type="number"
                  step="any"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="interestRate">Interest Rate (%) *</Label>
                <Input
                  id="interestRate"
                  type="number"
                  step="any"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bankName">Bank/Institution</Label>
                <Input
                  id="bankName"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maturityDate">Maturity Date *</Label>
                <Input
                  id="maturityDate"
                  type="date"
                  value={maturityDate}
                  onChange={(e) => setMaturityDate(e.target.value)}
                  min={startDate || undefined}
                  required
                />
              </div>
            </div>

            {maturityValue && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium">Estimated Maturity Value:</p>
                <p className="text-lg font-bold">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: currency,
                  }).format(maturityValue)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Based on simple interest calculation
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional additional notes..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid}>
              {editingHolding ? 'Update' : 'Add'} Fixed Deposit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

