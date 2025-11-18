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
import { parseAssetSlug, getAssetTypeFromMarket, generateAssetSlug } from "@/lib/asset-screener/url-utils"
import { SharedNavbar } from "@/components/shared-navbar"

export default function AssetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [asset, setAsset] = useState<TrackedAsset | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const slug = params.slug as string

  const loadAsset = async () => {
    try {
      setLoading(true)
      setError(null)
      
      if (!slug) {
        setError('Invalid asset URL')
        return
      }

      const token = localStorage.getItem('auth_token')
      if (!token) {
        setError('Authentication required')
        setLoading(false)
        return
      }

      // First, try to parse as slug format (e.g., "psx-ogdc", "us-aapl")
      const parsed = parseAssetSlug(slug)
      
      if (parsed) {
        // Valid slug format - find asset by market and ticker
        const { market, ticker } = parsed
        const assetType = getAssetTypeFromMarket(market, ticker)

        const response = await fetch('/api/user/tracked-assets', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            let foundAsset = data.assets.find((a: TrackedAsset) => 
              a.assetType === assetType && a.symbol.toUpperCase() === ticker
            )
            
            // If asset not found, try to auto-create it
            if (!foundAsset) {
              try {
                // Determine currency based on asset type
                const currency = assetType === 'pk-equity' || assetType === 'kse100' ? 'PKR' : 'USD'
                
                // Determine name based on asset type and symbol
                let name = ticker
                if (assetType === 'kse100') {
                  name = 'KSE 100 Index'
                } else if (assetType === 'spx500') {
                  name = 'S&P 500 Index'
                }
                
                const createResponse = await fetch('/api/user/tracked-assets', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    assetType,
                    symbol: ticker,
                    name,
                    currency,
                  }),
                })
                
                if (createResponse.ok) {
                  const createData = await createResponse.json()
                  if (createData.success && createData.asset) {
                    foundAsset = createData.asset
                  }
                }
              } catch (createError) {
                console.warn('Failed to auto-create asset:', createError)
                // Continue to show error if creation fails
              }
            }
            
            if (foundAsset) {
              setAsset(foundAsset)
            } else {
              setError('Asset not found. Please add it to the asset screener first.')
            }
          } else {
            setError('Failed to fetch assets')
          }
        } else if (response.status === 401) {
          setError('Authentication required')
        } else {
          setError('Failed to load asset')
        }
      } else {
        // Not a valid slug format - might be a legacy ID
        // If it contains a hyphen, it's likely a malformed slug, not an ID
        if (slug.includes('-')) {
          setError('Invalid asset URL format')
          setLoading(false)
          return
        }

        // Treat as legacy ID and redirect to slug format
        const response = await fetch('/api/user/tracked-assets', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            const foundAsset = data.assets.find((a: TrackedAsset) => a.id === slug)
            if (foundAsset) {
              // Redirect to new slug format
              const newSlug = generateAssetSlug(foundAsset.assetType, foundAsset.symbol)
              router.replace(`/asset-screener/${newSlug}`)
              return
            } else {
              setError('Asset not found')
            }
          } else {
            setError('Failed to fetch assets')
          }
        } else if (response.status === 401) {
          setError('Authentication required')
        } else {
          setError('Failed to load asset')
        }
      }
    } catch (error) {
      console.error('Error loading asset:', error)
      setError('Failed to load asset')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading && user && slug) {
      loadAsset()
    } else if (!authLoading && !user) {
      setLoading(false)
      setError('Authentication required')
    }
  }, [authLoading, user, slug])

  if (authLoading || loading) {
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
    </div>
  )
}

