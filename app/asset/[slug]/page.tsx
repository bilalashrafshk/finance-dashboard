"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2 } from "lucide-react"
import { AssetDetailView } from "@/components/asset-screener/asset-detail-view"
import { loadRiskFreeRates } from "@/components/asset-screener/risk-free-rate-settings"
import type { TrackedAsset } from "@/components/asset-screener/add-asset-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS } from "@/lib/portfolio/types"
import { parseAssetSlug, getAssetTypeFromMarket } from "@/lib/asset-screener/url-utils"
import { SharedNavbar } from "@/components/shared-navbar"

/**
 * Helper function to get asset name from symbol and asset type
 * Tries to fetch from API, falls back to symbol
 */
async function getAssetName(symbol: string, assetType: string): Promise<string> {
  // Special cases for indices
  if (assetType === 'kse100') {
    return 'KSE 100 Index'
  }
  if (assetType === 'spx500') {
    return 'S&P 500 Index'
  }
  
  // Try to fetch name from API
  try {
    const response = await fetch(`/api/asset/metadata?symbol=${encodeURIComponent(symbol)}&assetType=${encodeURIComponent(assetType)}`)
    if (response.ok) {
      const data = await response.json()
      if (data.success && data.name) {
        return data.name
      }
    }
  } catch (error) {
    console.warn('Failed to fetch asset name from API:', error)
  }
  
  // Fallback to symbol
  return symbol
}

/**
 * Helper function to get currency from asset type
 */
function getCurrency(assetType: string): string {
  if (assetType === 'pk-equity' || assetType === 'kse100') {
    return 'PKR'
  }
  return 'USD'
}

/**
 * Create a minimal TrackedAsset from slug information
 */
async function createAssetFromSlug(slug: string): Promise<TrackedAsset | null> {
  const parsed = parseAssetSlug(slug)
  if (!parsed) {
    return null
  }

  const { market, ticker } = parsed
  const assetType = getAssetTypeFromMarket(market, ticker)
  const name = await getAssetName(ticker, assetType)
  const currency = getCurrency(assetType)

  // Create a minimal TrackedAsset object
  // We use a temporary ID based on the slug
  const tempId = `temp-${slug}`
  const now = new Date().toISOString()

  return {
    id: tempId,
    assetType: assetType as any,
    symbol: ticker,
    name,
    currency,
    createdAt: now,
    updatedAt: now,
  }
}

export default function PublicAssetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [asset, setAsset] = useState<TrackedAsset | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const slug = params.slug as string

  useEffect(() => {
    if (!slug) {
      setError('Invalid asset URL')
      setLoading(false)
      return
    }

    const loadAsset = async () => {
      const assetFromSlug = await createAssetFromSlug(slug)
      if (assetFromSlug) {
        setAsset(assetFromSlug)
        setLoading(false)
      } else {
        setError('Invalid asset URL format')
        setLoading(false)
      }
    }

    loadAsset()
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SharedNavbar />
        <main>
          <div className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-foreground" />
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (error || !asset) {
    return (
      <div className="min-h-screen bg-background">
        <SharedNavbar />
        <main>
          <div className="container mx-auto px-4 py-8">
            <div className="max-w-2xl mx-auto">
              <Button
                variant="ghost"
                onClick={() => router.push('/')}
                className="mb-4"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
              <Card>
                <CardHeader>
                  <CardTitle>Error</CardTitle>
                  <CardDescription>{error || 'Asset not found'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => router.push('/')}>
                    Go to Home
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main>
        <div className="container mx-auto px-4 py-8">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-6"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
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
    </div>
  )
}

