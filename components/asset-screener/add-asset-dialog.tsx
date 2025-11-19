"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, RefreshCw, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CryptoSelector } from "@/components/portfolio/crypto-selector"
import { MetalsSelector } from "@/components/portfolio/metals-selector"
import type { AssetType } from "@/lib/portfolio/types"
import { ASSET_TYPE_LABELS } from "@/lib/portfolio/types"
import { formatSymbolForDisplay, parseSymbolToBinance } from "@/lib/portfolio/binance-api"
import { formatMetalForDisplay } from "@/lib/portfolio/metals-api"

export interface TrackedAsset {
  id: string
  assetType: AssetType
  symbol: string
  name: string
  currency: string
  notes?: string
  createdAt: string
  updatedAt: string
}

interface AddAssetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (asset: Omit<TrackedAsset, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  defaultAssetType?: AssetType
  restrictToAssetType?: AssetType
}

export function AddAssetDialog({ open, onOpenChange, onSave, defaultAssetType, restrictToAssetType }: AddAssetDialogProps) {
  const [assetType, setAssetType] = useState<AssetType>(defaultAssetType || 'us-equity')
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [notes, setNotes] = useState('')
  const [fetchingPrice, setFetchingPrice] = useState(false)
  const [initializingHistoricalData, setInitializingHistoricalData] = useState(false)
  const [historicalDataReady, setHistoricalDataReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      // Reset form when dialog closes
      setAssetType(defaultAssetType || 'us-equity')
      setSymbol('')
      setName('')
      setCurrency('USD')
      setInitializingHistoricalData(false)
      setHistoricalDataReady(false)
      setError(null)
    }
  }, [open, defaultAssetType])

  // Auto-set currency and symbol based on asset type
  useEffect(() => {
    if (open) {
      const effectiveAssetType = restrictToAssetType || assetType
      if (effectiveAssetType === 'pk-equity' || effectiveAssetType === 'kse100') {
        setCurrency('PKR')
        if (effectiveAssetType === 'kse100') {
          setSymbol('KSE100')
          setName('KSE 100 Index')
        }
      } else if (effectiveAssetType === 'us-equity' || effectiveAssetType === 'spx500' || effectiveAssetType === 'crypto' || effectiveAssetType === 'metals') {
        setCurrency('USD')
        if (effectiveAssetType === 'spx500') {
          setSymbol('SPX500')
          setName('S&P 500 Index')
        }
      }
    }
  }, [assetType, restrictToAssetType, open])

  // Wait for historical data to be ready
  const waitForHistoricalData = async (
    assetType: string,
    symbol: string,
    maxWaitTime: number = 30000
  ): Promise<boolean> => {
    const startTime = Date.now()
    const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
    
    if (assetType === 'kse100' || assetType === 'spx500' || assetType === 'metals') {
      try {
        const market = assetType === 'pk-equity' ? 'PSX' : assetType === 'us-equity' ? 'US' : null
        const checkUrl = `/api/historical-data?assetType=${assetType}&symbol=${encodeURIComponent(symbol)}${market ? `&market=${market}` : ''}&limit=1`
        const checkResponse = await deduplicatedFetch(checkUrl)
        const hasData = checkResponse.ok && (await checkResponse.json()).data?.length > 0
        
        if (!hasData) {
          let instrumentId: string | null = null
          
          if (assetType === 'metals') {
            const { getMetalInstrumentId } = await import('@/lib/portfolio/metals-api')
            instrumentId = getMetalInstrumentId(symbol.toUpperCase())
          } else if (assetType === 'kse100' || assetType === 'spx500') {
            const { KSE100_INSTRUMENT_ID, SPX500_INSTRUMENT_ID } = await import('@/lib/portfolio/investing-client-api')
            instrumentId = assetType === 'kse100' ? KSE100_INSTRUMENT_ID : SPX500_INSTRUMENT_ID
          }
          
          if (instrumentId) {
            const { fetchInvestingHistoricalDataClient } = await import('@/lib/portfolio/investing-client-api')
            const defaultStartDate = '1970-01-01'
            const clientData = await fetchInvestingHistoricalDataClient(
              instrumentId,
              defaultStartDate,
              new Date().toISOString().split('T')[0]
            )
            
            if (clientData && clientData.length > 0) {
              try {
                const storeResponse = await fetch('/api/historical-data/store', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    assetType,
                    symbol: symbol.toUpperCase(),
                    data: clientData,
                    source: 'investing',
                  }),
                })
                
                if (storeResponse.ok) {
                  await storeResponse.json()
                  return true
                }
              } catch (storeError) {
                console.error(`Error storing data for ${symbol}:`, storeError)
              }
            }
          }
        } else {
          return true
        }
      } catch (error) {
        console.error(`Error fetching historical data for ${assetType}/${symbol}:`, error)
      }
    }
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const market = assetType === 'pk-equity' ? 'PSX' : assetType === 'us-equity' ? 'US' : null
        const url = `/api/historical-data?assetType=${assetType}&symbol=${encodeURIComponent(symbol)}${market ? `&market=${market}` : ''}`
        const response = await deduplicatedFetch(url)
        
        if (response.ok) {
          const data = await response.json()
          const records = data.data || []
          
          if (records.length > 0) {
            return true
          }
        }
      } catch (error) {
        console.error('Error checking historical data:', error)
      }
      
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    return false
  }

  const fetchCurrentPrice = async () => {
    if (!symbol) return

    try {
      setFetchingPrice(true)
      setInitializingHistoricalData(false)
      setHistoricalDataReady(false)
      setError(null)
      
      const effectiveAssetType = restrictToAssetType || assetType
      const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
      const market = effectiveAssetType === 'pk-equity' ? 'PSX' : effectiveAssetType === 'us-equity' ? 'US' : null
      const checkUrl = `/api/historical-data?assetType=${effectiveAssetType}&symbol=${encodeURIComponent(symbol.toUpperCase())}${market ? `&market=${market}` : ''}&limit=1`
      const checkResponse = await deduplicatedFetch(checkUrl)
      const hasExistingData = checkResponse.ok && (await checkResponse.json()).data?.length > 0
      
      if (!hasExistingData) {
        setInitializingHistoricalData(true)
      }
      
      if (effectiveAssetType === 'crypto') {
        const binanceSymbol = parseSymbolToBinance(symbol)
        const { fetchCryptoPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchCryptoPrice(binanceSymbol)
        
        if (data && data.price) {
          if (!name) {
            setName(formatSymbolForDisplay(binanceSymbol))
          }
        }
        
        if (!hasExistingData) {
          const dataReady = await waitForHistoricalData('crypto', binanceSymbol)
          setHistoricalDataReady(dataReady)
        } else {
          setHistoricalDataReady(true)
        }
      } else if (effectiveAssetType === 'pk-equity') {
        const { fetchPKEquityPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchPKEquityPrice(symbol.toUpperCase())
        
        if (data && data.price) {
          if (!name) {
            setName(symbol.toUpperCase())
          }
        }
        
        if (!hasExistingData) {
          const dataReady = await waitForHistoricalData('pk-equity', symbol.toUpperCase())
          setHistoricalDataReady(dataReady)
        } else {
          setHistoricalDataReady(true)
        }
      } else if (effectiveAssetType === 'kse100' || effectiveAssetType === 'spx500') {
        const indexSymbol = effectiveAssetType === 'kse100' ? 'KSE100' : 'SPX500'
        const { fetchIndicesPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchIndicesPrice(indexSymbol)
        
        if (data && data.price) {
          if (!name) {
            setName(effectiveAssetType === 'kse100' ? 'KSE 100 Index' : 'S&P 500 Index')
          }
          if (!symbol) {
            setSymbol(indexSymbol)
          }
        }
        
        if (!hasExistingData) {
          const apiAssetType = effectiveAssetType === 'kse100' ? 'kse100' : 'spx500'
          const dataReady = await waitForHistoricalData(apiAssetType, indexSymbol)
          setHistoricalDataReady(dataReady)
        } else {
          setHistoricalDataReady(true)
        }
      } else if (effectiveAssetType === 'us-equity') {
        const { fetchUSEquityPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchUSEquityPrice(symbol.toUpperCase())
        
        if (data && data.price) {
          if (!name) {
            setName(symbol.toUpperCase())
          }
        }
        
        if (!hasExistingData) {
          const dataReady = await waitForHistoricalData('us-equity', symbol.toUpperCase())
          setHistoricalDataReady(dataReady)
        } else {
          setHistoricalDataReady(true)
        }
      } else if (effectiveAssetType === 'metals') {
        const { fetchMetalsPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchMetalsPrice(symbol.toUpperCase())
        
        if (data && data.price) {
          if (!name) {
            setName(formatMetalForDisplay(symbol))
          }
        }
        
        if (data && data.price) {
          setHistoricalDataReady(true)
        }
      }
    } catch (error: any) {
      console.error('Error fetching price:', error)
      setError(error.message || 'Failed to fetch price data')
      setInitializingHistoricalData(false)
      setHistoricalDataReady(false)
    } finally {
      setFetchingPrice(false)
      setInitializingHistoricalData(false)
    }
  }

  const handleCryptoSelect = (selectedSymbol: string) => {
    setSymbol(selectedSymbol)
    if (!name) {
      setName(formatSymbolForDisplay(selectedSymbol))
    }
  }

  const handleMetalSelect = (selectedSymbol: string) => {
    setSymbol(selectedSymbol)
    if (!name) {
      setName(formatMetalForDisplay(selectedSymbol))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    const finalAssetType = restrictToAssetType || assetType
    
    const asset: Omit<TrackedAsset, 'id' | 'createdAt' | 'updatedAt'> = {
      assetType: finalAssetType,
      symbol: symbol.toUpperCase().trim(),
      name: name.trim() || symbol.toUpperCase().trim(),
      currency: currency.trim(),
      notes: notes.trim() || undefined,
    }

    try {
      await onSave(asset)
      onOpenChange(false)
    } catch (error: any) {
      setError(error.message || 'Failed to add asset')
    }
  }

  const effectiveAssetType = restrictToAssetType || assetType
  const needsHistoricalData = effectiveAssetType === 'pk-equity' || effectiveAssetType === 'us-equity' || effectiveAssetType === 'crypto' || effectiveAssetType === 'metals' || effectiveAssetType === 'kse100' || effectiveAssetType === 'spx500'
  
  const isFormValid = symbol.trim() && 
                      name.trim() &&
                      (!needsHistoricalData || historicalDataReady)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Asset to Screener</DialogTitle>
          <DialogDescription>
            Add an asset to track and analyze. Historical data will be fetched automatically.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="assetType">Asset Type *</Label>
                {restrictToAssetType ? (
                  <Input
                    id="assetType"
                    value={ASSET_TYPE_LABELS[restrictToAssetType]}
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                ) : (
                  <Select value={assetType} onValueChange={(value) => setAssetType(value as AssetType)}>
                    <SelectTrigger id="assetType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ASSET_TYPE_LABELS)
                        .filter(([key]) => key !== 'cash' && key !== 'fd' && key !== 'commodities') // Exclude these from asset screener
                        .map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Currency *</Label>
                {restrictToAssetType === 'pk-equity' ? (
                  <Input
                    id="currency"
                    value="PKR"
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                ) : (
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="PKR">PKR</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol/Ticker *</Label>
                {effectiveAssetType === 'crypto' ? (
                  <CryptoSelector
                    value={symbol}
                    onValueChange={handleCryptoSelect}
                  />
                  ) : effectiveAssetType === 'metals' ? (
                  <MetalsSelector
                    value={symbol}
                    onValueChange={handleMetalSelect}
                  />
                  ) : effectiveAssetType === 'kse100' || effectiveAssetType === 'spx500' ? (
                  <Input
                    id="symbol"
                    value={symbol}
                    disabled
                    className="bg-muted cursor-not-allowed"
                    placeholder={effectiveAssetType === 'kse100' ? 'KSE100' : 'SPX500'}
                    required
                  />
                ) : (
                  <Input
                    id="symbol"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    placeholder={
                      effectiveAssetType === 'pk-equity'
                        ? 'PTC, HBL, UBL, etc.'
                        : 'AAPL, TSLA, etc.'
                    }
                    required
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Optional - auto-filled from symbol"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this asset..."
                rows={3}
              />
            </div>

            {(effectiveAssetType === 'crypto' || effectiveAssetType === 'pk-equity' || effectiveAssetType === 'us-equity' || effectiveAssetType === 'metals' || effectiveAssetType === 'kse100' || effectiveAssetType === 'spx500') && symbol && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={fetchCurrentPrice}
                  disabled={fetchingPrice || !symbol}
                >
                  {fetchingPrice ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Fetch Price Data
                    </>
                  )}
                </Button>
                <p className="text-sm text-muted-foreground">
                  Click to fetch current price and historical data
                </p>
              </div>
            )}
          </div>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {initializingHistoricalData && (
            <Alert className="mb-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Fetching and storing all historical data for {symbol.toUpperCase()}. This may take a moment...
              </AlertDescription>
            </Alert>
          )}
          
          {needsHistoricalData && !historicalDataReady && !initializingHistoricalData && symbol && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please click "Fetch Price Data" to retrieve historical data before adding this asset.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!isFormValid || initializingHistoricalData || (needsHistoricalData && !historicalDataReady)}
            >
              {initializingHistoricalData ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fetching Data...
                </>
              ) : (
                'Add Asset'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}




