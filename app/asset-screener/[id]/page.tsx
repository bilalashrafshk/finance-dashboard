"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth/auth-context"
import { AssetDetailView } from "@/components/asset-screener/asset-detail-view"
import { loadRiskFreeRates } from "@/components/asset-screener/risk-free-rate-settings"
import type { TrackedAsset } from "@/components/asset-screener/add-asset-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS } from "@/lib/portfolio/types"

export default function AssetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [asset, setAsset] = useState<TrackedAsset | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const assetId = params.id as string

  useEffect(() => {
    if (!authLoading && user) {
      loadAsset()
    } else if (!authLoading && !user) {
      setLoading(false)
      setError('Authentication required')
    }
  }, [authLoading, user, assetId])

  const loadAsset = async () => {
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setError('Authentication required')
        return
      }

      // Fetch all assets and find the one with matching ID
      const response = await fetch('/api/user/tracked-assets', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          const foundAsset = data.assets.find((a: TrackedAsset) => a.id === assetId)
          if (foundAsset) {
            setAsset(foundAsset)
          } else {
            setError('Asset not found')
          }
        }
      } else if (response.status === 401) {
        setError('Authentication required')
      } else {
        setError('Failed to load asset')
      }
    } catch (error) {
      console.error('Error loading asset:', error)
      setError('Failed to load asset')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </main>
    )
  }

  if (error || !asset) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <Button
              variant="ghost"
              onClick={() => router.push('/asset-screener')}
              className="mb-4"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Asset Screener
            </Button>
            <Card>
              <CardHeader>
                <CardTitle>Error</CardTitle>
                <CardDescription>{error || 'Asset not found'}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => router.push('/asset-screener')}>
                  Go to Asset Screener
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => router.push('/asset-screener')}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Asset Screener
        </Button>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{asset.name}</h1>
            <Badge 
              variant="outline" 
              style={{ 
                borderColor: ASSET_TYPE_COLORS[asset.assetType as keyof typeof ASSET_TYPE_COLORS],
                color: ASSET_TYPE_COLORS[asset.assetType as keyof typeof ASSET_TYPE_COLORS]
              }}
            >
              {ASSET_TYPE_LABELS[asset.assetType as keyof typeof ASSET_TYPE_LABELS]}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-mono">{asset.symbol}</span>
            <span>•</span>
            <span>{asset.currency}</span>
          </div>
        </div>

        <AssetDetailView asset={asset} riskFreeRates={loadRiskFreeRates()} />
      </div>
    </main>
  )
}

