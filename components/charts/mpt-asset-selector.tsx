"use client"

import { useState, useEffect, useMemo } from "react"
import { Search, Plus, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import type { TrackedAsset } from "@/components/asset-screener/add-asset-dialog"
import { CryptoSelector } from "@/components/portfolio/crypto-selector"
import { formatSymbolForDisplay, parseSymbolToBinance } from "@/lib/portfolio/binance-api"

interface MPTAssetSelectorProps {
  onAssetAdded: (asset: TrackedAsset) => void
  existingAssets: TrackedAsset[]
}

interface StockInfo {
  symbol: string
  name: string
  sector: string
  industry: string
}

export function MPTAssetSelector({ onAssetAdded, existingAssets }: MPTAssetSelectorProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<'pk-equity' | 'us-equity' | 'crypto'>('pk-equity')

  // PK Equity state
  const [pkStocks, setPkStocks] = useState<StockInfo[]>([])
  const [pkSearchQuery, setPkSearchQuery] = useState('')
  const [loadingPkStocks, setLoadingPkStocks] = useState(true)

  // US Equity state
  const [usSymbol, setUsSymbol] = useState('')
  const [usName, setUsName] = useState('')
  const [addingUsAsset, setAddingUsAsset] = useState(false)

  // Crypto state
  const [cryptoSymbol, setCryptoSymbol] = useState('')
  const [addingCrypto, setAddingCrypto] = useState(false)

  // Load PK stocks
  useEffect(() => {
    const loadPkStocks = async () => {
      try {
        setLoadingPkStocks(true)
        const response = await fetch('/api/screener/stocks')
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setPkStocks(data.stocks || [])
          }
        }
      } catch (error) {
        console.error('Error loading PK stocks:', error)
      } finally {
        setLoadingPkStocks(false)
      }
    }
    loadPkStocks()
  }, [])

  // Filter PK stocks by search query
  const filteredPkStocks = useMemo(() => {
    if (!pkSearchQuery.trim()) return pkStocks.slice(0, 50) // Show first 50 if no search

    const query = pkSearchQuery.toLowerCase()
    return pkStocks
      .filter(stock =>
        stock.symbol.toLowerCase().includes(query) ||
        stock.name.toLowerCase().includes(query) ||
        stock.sector.toLowerCase().includes(query)
      )
      .slice(0, 50) // Limit to 50 results
  }, [pkStocks, pkSearchQuery])

  // Check if asset already exists
  const assetExists = (assetType: string, symbol: string) => {
    return existingAssets.some(
      a => a.assetType === assetType && a.symbol.toUpperCase() === symbol.toUpperCase()
    )
  }

  // Add PK equity
  const handleAddPkEquity = async (stock: StockInfo) => {
    if (assetExists('pk-equity', stock.symbol)) {
      toast({
        title: "Asset already added",
        description: `${stock.symbol} is already in your list.`,
        variant: "default",
      })
      return
    }

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

      const response = await fetch('/api/user/tracked-assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          assetType: 'pk-equity',
          symbol: stock.symbol,
          name: stock.name,
          currency: 'PKR',
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.asset) {
          onAssetAdded(data.asset)
          toast({
            title: "Asset added",
            description: `${stock.symbol} has been added to your list.`,
          })
          setPkSearchQuery('') // Clear search
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

  // Add US equity
  const handleAddUsEquity = async () => {
    if (!usSymbol.trim()) {
      toast({
        title: "Symbol required",
        description: "Please enter a stock symbol.",
        variant: "destructive",
      })
      return
    }

    if (assetExists('us-equity', usSymbol)) {
      toast({
        title: "Asset already added",
        description: `${usSymbol} is already in your list.`,
        variant: "default",
      })
      return
    }

    try {
      setAddingUsAsset(true)
      const token = localStorage.getItem('auth_token')
      if (!token) {
        throw new Error('Authentication required')
      }

      // Try to fetch price to validate symbol
      const priceResponse = await fetch(`/api/market/price?type=us-equity&symbol=${encodeURIComponent(usSymbol)}`)
      if (!priceResponse.ok) {
        throw new Error('Invalid symbol or unable to fetch price data')
      }

      const priceData = await priceResponse.json()
      const name = usName.trim() || usSymbol

      const response = await fetch('/api/user/tracked-assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          assetType: 'us-equity',
          symbol: usSymbol.toUpperCase(),
          name,
          currency: 'USD',
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.asset) {
          onAssetAdded(data.asset)
          toast({
            title: "Asset added",
            description: `${usSymbol} has been added to your list.`,
          })
          setUsSymbol('')
          setUsName('')
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
    } finally {
      setAddingUsAsset(false)
    }
  }

  // Add crypto
  const handleAddCrypto = async () => {
    if (!cryptoSymbol.trim()) {
      toast({
        title: "Symbol required",
        description: "Please select or enter a crypto symbol.",
        variant: "destructive",
      })
      return
    }

    const symbol = cryptoSymbol.toUpperCase()
    if (assetExists('crypto', symbol)) {
      toast({
        title: "Asset already added",
        description: `${symbol} is already in your list.`,
        variant: "default",
      })
      return
    }

    try {
      setAddingCrypto(true)
      const token = localStorage.getItem('auth_token')
      if (!token) {
        throw new Error('Authentication required')
      }

      // Try to fetch price to validate symbol
      const binanceSymbol = parseSymbolToBinance(symbol)
      const priceResponse = await fetch(`/api/market/price?type=crypto&symbol=${encodeURIComponent(binanceSymbol)}`)
      if (!priceResponse.ok) {
        throw new Error('Invalid symbol or unable to fetch price data')
      }

      const response = await fetch('/api/user/tracked-assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          assetType: 'crypto',
          symbol,
          name: symbol,
          currency: 'USD',
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.asset) {
          onAssetAdded(data.asset)
          toast({
            title: "Asset added",
            description: `${symbol} has been added to your list.`,
          })
          setCryptoSymbol('')
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
    } finally {
      setAddingCrypto(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pk-equity">PK Equities</TabsTrigger>
            <TabsTrigger value="us-equity">US Equities</TabsTrigger>
            <TabsTrigger value="crypto">Crypto</TabsTrigger>
          </TabsList>

          <TabsContent value="pk-equity" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Search PK Equities
              </Label>
              <Input
                placeholder="Search by symbol, name, or sector..."
                value={pkSearchQuery}
                onChange={(e) => setPkSearchQuery(e.target.value)}
              />
            </div>

            {loadingPkStocks ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto space-y-2">
                {filteredPkStocks.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {pkSearchQuery ? 'No stocks found matching your search.' : 'No stocks available.'}
                  </p>
                ) : (
                  filteredPkStocks.map((stock) => {
                    const exists = assetExists('pk-equity', stock.symbol)
                    return (
                      <div
                        key={stock.symbol}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{stock.symbol}</span>
                            {exists && (
                              <Badge variant="outline" className="text-xs">Added</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{stock.name}</p>
                          <p className="text-xs text-muted-foreground">{stock.sector}</p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleAddPkEquity(stock)}
                          disabled={exists}
                          variant={exists ? "outline" : "default"}
                        >
                          {exists ? (
                            <X className="h-4 w-4" />
                          ) : (
                            <Plus className="h-4 w-4 mr-1" />
                          )}
                          {exists ? 'Added' : 'Add'}
                        </Button>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="us-equity" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Stock Symbol *</Label>
                <Input
                  placeholder="e.g., AAPL, TSLA, MSFT"
                  value={usSymbol}
                  onChange={(e) => setUsSymbol(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-2">
                <Label>Company Name (Optional)</Label>
                <Input
                  placeholder="Auto-filled if left empty"
                  value={usName}
                  onChange={(e) => setUsName(e.target.value)}
                />
              </div>
              <Button
                onClick={handleAddUsEquity}
                disabled={addingUsAsset || !usSymbol.trim()}
                className="w-full"
              >
                {addingUsAsset ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Add US Equity
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="crypto" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Crypto Symbol *</Label>
                <CryptoSelector
                  value={cryptoSymbol}
                  onValueChange={setCryptoSymbol}
                />
              </div>
              <Button
                onClick={handleAddCrypto}
                disabled={addingCrypto || !cryptoSymbol.trim()}
                className="w-full"
              >
                {addingCrypto ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Crypto
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

