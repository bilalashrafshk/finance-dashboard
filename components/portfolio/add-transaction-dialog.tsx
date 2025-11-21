"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, RefreshCw, AlertCircle } from "lucide-react"
import { CryptoSelector } from "./crypto-selector"
import { MetalsSelector } from "./metals-selector"
import type { AssetType } from "@/lib/portfolio/types"
import { ASSET_TYPE_LABELS } from "@/lib/portfolio/types"
import { formatSymbolForDisplay, parseSymbolToBinance } from "@/lib/portfolio/binance-api"
import { formatMetalForDisplay } from "@/lib/portfolio/metals-api"
import type { Holding } from "@/lib/portfolio/types"
import { combineHoldingsByAsset } from "@/lib/portfolio/portfolio-utils"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface Trade {
  id: number
  tradeType: 'buy' | 'sell' | 'add'
  assetType: string
  symbol: string
  name: string
  quantity: number
  price: number
  totalAmount: number
  currency: string
  tradeDate: string
  notes: string | null
}

interface AddTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (trade: Omit<Trade, 'id'>) => Promise<void>
  editingTrade?: Trade | null
  holdings?: Holding[] // Holdings to show when selling
}

export function AddTransactionDialog({ open, onOpenChange, onSave, editingTrade, holdings = [] }: AddTransactionDialogProps) {
  const [tradeType, setTradeType] = useState<'buy' | 'sell' | 'add'>('buy')
  const [assetType, setAssetType] = useState<AssetType>('us-equity')
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().split('T')[0])
  const [currency, setCurrency] = useState('USD')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedHoldingId, setSelectedHoldingId] = useState<string>('')
  
  // Price fetching states
  const [fetchingPrice, setFetchingPrice] = useState(false)
  const [priceFetched, setPriceFetched] = useState(false)
  const [fetchingHistoricalPrice, setFetchingHistoricalPrice] = useState(false)
  const [historicalPrice, setHistoricalPrice] = useState<number | null>(null)
  const [priceRange, setPriceRange] = useState<{ min: number; max: number; center: number } | null>(null)
  const [historicalDataReady, setHistoricalDataReady] = useState(false)

  useEffect(() => {
    if (editingTrade) {
      setTradeType(editingTrade.tradeType)
      setAssetType(editingTrade.assetType as AssetType)
      setSymbol(editingTrade.symbol)
      setName(editingTrade.name)
      setQuantity(editingTrade.quantity.toString())
      setPrice(editingTrade.price.toString())
      setTradeDate(editingTrade.tradeDate)
      setCurrency(editingTrade.currency)
      setNotes(editingTrade.notes || '')
      setPriceFetched(true) // Price is known for editing
      setHistoricalDataReady(true) // Assume data is ready for editing
    } else {
      // Reset form
      setTradeType('buy')
      setAssetType('us-equity')
      setSymbol('')
      setName('')
      setQuantity('')
      setPrice('')
      setTradeDate(new Date().toISOString().split('T')[0])
      setCurrency('USD')
      setNotes('')
      setSelectedHoldingId('')
      setPriceFetched(false)
      setHistoricalDataReady(false)
      setHistoricalPrice(null)
      setPriceRange(null)
    }
  }, [editingTrade, open])

  // Get available holdings for sell (combined by asset) - show ALL holdings user owns
  const availableHoldings = useMemo(() => {
    if (tradeType !== 'sell' || holdings.length === 0) {
      return []
    }
    // Combine holdings by asset and show only those with quantity > 0
    const combined = combineHoldingsByAsset(holdings)
    return combined.filter(h => h.quantity > 0) // Only show holdings with quantity > 0
  }, [holdings, tradeType])

  // When holding is selected for sell, auto-fill fields
  useEffect(() => {
    if (tradeType === 'sell' && selectedHoldingId && availableHoldings.length > 0) {
      const holding = availableHoldings.find(h => h.id === selectedHoldingId)
      if (holding) {
        setAssetType(holding.assetType)
        setSymbol(holding.symbol)
        setName(holding.name)
        setCurrency(holding.currency)
        setPrice(holding.currentPrice.toString())
        setPriceFetched(true) // Price is already known from holding
        // Pre-fill quantity with available quantity (user can change)
        setQuantity(holding.quantity.toString())
      }
    } else if (tradeType === 'sell' && !selectedHoldingId) {
      // Reset when no holding selected
      setPriceFetched(false)
      setPrice('')
      setQuantity('')
    }
  }, [selectedHoldingId, tradeType, availableHoldings])

  // Auto-set currency based on asset type (for buy/add, and when asset type changes)
  useEffect(() => {
    if (!editingTrade && open) {
      // For sell, currency is set when holding is selected, so skip auto-setting
      if (tradeType === 'sell' && selectedHoldingId) {
        return
      }
      
      // Auto-set currency based on asset type
      if (assetType === 'pk-equity' || assetType === 'kse100') {
        setCurrency('PKR')
        if (assetType === 'kse100') {
          setSymbol('KSE100')
          setName('KSE 100 Index')
        }
      } else if (assetType === 'us-equity' || assetType === 'spx500' || assetType === 'crypto' || assetType === 'metals' || assetType === 'commodities') {
        setCurrency('USD')
        if (assetType === 'spx500') {
          setSymbol('SPX500')
          setName('S&P 500 Index')
        }
      }
      // Cash and FD can be in any currency, don't auto-set
    }
  }, [assetType, editingTrade, open, tradeType, selectedHoldingId])

  const handleCryptoSelect = (crypto: string) => {
    setSymbol(crypto)
    const displayName = formatSymbolForDisplay(crypto)
    setName(displayName)
  }

  const handleMetalSelect = (metal: string) => {
    setSymbol(metal)
    const displayName = formatMetalForDisplay(metal)
    setName(displayName)
  }

  // Fetch historical price for transaction date validation
  const fetchHistoricalPriceForDate = useCallback(async () => {
    // Only fetch for asset types that support historical data
    const supportsHistoricalData = assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500'
    
    if (!supportsHistoricalData || !symbol || !tradeDate || tradeType === 'sell' || tradeType === 'add') {
      setHistoricalPrice(null)
      setPriceRange(null)
      return
    }

    try {
      setFetchingHistoricalPrice(true)
      
      const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
      let historicalData: any[] | null = null
      
      if (assetType === 'pk-equity') {
        const response = await deduplicatedFetch(`/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(symbol.toUpperCase())}&market=PSX`)
        if (response.ok) {
          const data = await response.json()
          const dbRecords = data.data || []
          const { dbRecordToStockAnalysis } = await import('@/lib/portfolio/db-to-chart-format')
          historicalData = dbRecords.map(dbRecordToStockAnalysis)
          if (historicalData.length > 0) {
            setHistoricalDataReady(true)
          }
        }
      } else if (assetType === 'us-equity') {
        const response = await deduplicatedFetch(`/api/historical-data?assetType=us-equity&symbol=${encodeURIComponent(symbol.toUpperCase())}&market=US`)
        if (response.ok) {
          const data = await response.json()
          const dbRecords = data.data || []
          const { dbRecordToStockAnalysis } = await import('@/lib/portfolio/db-to-chart-format')
          historicalData = dbRecords.map(dbRecordToStockAnalysis)
          if (historicalData.length > 0) {
            setHistoricalDataReady(true)
          }
        }
      } else if (assetType === 'crypto') {
        const binanceSymbol = parseSymbolToBinance(symbol)
        const response = await deduplicatedFetch(`/api/historical-data?assetType=crypto&symbol=${encodeURIComponent(binanceSymbol)}`)
        if (response.ok) {
          const data = await response.json()
          const dbRecords = data.data || []
          const { dbRecordToBinance } = await import('@/lib/portfolio/db-to-chart-format')
          historicalData = dbRecords.map(dbRecordToBinance)
          if (historicalData.length > 0) {
            setHistoricalDataReady(true)
          }
        }
      } else if (assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500') {
        const apiAssetType = assetType === 'kse100' ? 'kse100' : assetType === 'spx500' ? 'spx500' : 'metals'
        const response = await deduplicatedFetch(`/api/historical-data?assetType=${apiAssetType}&symbol=${encodeURIComponent(symbol.toUpperCase())}`)
        if (response.ok) {
          const data = await response.json()
          const dbRecords = data.data || []
          if (dbRecords.length > 0) {
            const { dbRecordToInvesting } = await import('@/lib/portfolio/db-to-chart-format')
            historicalData = dbRecords.map(dbRecordToInvesting)
            setHistoricalDataReady(true)
          }
        }
      }

      if (historicalData && historicalData.length > 0) {
        const tradeDateStr = new Date(tradeDate).toISOString().split('T')[0]
        let pricePoint: any = null
        
        if (assetType === 'crypto') {
          pricePoint = historicalData.find((d: any) => d.date === tradeDateStr)
          if (!pricePoint) {
            const beforeDates = historicalData.filter((d: any) => d.date <= tradeDateStr)
            if (beforeDates.length > 0) {
              pricePoint = beforeDates.sort((a: any, b: any) => b.date.localeCompare(a.date))[0]
            }
          }
        } else {
          pricePoint = historicalData.find((d: any) => d.date === tradeDateStr)
          if (!pricePoint) {
            const beforeDates = historicalData.filter((d: any) => d.date <= tradeDateStr)
            if (beforeDates.length > 0) {
              pricePoint = beforeDates.sort((a: any, b: any) => b.date.localeCompare(a.date))[0]
            }
          }
        }
        
        if (pricePoint) {
          const closePrice = pricePoint.close
          setHistoricalPrice(closePrice)
          setPriceRange({
            center: closePrice,
            min: closePrice * 0.95,
            max: closePrice * 1.05,
          })
        }
      }
    } catch (error) {
      console.error('Error fetching historical price:', error)
    } finally {
      setFetchingHistoricalPrice(false)
    }
  }, [assetType, symbol, tradeDate, tradeType])

  // Fetch historical price when trade date, symbol, or asset type changes (for buy transactions)
  useEffect(() => {
    if (tradeDate && symbol && tradeType === 'buy' && (assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500')) {
      const timeoutId = setTimeout(() => {
        fetchHistoricalPriceForDate()
      }, 500)
      return () => clearTimeout(timeoutId)
    } else {
      setHistoricalPrice(null)
      setPriceRange(null)
    }
  }, [tradeDate, symbol, assetType, tradeType, fetchHistoricalPriceForDate])

  // Fetch current price for buy transactions
  const fetchCurrentPrice = async () => {
    if (!symbol || tradeType !== 'buy') return

    try {
      setFetchingPrice(true)
      setPriceFetched(false)
      
      if (assetType === 'crypto') {
        const binanceSymbol = parseSymbolToBinance(symbol)
        const { fetchCryptoPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchCryptoPrice(binanceSymbol)
        if (data && data.price) {
          setPrice(data.price.toString())
          setPriceFetched(true)
          if (!name) {
            setName(formatSymbolForDisplay(binanceSymbol))
          }
        }
      } else if (assetType === 'pk-equity') {
        const { fetchPKEquityPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchPKEquityPrice(symbol.toUpperCase())
        if (data && data.price) {
          setPrice(data.price.toString())
          setPriceFetched(true)
          if (!name) {
            setName(symbol.toUpperCase())
          }
        }
      } else if (assetType === 'us-equity') {
        const { fetchUSEquityPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchUSEquityPrice(symbol.toUpperCase())
        if (data && data.price) {
          setPrice(data.price.toString())
          setPriceFetched(true)
          if (!name) {
            setName(symbol.toUpperCase())
          }
        }
      } else if (assetType === 'kse100' || assetType === 'spx500') {
        const indexSymbol = assetType === 'kse100' ? 'KSE100' : 'SPX500'
        const { fetchIndicesPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchIndicesPrice(indexSymbol)
        if (data && data.price) {
          setPrice(data.price.toString())
          setPriceFetched(true)
          if (!name) {
            setName(assetType === 'kse100' ? 'KSE 100 Index' : 'S&P 500 Index')
          }
        }
      } else if (assetType === 'metals') {
        const { fetchMetalsPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchMetalsPrice(symbol.toUpperCase())
        if (data && data.price) {
          setPrice(data.price.toString())
          setPriceFetched(true)
          if (!name) {
            setName(formatMetalForDisplay(symbol))
          }
        }
      }
    } catch (error) {
      console.error('Error fetching price:', error)
    } finally {
      setFetchingPrice(false)
    }
  }

  // Auto-fetch price when symbol changes for buy transactions
  useEffect(() => {
    if (tradeType === 'buy' && symbol && assetType && !editingTrade && open) {
      const timeoutId = setTimeout(() => {
        fetchCurrentPrice()
      }, 500)
      return () => clearTimeout(timeoutId)
    }
  }, [symbol, assetType, tradeType, editingTrade, open])

  // Validate price against range
  const getPriceValidation = () => {
    if (!priceRange || !price || tradeType !== 'buy') {
      return { isValid: true, message: null, isWarning: false }
    }

    const enteredPrice = parseFloat(price)
    if (isNaN(enteredPrice)) {
      return { isValid: true, message: null, isWarning: false }
    }

    if (enteredPrice < priceRange.min || enteredPrice > priceRange.max) {
      return {
        isValid: false,
        message: `Price outside expected range (${priceRange.min.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })} - ${priceRange.max.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })})`,
        isWarning: true,
      }
    }

    return {
      isValid: true,
      message: `Price within expected range (±5% of ${priceRange.center.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })})`,
      isWarning: false,
    }
  }

  const priceValidation = getPriceValidation()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const quantityNum = parseFloat(quantity)
    const priceNum = parseFloat(price)
    
    if (!quantityNum || !priceNum || !symbol || !name || !tradeDate) {
      return
    }

    // Validate sell quantity doesn't exceed available
    if (tradeType === 'sell' && selectedHolding) {
      if (quantityNum > selectedHolding.quantity) {
        alert(`Cannot sell more than available. You have ${selectedHolding.quantity.toLocaleString()} ${selectedHolding.symbol.toUpperCase()}`)
        return
      }
    }

    const totalAmount = quantityNum * priceNum

    setSaving(true)
    try {
      await onSave({
        tradeType,
        assetType,
        symbol: symbol.toUpperCase(),
        name,
        quantity: quantityNum,
        price: priceNum,
        totalAmount,
        currency,
        tradeDate,
        notes: notes || null,
      })
      onOpenChange(false)
    } catch (error) {
      console.error('Error saving transaction:', error)
    } finally {
      setSaving(false)
    }
  }

  // Get selected holding for validation
  const selectedHolding = selectedHoldingId ? availableHoldings.find(h => h.id === selectedHoldingId) : null
  const maxQuantity = selectedHolding ? selectedHolding.quantity : Infinity
  const quantityNum = parseFloat(quantity) || 0
  const exceedsAvailable = tradeType === 'sell' && selectedHolding && quantityNum > maxQuantity

  // Form validation - for buy transactions, require price fetch
  const needsPriceFetch = tradeType === 'buy' && (assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500')
  const needsHistoricalData = tradeType === 'buy' && (assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500')
  const hasTradeDate = !!tradeDate
  const needsTradeDatePrice = needsHistoricalData && hasTradeDate

  const isFormValid = 
    symbol && 
    name && 
    quantity && 
    quantityNum > 0 &&
    !exceedsAvailable &&
    price && 
    parseFloat(price) > 0 &&
    tradeDate &&
    (tradeType !== 'sell' || selectedHoldingId) && // For sell, must select a holding
    (!needsPriceFetch || priceFetched) && // For buy, price must be fetched
    (!needsHistoricalData || historicalDataReady) && // Historical data must be ready
    (!needsTradeDatePrice || historicalPrice !== null) && // Trade date price must be available
    priceValidation.isValid // Price must be within expected range

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingTrade ? 'Edit Transaction' : 'Add Transaction'}</DialogTitle>
          <DialogDescription>
            {editingTrade 
              ? 'Update the transaction details.' 
              : 'Record a new transaction (buy, sell, or add cash/deposit).'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tradeType">Transaction Type *</Label>
                <Select value={tradeType} onValueChange={(value) => {
                  setTradeType(value as 'buy' | 'sell' | 'add')
                  setSelectedHoldingId('') // Reset holding selection when changing type
                  setPriceFetched(false) // Reset price fetched state
                  setHistoricalDataReady(false) // Reset historical data ready
                  setHistoricalPrice(null) // Reset historical price
                  setPriceRange(null) // Reset price range
                }}>
                  <SelectTrigger id="tradeType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                    <SelectItem value="add">Add (Cash/Deposit)</SelectItem>
                  </SelectContent>
                </Select>
                {tradeType === 'add' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Add cash or deposits to your portfolio
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="assetType">Asset Type *</Label>
                {tradeType === 'sell' && selectedHoldingId ? (
                  <Input
                    id="assetType"
                    value={ASSET_TYPE_LABELS[assetType as AssetType]}
                    disabled
                    className="bg-muted cursor-not-allowed"
                    required
                  />
                ) : (
                  <Select value={assetType} onValueChange={(value) => setAssetType(value as AssetType)}>
                    <SelectTrigger id="assetType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ASSET_TYPE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currency">Currency *</Label>
                {tradeType === 'sell' && selectedHoldingId ? (
                  <Input
                    id="currency"
                    value={currency}
                    disabled
                    className="bg-muted cursor-not-allowed"
                    required
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

              <div className="space-y-2">
                <Label htmlFor="tradeDate">Transaction Date *</Label>
                <Input
                  id="tradeDate"
                  type="date"
                  value={tradeDate}
                  onChange={(e) => setTradeDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Show holdings selector when selling */}
            {tradeType === 'sell' && (
              <div className="space-y-2">
                <Label htmlFor="holdingSelect">Select Holding to Sell *</Label>
                {availableHoldings.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No holdings available to sell. You need to buy assets first.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <Select value={selectedHoldingId} onValueChange={setSelectedHoldingId}>
                      <SelectTrigger id="holdingSelect">
                        <SelectValue placeholder="Select a holding to sell" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableHoldings.map((holding) => (
                          <SelectItem key={holding.id} value={holding.id}>
                            {holding.name || holding.symbol} ({holding.symbol.toUpperCase()}) - {holding.quantity.toLocaleString()} shares - {holding.currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedHolding && (
                      <div className="p-3 bg-muted rounded-lg space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Available Quantity:</span>
                          <span className="text-sm font-semibold">{selectedHolding.quantity.toLocaleString()} {selectedHolding.symbol.toUpperCase()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Current Price:</span>
                          <span className="text-sm">{selectedHolding.currentPrice.toLocaleString('en-US', { style: 'currency', currency: selectedHolding.currency, minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium">Total Value:</span>
                          <span className="text-sm font-semibold">{(selectedHolding.quantity * selectedHolding.currentPrice).toLocaleString('en-US', { style: 'currency', currency: selectedHolding.currency, minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol/Ticker *</Label>
                {tradeType === 'sell' && selectedHoldingId ? (
                  <Input
                    id="symbol"
                    value={symbol}
                    disabled
                    className="bg-muted cursor-not-allowed"
                    required
                  />
                ) : assetType === 'crypto' ? (
                  <CryptoSelector
                    value={symbol}
                    onValueChange={handleCryptoSelect}
                  />
                ) : assetType === 'metals' ? (
                  <MetalsSelector
                    value={symbol}
                    onValueChange={handleMetalSelect}
                  />
                ) : assetType === 'kse100' || assetType === 'spx500' ? (
                  <Input
                    id="symbol"
                    value={symbol}
                    disabled
                    className="bg-muted cursor-not-allowed"
                    placeholder={assetType === 'kse100' ? 'KSE100' : 'SPX500'}
                    required
                  />
                ) : (
                  <Input
                    id="symbol"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder={
                      assetType === 'pk-equity'
                        ? 'PTC, HBL, UBL, etc.'
                        : assetType === 'cash'
                        ? 'CASH'
                        : 'AAPL, TSLA, etc.'
                    }
                    required
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                {tradeType === 'sell' && selectedHoldingId ? (
                  <Input
                    id="name"
                    value={name}
                    disabled
                    className="bg-muted cursor-not-allowed"
                    required
                  />
                ) : (
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Asset name"
                    required
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">
                  {tradeType === 'sell' ? 'Number of Shares to Sell *' : 'Quantity *'}
                </Label>
                <Input
                  id="quantity"
                  type="number"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0.00"
                  max={tradeType === 'sell' && selectedHolding ? selectedHolding.quantity : undefined}
                  required
                />
                {tradeType === 'sell' && selectedHolding && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Available: <span className="font-semibold">{selectedHolding.quantity.toLocaleString()} shares</span>
                    </p>
                    {exceedsAvailable && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        ⚠️ Cannot sell more than available quantity
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Price per Unit *</Label>
                <div className="flex gap-2">
                  <Input
                    id="price"
                    type="number"
                    step="any"
                    value={price}
                    onChange={(e) => {
                      setPrice(e.target.value)
                      setPriceFetched(false) // Reset fetched flag if manually changed
                    }}
                    placeholder="0.00"
                    required
                    className="flex-1"
                  />
                  {tradeType === 'buy' && (assetType === 'crypto' || assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500') && symbol && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={fetchCurrentPrice}
                      disabled={fetchingPrice || !symbol}
                      title="Fetch current market price"
                    >
                      {fetchingPrice ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
                {fetchingPrice && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Fetching current price...
                  </p>
                )}
                {priceFetched && tradeType === 'buy' && (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    ✓ Current price fetched
                  </p>
                )}
                {fetchingHistoricalPrice && tradeType === 'buy' && tradeDate && symbol && (assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals') && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Fetching historical price for {tradeDate}...
                  </p>
                )}
                {priceRange && !fetchingHistoricalPrice && tradeType === 'buy' && (
                  <p className="text-xs text-muted-foreground">
                    Expected range: {priceRange.min.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })} - {priceRange.max.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })} (±5% of {priceRange.center.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })})
                  </p>
                )}
                {priceValidation.message && (
                  <p className={`text-xs ${priceValidation.isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                    {priceValidation.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Total Amount</Label>
                <div className="h-10 px-3 py-2 bg-muted rounded-md flex items-center">
                  {quantity && price && parseFloat(quantity) > 0 && parseFloat(price) > 0
                    ? (parseFloat(quantity) * parseFloat(price)).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : '0.00'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes about this transaction"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingTrade ? 'Update Transaction' : 'Add Transaction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

