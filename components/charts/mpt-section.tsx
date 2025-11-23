"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { MPTPortfolioView } from "@/components/asset-screener/mpt-portfolio-view"
import { RiskFreeRateSettings, loadRiskFreeRates, type RiskFreeRates } from "@/components/asset-screener/risk-free-rate-settings"
import type { TrackedAsset } from "@/components/asset-screener/add-asset-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { LoginDialog } from "@/components/auth/login-dialog"
import { RegisterDialog } from "@/components/auth/register-dialog"
import { Button } from "@/components/ui/button"

export function MPTSection() {
  const { user, loading: authLoading } = useAuth()
  const [assets, setAssets] = useState<TrackedAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [riskFreeRates, setRiskFreeRates] = useState<RiskFreeRates>(loadRiskFreeRates())

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
      <div>
        <h2 className="text-2xl font-bold mb-2">Modern Portfolio Theory</h2>
        <p className="text-muted-foreground">
          Optimize your portfolio allocation using Modern Portfolio Theory algorithms.
        </p>
      </div>

      <RiskFreeRateSettings onRatesChange={setRiskFreeRates} />

      {assets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No assets in your list. Add assets to your list to use Modern Portfolio Theory optimization.
            </p>
          </CardContent>
        </Card>
      ) : (
        <MPTPortfolioView assets={assets} />
      )}
    </div>
  )
}

