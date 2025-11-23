"use client"

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/lib/auth/auth-context"
import { SeasonalityTable } from "@/components/asset-screener/seasonality-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Search, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LoginDialog } from "@/components/auth/login-dialog"
import { RegisterDialog } from "@/components/auth/register-dialog"
import { useToast } from "@/hooks/use-toast"
import type { TrackedAsset } from "@/components/asset-screener/add-asset-dialog"
import { calculateMonthlySeasonality, type PriceDataPoint } from "@/lib/asset-screener/metrics-calculations"
import { ASSET_TYPE_LABELS } from "@/lib/portfolio/types"
import type { AssetType } from "@/lib/portfolio/types"
import { CryptoSelector } from "@/components/portfolio/crypto-selector"
import { parseSymbolToBinance } from "@/lib/portfolio/binance-api"

interface StockInfo {
  symbol: string
  name: string
  sector?: string
  industry?: string
}

interface AssetOption {
  symbol: string
  name: string
  assetType: AssetType
  isInList: boolean
  trackedAssetId?: string
}

export function SeasonalitySection() {
  const { user, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const [trackedAssets, setTrackedAssets] = useState<TrackedAsset[]>([])
  const [loadingTrackedAssets, setLoadingTrackedAssets] = useState(true)
  
  // Asset class selection (required)
  const [selectedAssetClass, setSelectedAssetClass] = useState<AssetType | ''>('')
  
  // Search and asset lists
  const [searchQuery, setSearchQuery] = useState('')
  const [availableAssets, setAvailableAssets] = useState<AssetOption[]>([])
  const [loadingAssets, setLoadingAssets] = useState(false)
  
  // PK Equity state
  const [pkStocks, setPkStocks] = useState<StockInfo[]>([])
  
  // US Equity state
  const [usSymbol, setUsSymbol] = useState('')
  const [usName, setUsName] = useState('')
  const [validatingUsSymbol, setValidatingUsSymbol] = useState(false)
  
  // Crypto state
  const [cryptoSymbol, setCryptoSymbol] = useState('')
  const [cryptoOptions, setCryptoOptions] = useState<string[]>([])
  
  // Selected asset and seasonality
  const [selectedAsset, setSelectedAsset] = useState<AssetOption | null>(null)
  const [seasonalityData, setSeasonalityData] = useState<any>(null)
  const [loadingSeasonality, setLoadingSeasonality] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load tracked assets
  useEffect(() => {
    if (!authLoading && user) {
      loadTrackedAssets()
    } else if (!authLoading && !user) {
      setLoadingTrackedAssets(false)
    }
  }, [authLoading, user])

  const loadTrackedAssets = async () => {
    try {
      setLoadingTrackedAssets(true)
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setTrackedAssets([])
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
          setTrackedAssets(data.assets)
        }
      } else if (response.status === 401) {
        setTrackedAssets([])
      }
    } catch (error) {
      console.error('Error loading tracked assets:', error)
      setTrackedAssets([])
    } finally {
      setLoadingTrackedAssets(false)
    }
  }

  // Load PK stocks when asset class is selected
  useEffect(() => {
    if (selectedAssetClass === 'pk-equity') {
      loadPkStocks()
    } else if (selectedAssetClass === 'crypto') {
      loadCryptoOptions()
    } else {
      setAvailableAssets([])
      setPkStocks([])
      setCryptoOptions([])
    }
  }, [selectedAssetClass])

  const loadPkStocks = async () => {
    try {
      setLoadingAssets(true)
      const response = await fetch('/api/screener/stocks')
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          const stocks = data.stocks || []
          setPkStocks(stocks)
          // Convert to AssetOption format
          const assets: AssetOption[] = stocks.map((stock: StockInfo) => {
            const tracked = trackedAssets.find(
              a => a.assetType === 'pk-equity' && a.symbol.toUpperCase() === stock.symbol.toUpperCase()
            )
            return {
              symbol: stock.symbol,
              name: stock.name,
              assetType: 'pk-equity' as AssetType,
              isInList: !!tracked,
              trackedAssetId: tracked?.id,
            }
          })
          setAvailableAssets(assets)
        }
      }
    } catch (error) {
      console.error('Error loading PK stocks:', error)
    } finally {
      setLoadingAssets(false)
    }
  }

  const loadCryptoOptions = async () => {
    try {
      setLoadingAssets(true)
      const { fetchBinanceSymbols } = await import('@/lib/portfolio/binance-api')
      const symbols = await fetchBinanceSymbols()
      setCryptoOptions(symbols)
      
      // Convert to AssetOption format (show first 100)
      const assets: AssetOption[] = symbols.slice(0, 100).map((symbol: string) => {
        const displaySymbol = symbol.replace('USDT', '')
        const tracked = trackedAssets.find(
          a => a.assetType === 'crypto' && a.symbol.toUpperCase() === displaySymbol.toUpperCase()
        )
        return {
          symbol: displaySymbol,
          name: displaySymbol,
          assetType: 'crypto' as AssetType,
          isInList: !!tracked,
          trackedAssetId: tracked?.id,
        }
      })
      setAvailableAssets(assets)
    } catch (error) {
      console.error('Error loading crypto options:', error)
    } finally {
      setLoadingAssets(false)
    }
  }

  // Update available assets when tracked assets change
  useEffect(() => {
    if (selectedAssetClass === 'pk-equity' && pkStocks.length > 0) {
      const assets: AssetOption[] = pkStocks.map((stock: StockInfo) => {
        const tracked = trackedAssets.find(
          a => a.assetType === 'pk-equity' && a.symbol.toUpperCase() === stock.symbol.toUpperCase()
        )
        return {
          symbol: stock.symbol,
          name: stock.name,
          assetType: 'pk-equity' as AssetType,
          isInList: !!tracked,
          trackedAssetId: tracked?.id,
        }
      })
      setAvailableAssets(assets)
    } else if (selectedAssetClass === 'crypto' && cryptoOptions.length > 0) {
      const assets: AssetOption[] = cryptoOptions.slice(0, 100).map((symbol: string) => {
        const displaySymbol = symbol.replace('USDT', '')
        const tracked = trackedAssets.find(
          a => a.assetType === 'crypto' && a.symbol.toUpperCase() === displaySymbol.toUpperCase()
        )
        return {
          symbol: displaySymbol,
          name: displaySymbol,
          assetType: 'crypto' as AssetType,
          isInList: !!tracked,
          trackedAssetId: tracked?.id,
        }
      })
      setAvailableAssets(assets)
    }
  }, [trackedAssets, selectedAssetClass, pkStocks, cryptoOptions])

  // Filter assets by search
  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableAssets.slice(0, 50) // Show first 50 if no search
    }
    
    const query = searchQuery.toLowerCase()
    return availableAssets
      .filter(asset =>
        asset.symbol.toLowerCase().includes(query) ||
        asset.name.toLowerCase().includes(query)
      )
      .slice(0, 50) // Limit to 50 results
  }, [availableAssets, searchQuery])

  // Validate US equity symbol
  const validateUsSymbol = async () => {
    if (!usSymbol.trim()) return

    try {
      setValidatingUsSymbol(true)
      const response = await fetch(`/api/us-equity/price?ticker=${encodeURIComponent(usSymbol)}`)
      if (response.ok) {
        const data = await response.json()
        if (data.price !== undefined) {
          // Symbol is valid, create asset option
          const tracked = trackedAssets.find(
            a => a.assetType === 'us-equity' && a.symbol.toUpperCase() === usSymbol.toUpperCase()
          )
          const assetOption: AssetOption = {
            symbol: usSymbol.toUpperCase(),
            name: usName.trim() || usSymbol.toUpperCase(),
            assetType: 'us-equity',
            isInList: !!tracked,
            trackedAssetId: tracked?.id,
          }
          setAvailableAssets([assetOption])
          setSearchQuery(usSymbol.toUpperCase())
        } else {
          throw new Error('Invalid symbol')
        }
      } else {
        throw new Error('Invalid symbol or unable to fetch price data')
      }
    } catch (error: any) {
      toast({
        title: "Invalid symbol",
        description: error.message || 'Unable to validate US equity symbol',
        variant: "destructive",
      })
      setAvailableAssets([])
    } finally {
      setValidatingUsSymbol(false)
    }
  }

  // Add asset to list
  const handleAddAsset = async (asset: AssetOption) => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        toast({
          title: "Authentication required",
          description: "Please log in to add assets.",
          variant: "destructive",
        })
        return
      }

      let requestBody: any = {
        assetType: asset.assetType,
        symbol: asset.symbol,
        name: asset.name,
      }

      if (asset.assetType === 'pk-equity') {
        requestBody.currency = 'PKR'
      } else if (asset.assetType === 'us-equity' || asset.assetType === 'crypto') {
        requestBody.currency = 'USD'
      }

      const response = await fetch('/api/user/tracked-assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.asset) {
          setTrackedAssets(prev => [...prev, data.asset])
          // Update the asset option
          asset.isInList = true
          asset.trackedAssetId = data.asset.id
          toast({
            title: "Asset added",
            description: `${asset.symbol} has been added to your list.`,
          })
        }
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add asset')
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || 'Failed to add asset',
        variant: "destructive",
      })
    }
  }

  const loadSeasonality = async (asset: AssetOption) => {
    try {
      setLoadingSeasonality(true)
      setError(null)
      setSelectedAsset(asset)

      // Fetch full historical data for seasonality
      let historicalDataUrl = ''
      
      if (asset.assetType === 'crypto') {
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

  if (authLoading || loadingTrackedAssets) {
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

      {/* Asset Class Selection (Required) */}
      <Card>
        <CardHeader>
          <CardTitle>Select Asset Class</CardTitle>
          <CardDescription>
            Choose an asset class to search for assets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedAssetClass} onValueChange={(value) => {
            setSelectedAssetClass(value as AssetType)
            setSearchQuery('')
            setSelectedAsset(null)
            setSeasonalityData(null)
            setError(null)
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Select asset class..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pk-equity">PK Equities</SelectItem>
              <SelectItem value="us-equity">US Equities</SelectItem>
              <SelectItem value="crypto">Crypto</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Search and Asset Selection */}
      {selectedAssetClass && (
        <Card>
          <CardHeader>
            <CardTitle>Search Assets</CardTitle>
            <CardDescription>
              {selectedAssetClass === 'pk-equity' && 'Search from all PK equities'}
              {selectedAssetClass === 'us-equity' && 'Enter a US equity symbol to validate and view seasonality'}
              {selectedAssetClass === 'crypto' && 'Search from available cryptocurrencies'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedAssetClass === 'us-equity' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Stock Symbol *</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., AAPL, TSLA, MSFT"
                      value={usSymbol}
                      onChange={(e) => setUsSymbol(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          validateUsSymbol()
                        }
                      }}
                    />
                    <Button
                      onClick={validateUsSymbol}
                      disabled={validatingUsSymbol || !usSymbol.trim()}
                    >
                      {validatingUsSymbol ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                {usName && (
                  <div className="space-y-2">
                    <Label>Company Name (Optional)</Label>
                    <Input
                      placeholder="Auto-filled if left empty"
                      value={usName}
                      onChange={(e) => setUsName(e.target.value)}
                    />
                  </div>
                )}
              </div>
            ) : selectedAssetClass === 'crypto' ? (
              <div className="space-y-2">
                <Label>Search Cryptocurrency</Label>
                <Input
                  placeholder="Search by symbol..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Search PK Equities
                </Label>
                <Input
                  placeholder="Search by symbol or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}

            {/* Asset List */}
            {loadingAssets ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredAssets.length > 0 ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto border rounded-md p-4">
                {filteredAssets.map((asset) => {
                  const isSelected = selectedAsset?.symbol === asset.symbol && selectedAsset?.assetType === asset.assetType
                  return (
                    <div
                      key={`${asset.assetType}-${asset.symbol}`}
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
                        {asset.isInList && (
                          <Badge variant="outline" className="text-xs">In List</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isSelected && loadingSeasonality && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        {!asset.isInList && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAddAsset(asset)
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : searchQuery || (selectedAssetClass === 'us-equity' && usSymbol) ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No assets found matching your search.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                {selectedAssetClass === 'us-equity' 
                  ? 'Enter a stock symbol above to validate and view seasonality'
                  : 'Start typing to search for assets'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
