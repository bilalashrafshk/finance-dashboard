"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, type AssetType } from "@/lib/portfolio/types"

interface AssetTypeSelectorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (assetType: AssetType) => void
}

export function AssetTypeSelectorDialog({ open, onOpenChange, onSelect }: AssetTypeSelectorDialogProps) {
  const standardAssetTypes: AssetType[] = ['us-equity', 'pk-equity', 'crypto', 'metals', 'kse100', 'spx500']
  const specialAssetTypes: AssetType[] = ['cash', 'fd', 'commodities']

  const handleSelect = (assetType: AssetType) => {
    onSelect(assetType)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select Asset Type</DialogTitle>
          <DialogDescription>
            Choose the type of asset you want to add to your portfolio
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div>
            <h3 className="text-sm font-medium mb-3">Standard Assets</h3>
            <div className="grid grid-cols-2 gap-2">
              {standardAssetTypes.map((assetType) => (
                <Button
                  key={assetType}
                  variant="outline"
                  onClick={() => handleSelect(assetType)}
                  className="justify-start h-auto py-3"
                  style={{
                    borderColor: ASSET_TYPE_COLORS[assetType],
                  }}
                >
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: ASSET_TYPE_COLORS[assetType] }}
                  />
                  {ASSET_TYPE_LABELS[assetType]}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">Special Assets</h3>
            <div className="grid grid-cols-3 gap-2">
              {specialAssetTypes.map((assetType) => (
                <Button
                  key={assetType}
                  variant="outline"
                  onClick={() => handleSelect(assetType)}
                  className="justify-start h-auto py-3"
                  style={{
                    borderColor: ASSET_TYPE_COLORS[assetType],
                  }}
                >
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: ASSET_TYPE_COLORS[assetType] }}
                  />
                  {ASSET_TYPE_LABELS[assetType]}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

