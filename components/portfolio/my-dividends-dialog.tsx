"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MyDividends } from "./my-dividends"
import type { Holding } from "@/lib/portfolio/types"

interface MyDividendsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  holdings: Holding[]
  currency?: string
}

export function MyDividendsDialog({ open, onOpenChange, holdings, currency = 'PKR' }: MyDividendsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>My Dividends</DialogTitle>
          <DialogDescription>
            Detailed dividend information for your PK equity holdings
          </DialogDescription>
        </DialogHeader>
        <MyDividends holdings={holdings} currency={currency} hideCard={true} />
      </DialogContent>
    </Dialog>
  )
}

