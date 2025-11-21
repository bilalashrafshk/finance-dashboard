"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react"
import type { Holding } from "@/lib/portfolio/types"
import { formatCurrency } from "@/lib/portfolio/portfolio-utils"
import { parseSymbolToBinance } from "@/lib/portfolio/binance-api"

interface SellHoldingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  holding: Holding | null
  onSell: (holding: Holding, quantity: number, price: number, date: string, fees?: number, notes?: string) => Promise<void>
}

export function SellHoldingDialog({ open, onOpenChange, holding, onSell }: SellHoldingDialogProps) {
  const [quantity, setQuantity] = useState('')
  const [sellPrice, setSellPrice] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')
  const [date, setDate] = useState('')
  const [fees, setFees] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchingPrice, setFetchingPrice] = useState(false)
  const [historicalPrice, setHistoricalPrice] = useState<number | null>(null)
  const [fetchingHistoricalPrice, setFetchingHistoricalPrice] = useState(false)
  const [priceRange, setPriceRange] = useState<{ min: number; max: number; center: number } | null>(null)
  
  // New state for robust data fetching
  const [initializingHistoricalData, setInitializingHistoricalData] = useState(false)
  const [historicalDataReady, setHistoricalDataReady] = useState(false)

  useEffect(() => {
    if (holding && open) {
      setQuantity('')
      setSellPrice('')
      setCurrentPrice(holding.currentPrice.toString())
      setDate(new Date().toISOString().split('T')[0])
      setFees('')
      setNotes('')
      setError(null)
      setHistoricalPrice(null)
      setPriceRange(null)
      setInitializingHistoricalData(false)
      setHistoricalDataReady(false)
      
      // Auto-fetch current price and initialize historical data if needed
      fetchCurrentPrice()
    }
  }, [holding, open])

  // Check if historical data exists in DB and wait for it to be ready
  const waitForHistoricalData = async (
    assetType: string,
    symbol: string,
    maxWaitTime: number = 30000 // 30 seconds max
  ): Promise<boolean> => {
    const startTime = Date.now()
    const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
    
    // For indices and metals, if DB is empty, fetch all historical data first
    if (assetType === 'kse100' || assetType === 'spx500' || assetType === 'metals') {
      try {
        // Check if DB has data
        const checkUrl = `/api/historical-data?assetType=${assetType}&symbol=${encodeURIComponent(symbol)}&limit=1`
        const checkResponse = await deduplicatedFetch(checkUrl)
        const hasData = checkResponse.ok && (await checkResponse.json()).data?.length > 0
        
        if (!hasData) {
          console.log(`[Sell Holding] DB is empty for ${assetType}/${symbol}, fetching all historical data...`)
          
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
                  return true
                }
              } catch (storeError) {
                console.error(`[Sell Holding] Error storing data for ${symbol}:`, storeError)
              }
            }
          }
        } else {
          return true
        }
      } catch (error) {
        console.error(`[Sell Holding] Error fetching historical data for ${assetType}/${symbol}:`, error)
      }
    }
    
    // For other asset types or if fetch above failed, poll DB
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

  // Fetch current price
  const fetchCurrentPrice = useCallback(async () => {
    if (!holding) return

    try {
      setFetchingPrice(true)
      setInitializingHistoricalData(false)
      setHistoricalDataReady(false)

      const assetType = holding.assetType
      const symbol = holding.symbol.toUpperCase()

      // First, check if DB has data
      const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
      const market = assetType === 'pk-equity' ? 'PSX' : assetType === 'us-equity' ? 'US' : null
      const checkUrl = `/api/historical-data?assetType=${assetType}&symbol=${encodeURIComponent(symbol)}${market ? `&market=${market}` : ''}&limit=1`
      const checkResponse = await deduplicatedFetch(checkUrl)
      const hasExistingData = checkResponse.ok && (await checkResponse.json()).data?.length > 0
      
      if (!hasExistingData) {
        setInitializingHistoricalData(true)
      } else {
        setHistoricalDataReady(true)
      }

      if (assetType === 'crypto') {
        const binanceSymbol = parseSymbolToBinance(symbol)
        const { fetchCryptoPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchCryptoPrice(binanceSymbol)
        if (data && data.price) {
          setCurrentPrice(data.price.toString())
        }
        
        if (!hasExistingData) {
          const dataReady = await waitForHistoricalData('crypto', binanceSymbol)
          setHistoricalDataReady(dataReady)
        }
      } else if (assetType === 'pk-equity') {
        const { fetchPKEquityPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchPKEquityPrice(symbol)
        if (data && data.price) {
          setCurrentPrice(data.price.toString())
        }
        
        if (!hasExistingData) {
          const dataReady = await waitForHistoricalData('pk-equity', symbol)
          setHistoricalDataReady(dataReady)
        }
      } else if (assetType === 'us-equity') {
        const { fetchUSEquityPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchUSEquityPrice(symbol)
        if (data && data.price) {
          setCurrentPrice(data.price.toString())
        }
        
        if (!hasExistingData) {
          const dataReady = await waitForHistoricalData('us-equity', symbol)
          setHistoricalDataReady(dataReady)
        }
      } else if (assetType === 'metals') {
        const { fetchMetalsPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchMetalsPrice(symbol)
        if (data && data.price) {
          setCurrentPrice(data.price.toString())
        }
        
        if (!hasExistingData) {
          const dataReady = await waitForHistoricalData('metals', symbol)
          setHistoricalDataReady(dataReady)
        }
      }
    } catch (error) {
      console.error('Error fetching current price:', error)
      setHistoricalDataReady(false)
    } finally {
      setFetchingPrice(false)
      setInitializingHistoricalData(false)
    }
  }, [holding])

  // Fetch historical price for sell date validation
  const fetchHistoricalPriceForDate = useCallback(async () => {
    if (!holding || !date) {
      setHistoricalPrice(null)
      setPriceRange(null)
      return
    }

    const assetType = holding.assetType
    const symbol = holding.symbol.toUpperCase()
    const supportsHistoricalData = assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals'

    if (!supportsHistoricalData) {
      setHistoricalPrice(null)
      setPriceRange(null)
      return
    }

    try {
      setFetchingHistoricalPrice(true)
      
      // If we're still initializing historical data, wait a bit
      if (initializingHistoricalData) {
        let waitCount = 0
        while (initializingHistoricalData && waitCount < 60) {
          await new Promise(resolve => setTimeout(resolve, 500))
          waitCount++
        }
      }

      const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
      
      let historicalData: any[] | null = null
      const dateStr = new Date(date).toISOString().split('T')[0]

      if (assetType === 'pk-equity') {
        const response = await deduplicatedFetch(`/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(symbol)}&market=PSX`)
        if (response.ok) {
          const data = await response.json()
          const dbRecords = data.data || []
          const { dbRecordToStockAnalysis } = await import('@/lib/portfolio/db-to-chart-format')
          historicalData = dbRecords.map(dbRecordToStockAnalysis)
        }
      } else if (assetType === 'us-equity') {
        const response = await deduplicatedFetch(`/api/historical-data?assetType=us-equity&symbol=${encodeURIComponent(symbol)}&market=US`)
        if (response.ok) {
          const data = await response.json()
          const dbRecords = data.data || []
          const { dbRecordToStockAnalysis } = await import('@/lib/portfolio/db-to-chart-format')
          historicalData = dbRecords.map(dbRecordToStockAnalysis)
        }
      } else if (assetType === 'crypto') {
        const binanceSymbol = parseSymbolToBinance(symbol)
        const response = await deduplicatedFetch(`/api/historical-data?assetType=crypto&symbol=${encodeURIComponent(binanceSymbol)}`)
        if (response.ok) {
          const data = await response.json()
          const dbRecords = data.data || []
          const { dbRecordToBinance } = await import('@/lib/portfolio/db-to-chart-format')
          historicalData = dbRecords.map(dbRecordToBinance)
        }
      } else if (assetType === 'metals') {
        const response = await deduplicatedFetch(`/api/historical-data?assetType=metals&symbol=${encodeURIComponent(symbol)}`)
        if (response.ok) {
          const data = await response.json()
          const dbRecords = data.data || []
          const { dbRecordToInvesting } = await import('@/lib/portfolio/db-to-chart-format')
          historicalData = dbRecords.map(dbRecordToInvesting)
        }
      }

      if (historicalData && historicalData.length > 0) {
        // Find price for the sell date
        let pricePoint: any = null
        
        if (assetType === 'crypto') {
          pricePoint = historicalData.find((d: any) => d.date === dateStr)
          if (!pricePoint) {
            const beforeDates = historicalData.filter((d: any) => d.date <= dateStr)
            if (beforeDates.length > 0) {
              pricePoint = beforeDates.sort((a: any, b: any) => b.date.localeCompare(a.date))[0]
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
        } else {
          // StockAnalysis format
          pricePoint = historicalData.find((d: any) => d.t === dateStr)
          if (!pricePoint) {
            const beforeDates = historicalData.filter((d: any) => d.t <= dateStr)
            if (beforeDates.length > 0) {
              pricePoint = beforeDates.sort((a: any, b: any) => b.t.localeCompare(a.t))[0]
            }
          }
          if (pricePoint) {
            const closePrice = pricePoint.c
            setHistoricalPrice(closePrice)
            setPriceRange({
              center: closePrice,
              min: closePrice * 0.95,
              max: closePrice * 1.05,
            })
          }
        }
        
        // If DB was previously empty and we just populated it, we might have set historicalDataReady to true
        if (!historicalDataReady) setHistoricalDataReady(true)
        
      } else {
        setHistoricalPrice(null)
        setPriceRange(null)
      }
    } catch (error) {
      console.error('Error fetching historical price:', error)
      setHistoricalPrice(null)
      setPriceRange(null)
    } finally {
      setFetchingHistoricalPrice(false)
    }
  }, [holding, date, initializingHistoricalData, historicalDataReady])

  // Fetch historical price when date changes
  useEffect(() => {
    if (date && holding) {
      const timeoutId = setTimeout(() => {
        fetchHistoricalPriceForDate()
      }, 500)
      return () => clearTimeout(timeoutId)
    } else {
      setHistoricalPrice(null)
      setPriceRange(null)
    }
  }, [date, holding, fetchHistoricalPriceForDate])

  // Validate sell price against range
  const getPriceValidation = () => {
    if (!priceRange || !sellPrice) {
      return { isValid: true, message: null, isError: false }
    }

    const enteredPrice = parseFloat(sellPrice)
    if (isNaN(enteredPrice)) {
      return { isValid: true, message: null, isError: false }
    }

    if (enteredPrice < priceRange.min || enteredPrice > priceRange.max) {
      return {
        isValid: false,
        message: `Price must be within ±5% of ${formatCurrency(priceRange.center, holding?.currency || 'USD')} (Range: ${formatCurrency(priceRange.min, holding?.currency || 'USD')} - ${formatCurrency(priceRange.max, holding?.currency || 'USD')})`,
        isError: true,
      }
    }

    return {
      isValid: true,
      message: `Price within expected range (±5% of ${formatCurrency(priceRange.center, holding?.currency || 'USD')})`,
      isError: false,
    }
  }

  const priceValidation = getPriceValidation()

  if (!holding) return null

  const maxQuantity = holding.quantity
  const quantityNum = parseFloat(quantity) || 0
  const sellPriceNum = parseFloat(sellPrice) || 0
  const feesNum = parseFloat(fees) || 0
  const proceeds = quantityNum * sellPriceNum - feesNum
  const purchasePrice = holding.purchasePrice
  const realizedPnL = (sellPriceNum - purchasePrice) * quantityNum - feesNum
  const realizedPnLPercent = purchasePrice > 0 ? ((sellPriceNum - purchasePrice) / purchasePrice) * 100 : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!quantity || quantityNum <= 0) {
      setError('Please enter a valid quantity')
      return
    }

    if (quantityNum > maxQuantity) {
      setError(`Cannot sell more than ${maxQuantity.toLocaleString()} shares`)
      return
    }

    if (!sellPrice || sellPriceNum <= 0) {
      setError('Please enter a valid sell price')
      return
    }

    // Validate price is within ±5% if historical price is available
    if (priceRange && (sellPriceNum < priceRange.min || sellPriceNum > priceRange.max)) {
      setError(`Sell price must be within ±5% of ${formatCurrency(priceRange.center, holding.currency)} (Range: ${formatCurrency(priceRange.min, holding.currency)} - ${formatCurrency(priceRange.max, holding.currency)})`)
      return
    }

    if (!date) {
      setError('Please select a sell date')
      return
    }

    setIsSubmitting(true)
    try {
      await onSell(
        holding,
        quantityNum,
        sellPriceNum,
        date,
        feesNum > 0 ? feesNum : undefined,
        notes.trim() || undefined
      )
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || 'Failed to sell holding')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Ensure historical data is ready before allowing submit? 
  // Usually for sell we care that IF validation data is available, we use it.
  // But if we're initializing, maybe we should show a loader?

  const isFormValid = quantity && quantityNum > 0 && quantityNum <= maxQuantity && sellPrice && sellPriceNum > 0 && date && priceValidation.isValid

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sell {holding.symbol}</DialogTitle>
          <DialogDescription>
            Sell shares of {holding.name || holding.symbol}. Proceeds will be added to Cash ({holding.currency}).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Current Holding Info */}
            <div className="p-3 bg-muted rounded-lg space-y-1">
              <div className="text-sm text-muted-foreground">Available to Sell</div>
              <div className="text-lg font-semibold">{maxQuantity.toLocaleString()} shares</div>
              <div className="text-xs text-muted-foreground">
                Avg. Purchase Price: {formatCurrency(purchasePrice, holding.currency)}
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity to Sell *</Label>
              <Input
                id="quantity"
                type="number"
                step="any"
                min="0"
                max={maxQuantity}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                required
              />
              <div className="text-xs text-muted-foreground">
                Max: {maxQuantity.toLocaleString()} shares
              </div>
            </div>

            {/* Current Price */}
            <div className="space-y-2">
              <Label htmlFor="currentPrice">Current Price</Label>
              <div className="flex gap-2">
                <Input
                  id="currentPrice"
                  type="number"
                  step="any"
                  value={currentPrice}
                  onChange={(e) => setCurrentPrice(e.target.value)}
                  placeholder="0.00"
                  disabled
                  className="flex-1 bg-muted"
                />
                {(holding.assetType === 'crypto' || holding.assetType === 'pk-equity' || holding.assetType === 'us-equity' || holding.assetType === 'metals') && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={fetchCurrentPrice}
                    disabled={fetchingPrice}
                    title="Fetch current price"
                  >
                    {fetchingPrice ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Sell Price */}
            <div className="space-y-2">
              <Label htmlFor="sellPrice">Sell Price per Share *</Label>
              <div className="space-y-1">
                <Input
                  id="sellPrice"
                  type="number"
                  step="any"
                  min="0"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  placeholder="0.00"
                  required
                  className={priceValidation.isError ? "border-red-500 focus-visible:ring-red-500" : ""}
                />
                {fetchingHistoricalPrice && date && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {priceRange ? `Updating historical price for ${date}...` : `Fetching historical price for ${date}...`}
                  </p>
                )}
                {priceRange && !fetchingHistoricalPrice && (
                  <p className="text-xs text-muted-foreground">
                    Expected range: {formatCurrency(priceRange.min, holding.currency)} - {formatCurrency(priceRange.max, holding.currency)} (±5% of {formatCurrency(priceRange.center, holding.currency)})
                  </p>
                )}
                {priceValidation.message && (
                  <Alert className={priceValidation.isError ? "border-red-500 bg-red-50 dark:bg-red-950" : "border-green-500 bg-green-50 dark:bg-green-950"}>
                    <div className="flex items-center gap-2">
                      {priceValidation.isError ? (
                        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      )}
                      <AlertDescription className={priceValidation.isError ? "text-red-800 dark:text-red-200" : "text-green-800 dark:text-green-200"}>
                        {priceValidation.message}
                      </AlertDescription>
                    </div>
                  </Alert>
                )}
              </div>
            </div>

            {/* Sell Date */}
            <div className="space-y-2">
              <Label htmlFor="date">Sell Date *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                required
              />
            </div>

            {/* Fees (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="fees">Fees/Commissions (Optional)</Label>
              <Input
                id="fees"
                type="number"
                step="any"
                min="0"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this sale..."
                rows={2}
              />
            </div>

            {/* Preview */}
            {isFormValid && (
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Proceeds:</span>
                  <span className="font-semibold">{formatCurrency(proceeds, holding.currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Realized P&L:</span>
                  <span className={`font-semibold ${realizedPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatCurrency(realizedPnL, holding.currency)} ({realizedPnLPercent >= 0 ? '+' : ''}{realizedPnLPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>
            )}

            {/* Show loading state when initializing historical data */}
            {initializingHistoricalData && (
              <Alert className="mb-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  Fetching and storing all historical data for {holding.symbol}. This may take a moment...
                </AlertDescription>
              </Alert>
            )}

            {/* Error message */}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid || isSubmitting}>
              {isSubmitting ? 'Selling...' : 'Sell'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
