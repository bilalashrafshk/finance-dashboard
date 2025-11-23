"use client"

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { SeasonalityTable } from "@/components/asset-screener/seasonality-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LoginDialog } from "@/components/auth/login-dialog"
import { RegisterDialog } from "@/components/auth/register-dialog"
import type { TrackedAsset } from "@/components/asset-screener/add-asset-dialog"
import { calculateMonthlySeasonality, type PriceDataPoint } from "@/lib/asset-screener/metrics-calculations"
import { ASSET_TYPE_LABELS } from "@/lib/portfolio/types"
import type { AssetType } from "@/lib/portfolio/types"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"
import Link from "next/link"

export function SeasonalitySection() {
  const { user, loading: authLoading } = useAuth()
  const [assets, setAssets] = useState<TrackedAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAsset, setSelectedAsset] = useState<TrackedAsset | null>(null)
  const [seasonalityData, setSeasonalityData] = useState<any>(null)
  const [loadingSeasonality, setLoadingSeasonality] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [assetClassFilter, setAssetClassFilter] = useState<'all' | AssetType>('all')
  const [searchQuery, setSearchQuery] = useState('')

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

  // Filter assets
  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      // Asset class filter
      const matchesAssetClass = assetClassFilter === 'all' || asset.assetType === assetClassFilter
      
      // Search filter
      const matchesSearch = searchQuery === "" || 
        asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.name.toLowerCase().includes(searchQuery.toLowerCase())
      
      return matchesAssetClass && matchesSearch
    })
  }, [assets, assetClassFilter, searchQuery])

  // Get unique asset types
  const assetTypes = useMemo(() => {
    return Array.from(new Set(assets.map(a => a.assetType))).sort()
  }, [assets])

  const loadSeasonality = async (asset: TrackedAsset) => {
    try {
      setLoadingSeasonality(true)
      setError(null)
      setSelectedAsset(asset)

      // Fetch full historical data for seasonality
      let historicalDataUrl = ''
      
      if (asset.assetType === 'crypto') {
        const { parseSymbolToBinance } = await import('@/lib/portfolio/binance-api')
        const binanceSymbol = parseSymbolToBinance(asset.symbol)
        historicalDataUrl = `/api/historical-data?assetType=crypto&symbol=${encodeURIComponent(binanceSymbol)}`
      } else if (asset.assetType === 'pk-equity') {
        historicalDataUrl = `/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(asset.symbol)}&market=PSX`
      } else if (asset.assetType === 'us-equity') {
        historicalDataUrl = `/api/historical-data?assetType=us-equity&symbol=${encodeURIComponent(asset.symbol)}&market=US`
      } else if (asset.assetType === 'metals') {
        historicalDataUrl = `/api/historical-data?assetType=metals&symbol=${encodeURIComponent(asset.symbol)}`
      } else if (asset.assetType === 'kse100' || asset.assetType === 'spx500') {
        const apiAssetType = asset.assetType === 'kse100' ? 'kse100' : 'spx500'
        historicalDataUrl = `/api/historical-data?assetType=${apiAssetType}&symbol=${encodeURIComponent(asset.symbol)}`
      }

      if (!historicalDataUrl) {
        throw new Error('Unsupported asset type for seasonality analysis')
      }

      const response = await fetch(historicalDataUrl)
      if (!response.ok) {
        throw new Error('Failed to fetch historical data')
      }

      const data = await response.json()
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid data format')
      }

      const historicalData: PriceDataPoint[] = data.data
        .map((record: any) => ({
          date: record.date,
          close: parseFloat(record.close)
        }))
        .filter((point: PriceDataPoint) => !isNaN(point.close))
        .sort((a: PriceDataPoint, b: PriceDataPoint) => a.date.localeCompare(b.date))

      if (historicalData.length < 30) {
        throw new Error('Insufficient historical data (need at least 30 days)')
      }

      // Calculate seasonality
      const seasonality = calculateMonthlySeasonality(historicalData)
      if (!seasonality) {
        throw new Error('Unable to calculate seasonality from available data')
      }

      setSeasonalityData(seasonality)
    } catch (err: any) {
      console.error('Error loading seasonality:', err)
      setError(err.message || 'Failed to load seasonality data')
      setSeasonalityData(null)
    } finally {
      setLoadingSeasonality(false)
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
          <CardTitle>Asset Seasonality</CardTitle>
          <CardDescription>
            View monthly seasonality patterns for assets. Sign in to get started.
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
        <h2 className="text-2xl font-bold mb-2">Asset Seasonality</h2>
        <p className="text-muted-foreground">
          Analyze monthly seasonality patterns to identify recurring trends in asset returns.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Label className="flex items-center gap-2 mb-2">
                <Search className="h-4 w-4" />
                Search Assets
              </Label>
              <Input
                placeholder="Search by symbol or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="w-full md:w-48">
              <Label className="mb-2 block">Asset Class</Label>
              <Select value={assetClassFilter} onValueChange={(value) => setAssetClassFilter(value as 'all' | AssetType)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Asset Classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Asset Classes</SelectItem>
                  {assetTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {ASSET_TYPE_LABELS[type as AssetType]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Asset List */}
      {assets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No assets in your list. Add assets to view seasonality patterns.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Select Asset</CardTitle>
              <CardDescription>
                {filteredAssets.length === 0 
                  ? 'No assets match your filters'
                  : `Showing ${filteredAssets.length} of ${assets.length} assets`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredAssets.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No assets found matching your search criteria.
                </p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {filteredAssets.map((asset) => {
                    const assetSlug = generateAssetSlug(asset.assetType, asset.symbol)
                    const isSelected = selectedAsset?.id === asset.id
                    return (
                      <div
                        key={asset.id}
                        className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                          isSelected 
                            ? 'bg-primary/10 border-primary' 
                            : 'hover:bg-muted/50 cursor-pointer'
                        }`}
                        onClick={() => !isSelected && loadSeasonality(asset)}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <span className="font-mono font-medium">{asset.symbol}</span>
                          <span className="text-sm text-muted-foreground">{asset.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {ASSET_TYPE_LABELS[asset.assetType as AssetType]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {isSelected && loadingSeasonality && (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                          <Link
                            href={`/asset/${assetSlug}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm text-primary hover:underline"
                          >
                            View Details
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Seasonality Display */}
          {selectedAsset && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Seasonality: {selectedAsset.symbol}
                  {selectedAsset.name !== selectedAsset.symbol && (
                    <span className="text-muted-foreground font-normal ml-2">
                      ({selectedAsset.name})
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  Monthly average returns for {selectedAsset.symbol}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingSeasonality ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : error ? (
                  <div className="text-sm text-destructive py-4 text-center">
                    {error}
                  </div>
                ) : seasonalityData ? (
                  <SeasonalityTable monthlySeasonality={seasonalityData} />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Click on an asset above to view its seasonality patterns.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

