"use client"

import { useState, useEffect, useMemo } from "react"
import { SeasonalityTable } from "@/components/asset-screener/seasonality-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { calculateMonthlySeasonality, type PriceDataPoint } from "@/lib/asset-screener/metrics-calculations"
import { ASSET_TYPE_LABELS } from "@/lib/portfolio/types"
import type { AssetType } from "@/lib/portfolio/types"
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
}

export function SeasonalitySection() {
  const { toast } = useToast()

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
  const [validatingUsSymbol, setValidatingUsSymbol] = useState(false)
  const [usAssetName, setUsAssetName] = useState('')

  // Crypto state
  const [cryptoOptions, setCryptoOptions] = useState<string[]>([])

  // Selected asset and seasonality
  const [selectedAsset, setSelectedAsset] = useState<AssetOption | null>(null)
  const [seasonalityData, setSeasonalityData] = useState<any>(null)
  const [loadingSeasonality, setLoadingSeasonality] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load assets when asset class is selected
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
          const assets: AssetOption[] = stocks.map((stock: StockInfo) => ({
            symbol: stock.symbol,
            name: stock.name,
            assetType: 'pk-equity' as AssetType,
          }))
          setAvailableAssets(assets)
        }
      }
    } catch (error) {
      console.error('Error loading PK stocks:', error)
      toast({
        title: "Error",
        description: "Failed to load PK equities",
        variant: "destructive",
      })
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
        return {
          symbol: displaySymbol,
          name: displaySymbol,
          assetType: 'crypto' as AssetType,
        }
      })
      setAvailableAssets(assets)
    } catch (error) {
      console.error('Error loading crypto options:', error)
      toast({
        title: "Error",
        description: "Failed to load cryptocurrencies",
        variant: "destructive",
      })
    } finally {
      setLoadingAssets(false)
    }
  }

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
      const response = await fetch(`/api/market/price?type=us-equity&symbol=${encodeURIComponent(usSymbol)}`)
      if (response.ok) {
        const data = await response.json()
        if (data.price !== undefined) {
          // Symbol is valid, create asset option
          const assetOption: AssetOption = {
            symbol: usSymbol.toUpperCase(),
            name: usAssetName.trim() || usSymbol.toUpperCase(),
            assetType: 'us-equity',
          }
          setAvailableAssets([assetOption])
          setSearchQuery(usSymbol.toUpperCase())
          // Auto-select and load seasonality
          loadSeasonality(assetOption)
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Asset Seasonality</h2>
        <p className="text-muted-foreground">
          Analyze monthly seasonality patterns to identify recurring trends in asset returns. Select an asset class and search for any asset.
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
            setUsSymbol('')
            setUsAssetName('')
            setSelectedAsset(null)
            setSeasonalityData(null)
            setError(null)
            setAvailableAssets([])
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
              {selectedAssetClass === 'us-equity' && 'Enter a US equity symbol to view seasonality'}
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
                {usAssetName && (
                  <div className="space-y-2">
                    <Label>Company Name (Optional)</Label>
                    <Input
                      placeholder="Auto-filled if left empty"
                      value={usAssetName}
                      onChange={(e) => setUsAssetName(e.target.value)}
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
                      className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${isSelected
                          ? 'bg-primary/10 border-primary'
                          : 'hover:bg-muted/50 cursor-pointer'
                        }`}
                      onClick={() => !isSelected && loadSeasonality(asset)}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <span className="font-mono font-medium">{asset.symbol}</span>
                        <span className="text-sm text-muted-foreground">{asset.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {ASSET_TYPE_LABELS[asset.assetType]}
                        </Badge>
                      </div>
                      {isSelected && loadingSeasonality && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
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
                  ? 'Enter a stock symbol above to view seasonality'
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
