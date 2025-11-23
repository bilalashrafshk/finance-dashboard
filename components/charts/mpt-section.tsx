"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { MPTPortfolioView } from "@/components/asset-screener/mpt-portfolio-view"
import { RiskFreeRateSettings, loadRiskFreeRates, type RiskFreeRates } from "@/components/asset-screener/risk-free-rate-settings"
import type { TrackedAsset } from "@/components/asset-screener/add-asset-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Plus } from "lucide-react"
import { LoginDialog } from "@/components/auth/login-dialog"
import { RegisterDialog } from "@/components/auth/register-dialog"
import { Button } from "@/components/ui/button"
import { MPTAssetSelector } from "./mpt-asset-selector"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function MPTSection() {
  const { user, loading: authLoading } = useAuth()
  const [assets, setAssets] = useState<TrackedAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [riskFreeRates, setRiskFreeRates] = useState<RiskFreeRates>(loadRiskFreeRates())
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)

  useEffect(() => {
    if (!authLoading && user) {
      loadAssets()
    } else if (!authLoading && !user) {
      setLoading(false)
    }
  }, [authLoading, user])

  const loadAssets = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setAssets([])
        return
      }

      const response = await fetch('/api/user/tracked-assets', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setAssets(data.assets)
        }
      } else if (response.status === 401) {
        setAssets([])
      }
    } catch (error) {
      console.error('Error loading assets:', error)
      setAssets([])
    } finally {
      setLoading(false)
    }
  }

  const handleAssetAdded = (asset: TrackedAsset) => {
    setAssets(prev => [...prev, asset])
    setIsAddDialogOpen(false)
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Modern Portfolio Theory</CardTitle>
          <CardDescription>
            Optimize your portfolio using Modern Portfolio Theory. Sign in to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <LoginDialog>
              <Button>Login</Button>
            </LoginDialog>
            <RegisterDialog>
              <Button variant="outline">Sign Up</Button>
            </RegisterDialog>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Modern Portfolio Theory</h2>
          <p className="text-muted-foreground">
            Optimize your portfolio allocation using Modern Portfolio Theory algorithms.
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Assets
        </Button>
      </div>

      <RiskFreeRateSettings onRatesChange={setRiskFreeRates} />

      {assets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No assets in your list. Add assets to use Modern Portfolio Theory optimization.
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Assets
            </Button>
          </CardContent>
        </Card>
      ) : (
        <MPTPortfolioView assets={assets} />
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Assets for MPT Analysis</DialogTitle>
            <DialogDescription>
              Search and add assets from PK equities, US equities, or crypto to your list.
            </DialogDescription>
          </DialogHeader>
          <MPTAssetSelector
            onAssetAdded={handleAssetAdded}
            existingAssets={assets}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

