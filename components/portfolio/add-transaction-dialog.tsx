"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, RefreshCw, AlertCircle, CheckCircle2, Wallet, AlertTriangle } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CryptoSelector } from "./crypto-selector"
import { MetalsSelector } from "./metals-selector"
import type { AssetType } from "@/lib/portfolio/types"
import { ASSET_TYPE_LABELS } from "@/lib/portfolio/types"
import { formatSymbolForDisplay, parseSymbolToBinance } from "@/lib/portfolio/binance-api"
import { formatMetalForDisplay } from "@/lib/portfolio/metals-api"
import type { Holding } from "@/lib/portfolio/types"
import { combineHoldingsByAsset, formatCurrency } from "@/lib/portfolio/portfolio-utils"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface Trade {
  id: number
  tradeType: 'buy' | 'sell' | 'add' | 'remove'
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
  onSave: (trade: Omit<Trade, 'id'> & { autoDeposit?: boolean }) => Promise<void>
  editingTrade?: Trade | null
  holdings?: Holding[] // Holdings to show when selling
}

export function AddTransactionDialog({ open, onOpenChange, onSave, editingTrade, holdings = [] }: AddTransactionDialogProps) {
  const [tradeType, setTradeType] = useState<'buy' | 'sell' | 'add' | 'remove'>('buy')
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
  // Cache for fetched historical data to reuse between current and historical price fetches
  const [cachedHistoricalData, setCachedHistoricalData] = useState<any[] | null>(null)
  // Track if we're initializing historical data (fetching and storing all historical data)
  const [initializingHistoricalData, setInitializingHistoricalData] = useState(false)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null) // For sell: current market price
  const [currentPriceBuy, setCurrentPriceBuy] = useState<string>('') // For buy: current market price (separate from purchase price)
  const [purchasePrice, setPurchasePrice] = useState<string>('') // For buy: purchase price (validated against historical)
  const [priceTab, setPriceTab] = useState<'current' | 'historical'>('historical') // For sell: which price to use
  const [cashBalance, setCashBalance] = useState<number | null>(null)
  const [loadingCashBalance, setLoadingCashBalance] = useState(false)
  const [autoDeposit, setAutoDeposit] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (editingTrade) {
      setError(null)
      setTradeType(editingTrade.tradeType)
      setAssetType(editingTrade.assetType as AssetType)
      setSymbol(editingTrade.symbol)
      setName(editingTrade.name)
      setQuantity(editingTrade.quantity.toString())
      if (editingTrade.tradeType === 'buy') {
        setPurchasePrice(editingTrade.price.toString())
        setCurrentPriceBuy('') // Will be fetched if needed
      } else {
        setPrice(editingTrade.price.toString())
      }
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
      setCurrentPriceBuy('')
      setPurchasePrice('')
      setTradeDate(new Date().toISOString().split('T')[0])
      setCurrency('USD')
      setNotes('')
      setSelectedHoldingId('')
      setPriceFetched(false)
      setHistoricalDataReady(false)
      setHistoricalPrice(null)
      setPriceRange(null)
      setCachedHistoricalData(null)
      setInitializingHistoricalData(false)
      setCashBalance(null)
      setLoadingCashBalance(false)
      setAutoDeposit(false)
      setError(null)
    }
  }, [editingTrade, open])

  // Fetch cash balance for the selected currency
  const fetchCashBalance = useCallback(async () => {
    // Fetch cash balance for buy transactions (non-cash assets) or remove transactions (cash withdrawals)
    if (tradeType === 'buy' && assetType === 'cash') {
      setCashBalance(null)
      return
    }
    if (tradeType !== 'buy' && tradeType !== 'remove') {
      setCashBalance(null)
      return
    }
    if (editingTrade) {
      setCashBalance(null)
      return
    }

    try {
      setLoadingCashBalance(true)
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setCashBalance(0)
        return
      }

      const response = await fetch('/api/user/holdings', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.holdings) {
          const cashHolding = data.holdings.find(
            (h: any) => h.assetType === 'cash' && h.symbol === 'CASH' && h.currency === currency
          )
          const balance = cashHolding ? Math.max(0, cashHolding.quantity) : 0 // Ensure non-negative
          setCashBalance(balance)
        } else {
          setCashBalance(0)
        }
      } else {
        setCashBalance(0)
      }
    } catch (error) {
      console.error('Error fetching cash balance:', error)
      setCashBalance(0)
    } finally {
      setLoadingCashBalance(false)
    }
  }, [currency, assetType, tradeType, editingTrade])

  // Fetch cash balance when dialog opens or currency/tradeType changes
  useEffect(() => {
    if (open && !editingTrade && (tradeType === 'buy' || tradeType === 'remove') && assetType !== 'cash') {
      fetchCashBalance()
    } else if (open && !editingTrade && tradeType === 'remove' && assetType === 'cash') {
      // For cash withdrawal, fetch cash balance
      fetchCashBalance()
    } else {
      setCashBalance(null)
      setAutoDeposit(false)
    }
  }, [open, currency, assetType, tradeType, editingTrade, fetchCashBalance])

  // Reset error when inputs change
  useEffect(() => {
    if (error) setError(null)
  }, [quantity, purchasePrice, tradeType, assetType, currency, symbol, name, tradeDate])

  // Reset auto-deposit when quantity or price changes
  useEffect(() => {
    if (quantity || purchasePrice) {
      setAutoDeposit(false)
    }
  }, [quantity, purchasePrice])

  // Get available holdings for sell (combined by asset) - show ALL holdings user owns except cash
  const availableHoldings = useMemo(() => {
    if (tradeType !== 'sell' || holdings.length === 0) {
      return []
    }
    // Combine holdings by asset and show only those with quantity > 0, excluding cash
    const combined = combineHoldingsByAsset(holdings)
    return combined.filter(h => h.quantity > 0 && h.assetType !== 'cash') // Exclude cash - cash cannot be sold
  }, [holdings, tradeType])

  // Get selected holding for validation (defined early for useEffects)
  const selectedHolding = selectedHoldingId ? availableHoldings.find(h => h.id === selectedHoldingId) : null
  const maxQuantity = selectedHolding ? selectedHolding.quantity : Infinity
  const quantityNum = parseFloat(quantity) || 0
  const exceedsAvailable = tradeType === 'sell' && selectedHolding && quantityNum > maxQuantity

  // When holding is selected for sell, auto-fill fields
  useEffect(() => {
    if (tradeType === 'sell' && selectedHoldingId && availableHoldings.length > 0) {
      const holding = availableHoldings.find(h => h.id === selectedHoldingId)
      if (holding) {
        setAssetType(holding.assetType)
        setSymbol(holding.symbol)
        setName(holding.name)
        setCurrency(holding.currency)
        setCurrentPrice(holding.currentPrice)
        // Set price based on selected tab (default to historical)
        if (priceTab === 'current') {
          setPrice(holding.currentPrice.toString())
        } else if (historicalPrice !== null) {
          setPrice(historicalPrice.toString())
        } else {
          setPrice(holding.currentPrice.toString()) // Fallback to current
        }
        setPriceFetched(true) // Price is already known from holding
        // Pre-fill quantity with available quantity (user can change)
        setQuantity(holding.quantity.toString())
      }
    } else if (tradeType === 'sell' && !selectedHoldingId) {
      // Reset when no holding selected
      setPriceFetched(false)
      setPrice('')
      setQuantity('')
      setCurrentPrice(null)
    }
  }, [selectedHoldingId, tradeType, availableHoldings, priceTab, historicalPrice])
  
  // Update price when switching tabs for sell
  useEffect(() => {
    if (tradeType === 'sell' && selectedHolding) {
      if (priceTab === 'current' && currentPrice !== null) {
        setPrice(currentPrice.toString())
      } else if (priceTab === 'historical' && historicalPrice !== null) {
        setPrice(historicalPrice.toString())
      }
    }
  }, [priceTab, currentPrice, historicalPrice, tradeType, selectedHolding])

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
        const market = assetType === 'pk-equity' ? 'PSX' : assetType === 'us-equity' ? 'US' : null
        const checkUrl = `/api/historical-data?assetType=${assetType}&symbol=${encodeURIComponent(symbol)}${market ? `&market=${market}` : ''}&limit=1`
        const checkResponse = await deduplicatedFetch(checkUrl)
        const hasData = checkResponse.ok && (await checkResponse.json()).data?.length > 0
        
        if (!hasData) {
          // DB is empty - fetch all historical data client-side and store it
          console.log(`[AddTransaction] DB is empty for ${assetType}/${symbol}, fetching all historical data...`)
          
          let instrumentId: string | null = null
          
          if (assetType === 'metals') {
            const { getMetalInstrumentId } = await import('@/lib/portfolio/metals-api')
            instrumentId = getMetalInstrumentId(symbol.toUpperCase())
          } else if (assetType === 'kse100' || assetType === 'spx500') {
            const { KSE100_INSTRUMENT_ID, SPX500_INSTRUMENT_ID } = await import('@/lib/portfolio/investing-client-api')
            instrumentId = assetType === 'kse100' ? KSE100_INSTRUMENT_ID : SPX500_INSTRUMENT_ID
          }
          
          if (instrumentId) {
            // Fetch all historical data client-side (bypasses Cloudflare)
            const { fetchInvestingHistoricalDataClient } = await import('@/lib/portfolio/investing-client-api')
            const defaultStartDate = '1970-01-01' // Fetch from as far back as possible
            const clientData = await fetchInvestingHistoricalDataClient(
              instrumentId,
              defaultStartDate,
              new Date().toISOString().split('T')[0]
            )
            
            if (clientData && clientData.length > 0) {
              // Store in database via API
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
                    // Data is now in DB, return true
                    return true
                  } else {
                    const errorData = await storeResponse.json()
                    console.error(`[AddTransaction] Failed to store data for ${symbol}:`, errorData)
                  }
                } catch (storeError) {
                  console.error(`[AddTransaction] Error storing data for ${symbol}:`, storeError)
                }
            }
          }
        } else {
          // Data exists in DB
          return true
          }
        } catch (error) {
        console.error(`[AddTransaction] Error fetching historical data for ${assetType}/${symbol}:`, error)
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
          
          // If we have at least some data, consider it ready
          if (records.length > 0) {
            return true
            }
          }
        } catch (error) {
        console.error('Error checking historical data:', error)
      }
      
      // Wait 500ms before checking again
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    return false
  }

  // Fetch current price for buy transactions
  const fetchCurrentPrice = async () => {
    if (!symbol || tradeType !== 'buy') return

    try {
      setFetchingPrice(true)
      setPriceFetched(false)
      setInitializingHistoricalData(false)
      setHistoricalDataReady(false)
      
      // First, check if DB has data
      const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
      const market = assetType === 'pk-equity' ? 'PSX' : assetType === 'us-equity' ? 'US' : null
      const checkUrl = `/api/historical-data?assetType=${assetType}&symbol=${encodeURIComponent(symbol.toUpperCase())}${market ? `&market=${market}` : ''}&limit=1`
      const checkResponse = await deduplicatedFetch(checkUrl)
      const hasExistingData = checkResponse.ok && (await checkResponse.json()).data?.length > 0
      
        if (!hasExistingData) {
          // DB is empty - we need to fetch all historical data
          setInitializingHistoricalData(true)
        }
      
      if (assetType === 'crypto') {
        const binanceSymbol = parseSymbolToBinance(symbol)
        const { fetchCryptoPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchCryptoPrice(binanceSymbol)
        if (data && data.price) {
          setCurrentPriceBuy(data.price.toString())
          setPriceFetched(true)
          if (!name) {
            setName(formatSymbolForDisplay(binanceSymbol))
          }
        }
        
        // Wait for historical data if DB was empty
        if (!hasExistingData) {
          const dataReady = await waitForHistoricalData('crypto', binanceSymbol)
          setHistoricalDataReady(dataReady)
        } else {
          setHistoricalDataReady(true)
        }
      } else if (assetType === 'pk-equity') {
        const { fetchPKEquityPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchPKEquityPrice(symbol.toUpperCase())
        if (data && data.price) {
          setCurrentPriceBuy(data.price.toString())
          setPriceFetched(true)
          if (!name) {
            setName(symbol.toUpperCase())
          }
        }
        
        // Wait for historical data if DB was empty
        if (!hasExistingData) {
          const dataReady = await waitForHistoricalData('pk-equity', symbol.toUpperCase())
          setHistoricalDataReady(dataReady)
        } else {
          setHistoricalDataReady(true)
        }
      } else if (assetType === 'us-equity') {
        const { fetchUSEquityPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchUSEquityPrice(symbol.toUpperCase())
        if (data && data.price) {
          setCurrentPriceBuy(data.price.toString())
          setPriceFetched(true)
          if (!name) {
            setName(symbol.toUpperCase())
          }
        }
        
        // Wait for historical data if DB was empty
        if (!hasExistingData) {
          const dataReady = await waitForHistoricalData('us-equity', symbol.toUpperCase())
          setHistoricalDataReady(dataReady)
        } else {
          setHistoricalDataReady(true)
        }
      } else if (assetType === 'kse100' || assetType === 'spx500') {
        const indexSymbol = assetType === 'kse100' ? 'KSE100' : 'SPX500'
        const { fetchIndicesPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchIndicesPrice(indexSymbol)
        if (data && data.price) {
          setCurrentPriceBuy(data.price.toString())
          setPriceFetched(true)
          if (!name) {
            setName(assetType === 'kse100' ? 'KSE 100 Index' : 'S&P 500 Index')
          }
        }
        
        // Wait for historical data if DB was empty
        if (!hasExistingData) {
          const apiAssetType = assetType === 'kse100' ? 'kse100' : 'spx500'
          const dataReady = await waitForHistoricalData(apiAssetType, indexSymbol)
          setHistoricalDataReady(dataReady)
        } else {
          setHistoricalDataReady(true)
        }
      } else if (assetType === 'metals') {
        const { fetchMetalsPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchMetalsPrice(symbol.toUpperCase())
        if (data && data.price) {
          setCurrentPriceBuy(data.price.toString())
          setPriceFetched(true)
          if (!name) {
            setName(formatMetalForDisplay(symbol))
          }
        }
        
        // For metals, historical data is fetched client-side in fetchHistoricalPriceForDate (or cached here?)
        // Wait for historical data if DB was empty
        if (data && data.price) {
           setHistoricalDataReady(true)
        }
      }
    } catch (error) {
      console.error('Error fetching price:', error)
      setInitializingHistoricalData(false)
      setHistoricalDataReady(false)
    } finally {
      setFetchingPrice(false)
      setInitializingHistoricalData(false)
    }
  }

  // Fetch historical price for transaction date validation (for both buy and sell)
  const fetchHistoricalPriceForDate = useCallback(async () => {
    // Only fetch for asset types that support historical data
    const supportsHistoricalData = assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500'
    
    if (!supportsHistoricalData || !symbol || !tradeDate || tradeType === 'add' || tradeType === 'remove') {
      setHistoricalPrice(null)
      setPriceRange(null)
      return
    }

    try {
      setFetchingHistoricalPrice(true)
      
      // If we're still initializing historical data, wait a bit
      if (initializingHistoricalData) {
        let waitCount = 0
        while (initializingHistoricalData && waitCount < 60) { // Wait up to 30 seconds
          await new Promise(resolve => setTimeout(resolve, 500))
          waitCount++
        }
      }
      
      let historicalData: any[] | null = null
      
      if (assetType === 'pk-equity') {
        const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
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
        const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
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
        const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
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
        // First check if we have cached data from current price fetch
        if (cachedHistoricalData && cachedHistoricalData.length > 0) {
          historicalData = cachedHistoricalData
        } else {
          // No cached data, check database
          const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
          const apiAssetType = assetType === 'kse100' ? 'kse100' : assetType === 'spx500' ? 'spx500' : 'metals'
          let response = await deduplicatedFetch(`/api/historical-data?assetType=${apiAssetType}&symbol=${encodeURIComponent(symbol.toUpperCase())}`)
          if (response.ok) {
            const data = await response.json()
            const dbRecords = data.data || []
            
            if (dbRecords.length > 0) {
              const { dbRecordToInvesting } = await import('@/lib/portfolio/db-to-chart-format')
              historicalData = dbRecords.map(dbRecordToInvesting)
              setCachedHistoricalData(historicalData)
              setHistoricalDataReady(true)
            } else {
              // If no data in database, fetch from client-side API and store it
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
                const defaultStartDate = symbol.toUpperCase() === 'GOLD' ? '1990-01-01' : '1970-01-01'
                const clientData = await fetchInvestingHistoricalDataClient(
                  instrumentId,
                  defaultStartDate,
                  new Date().toISOString().split('T')[0]
                )
                
                if (clientData && clientData.length > 0) {
                  setCachedHistoricalData(clientData)
                  
                  // Store in database via API
                  try {
                    const storeResponse = await fetch('/api/historical-data/store', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        assetType: apiAssetType,
                        symbol: symbol.toUpperCase(),
                        data: clientData,
                        source: 'investing',
                      }),
                    })
                    if (storeResponse.ok) {
                      setHistoricalDataReady(true)
                    }
                  } catch (storeError) {
                    console.error(`[AddTransaction] Error storing data for ${symbol}:`, storeError)
                  }
                  
                  historicalData = clientData
                }
              }
            }
          } else {
            setHistoricalDataReady(false)
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
          if (pricePoint) {
            const closePrice = pricePoint.close
            setHistoricalPrice(closePrice)
            setPriceRange({
              center: closePrice,
              min: closePrice * 0.95,
              max: closePrice * 1.05,
            })
          }
        } else if (assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500') {
          pricePoint = historicalData.find((d: any) => d.date === tradeDateStr)
          if (!pricePoint) {
            const beforeDates = historicalData.filter((d: any) => d.date <= tradeDateStr)
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
          
          // If we fetched historical data and don't have current price yet, use latest from historical data (for sell references)
          if (!currentPrice && historicalData.length > 0) {
            const latestData = historicalData[historicalData.length - 1]
            setCurrentPrice(latestData.close.toString()) // This sets the 'sell' current price state
          }
        } else {
          pricePoint = historicalData.find((d: any) => d.t === tradeDateStr)
          if (!pricePoint) {
            const beforeDates = historicalData.filter((d: any) => d.t <= tradeDateStr)
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
          
          if (!currentPrice && historicalData.length > 0) {
            const latestData = historicalData[historicalData.length - 1]
            setCurrentPrice(latestData.c.toString())
          }
        }
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
  }, [assetType, symbol, tradeDate, tradeType, initializingHistoricalData, cachedHistoricalData, currentPrice])

  // Auto-fetch price when symbol changes for buy transactions
  useEffect(() => {
    if (tradeType === 'buy' && symbol && assetType && !editingTrade && open) {
      const timeoutId = setTimeout(() => {
        fetchCurrentPrice()
      }, 500)
      return () => clearTimeout(timeoutId)
    }
  }, [symbol, assetType, tradeType, editingTrade, open])

  // Fetch historical price when trade date, symbol, or asset type changes (for buy and sell transactions)
  useEffect(() => {
    // Fetch whenever we have the necessary data (Date + Symbol) to ensure validation is ready.
    if (tradeDate && symbol && (tradeType === 'buy' || tradeType === 'sell') && (assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500')) {
      const timeoutId = setTimeout(() => {
        fetchHistoricalPriceForDate()
      }, 500)
      return () => clearTimeout(timeoutId)
    } else {
      setHistoricalPrice(null)
      setPriceRange(null)
    }
  }, [tradeDate, symbol, assetType, tradeType, fetchHistoricalPriceForDate])

  // For buy transactions: When trade date changes, the purchase price needs to be re-validated
  // The priceRange will update via fetchHistoricalPriceForDate, and getPriceValidation will re-run
  // This ensures purchase price is always validated against the new date's historical price
  useEffect(() => {
    if (tradeType === 'buy' && tradeDate && priceRange && purchasePrice) {
      // Price validation will automatically re-run because getPriceValidation depends on priceRange and purchasePrice
      // If the purchase price is outside the ±5% range, isFormValid will be false and the form won't submit
    }
  }, [tradeDate, priceRange, purchasePrice, tradeType])

  // Validate purchase price against range (for buy transactions)
  // Use useMemo to recompute validation whenever purchasePrice, priceRange, or tradeDate changes
  const priceValidation = useMemo(() => {
    // Only validate purchase price for buy transactions when we have a price range
    const shouldValidate = tradeType === 'buy' && priceRange && purchasePrice
    
    if (!shouldValidate) {
      // For sell transactions, validate the price field
      if (tradeType === 'sell' && priceTab === 'historical' && priceRange && price) {
        const enteredPrice = parseFloat(price)
        if (isNaN(enteredPrice)) {
          return { isValid: true, message: null, isWarning: false, isError: false }
        }
        if (enteredPrice < priceRange.min || enteredPrice > priceRange.max) {
          return {
            isValid: false,
            message: `Price must be within ±5% of ${priceRange.center.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })} (Range: ${priceRange.min.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })} - ${priceRange.max.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })})`,
            isWarning: false,
            isError: true,
          }
        }
        return {
          isValid: true,
          message: `Price within expected range (±5% of ${priceRange.center.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })})`,
          isWarning: false,
          isError: false,
        }
      }
      return { isValid: true, message: null, isWarning: false, isError: false }
    }

    const enteredPrice = parseFloat(purchasePrice)
    if (isNaN(enteredPrice) || enteredPrice <= 0) {
      return { isValid: true, message: null, isWarning: false, isError: false }
    }

    if (enteredPrice < priceRange.min || enteredPrice > priceRange.max) {
      return {
        isValid: false,
        message: `Price must be within ±5% of ${priceRange.center.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })} (Range: ${priceRange.min.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })} - ${priceRange.max.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })})`,
        isWarning: false,
        isError: true,
      }
    }

    return {
      isValid: true,
      message: `Price within expected range (±5% of ${priceRange.center.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })})`,
      isWarning: false,
      isError: false,
    }
  }, [tradeType, priceRange, purchasePrice, price, priceTab, currency])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const quantityNum = parseFloat(quantity)
    // For buy transactions, use purchasePrice; for cash add/remove, price is 1; for sell, use price
    let priceNum: number
    if (tradeType === 'buy') {
      priceNum = parseFloat(purchasePrice)
    } else if (tradeType === 'add' || tradeType === 'remove') {
      priceNum = 1
    } else {
      priceNum = parseFloat(price)
    }
    
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

    // Validate withdraw amount doesn't exceed available cash
    if (tradeType === 'remove' && assetType === 'cash') {
      if (cashBalance !== null && quantityNum > cashBalance) {
        setError(`Cannot withdraw more than available. You have ${formatCurrency(cashBalance, currency)} available.`)
        setSaving(false)
        return
      }
    }

    const totalAmount = quantityNum * priceNum

    setSaving(true)
    setError(null)
    try {
      await onSave({
        tradeType: tradeType === 'remove' ? 'remove' : tradeType,
        assetType,
        symbol: symbol.toUpperCase(),
        name,
        quantity: quantityNum,
        price: priceNum,
        totalAmount,
        currency,
        tradeDate,
        notes: notes || null,
        autoDeposit,
      })
      onOpenChange(false)
    } catch (error: any) {
      console.error('Error saving transaction:', error)
      setError(error.message || 'Failed to save transaction')
    } finally {
      setSaving(false)
    }
  }

  // Form validation - for buy transactions, require price fetch; for sell, require historical price if using historical tab
  const needsPriceFetch = tradeType === 'buy' && (assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500')
  const needsHistoricalData = (tradeType === 'buy' || tradeType === 'sell') && (assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500')
  const hasTradeDate = !!tradeDate
  const needsTradeDatePrice = needsHistoricalData && hasTradeDate && (
    tradeType === 'buy' || (tradeType === 'sell' && priceTab === 'historical')
  )

  // Validation for cash balance (buy transactions)
  const buyTotalAmount = quantityNum * (parseFloat(purchasePrice) || 0)
  const ROUNDING_EPSILON = 0.0001 // Allow small floating point differences
  const hasInsufficientCash = tradeType === 'buy' && 
                              assetType !== 'cash' && 
                              !editingTrade && 
                              cashBalance !== null && 
                              (buyTotalAmount - cashBalance > ROUNDING_EPSILON)

  // Validation for cash withdrawal
  const withdrawAmount = tradeType === 'remove' && assetType === 'cash' ? quantityNum : 0
  const exceedsAvailableCash = tradeType === 'remove' && 
                                assetType === 'cash' && 
                                !editingTrade && 
                                cashBalance !== null && 
                                (withdrawAmount - cashBalance > ROUNDING_EPSILON)

  const isFormValid = 
    symbol && 
    name && 
    quantity && 
    quantityNum > 0 &&
    !exceedsAvailable &&
    !loadingCashBalance && // Ensure cash balance is loaded
    !(hasInsufficientCash && !autoDeposit) && // Prevent submission if insufficient cash and auto-deposit not checked
    !exceedsAvailableCash && // Prevent withdrawal if exceeds available cash
    (
      (tradeType === 'buy' && purchasePrice && parseFloat(purchasePrice) > 0) || 
      (tradeType === 'add') || 
      (tradeType === 'remove') ||
      (tradeType === 'sell' && price && parseFloat(price) > 0)
    ) &&
    tradeDate &&
    (tradeType !== 'sell' || selectedHoldingId) && // For sell, must select a holding
    (!needsPriceFetch || priceFetched) && // For buy, price must be fetched
    (!needsHistoricalData || historicalDataReady) && // Historical data must be ready
    (!needsTradeDatePrice || historicalPrice !== null) && // Trade date price must be available (for buy or sell with historical tab)
    priceValidation.isValid // Price must be within expected range (when applicable)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingTrade ? 'Edit Transaction' : 'Add Transaction'}</DialogTitle>
          <DialogDescription>
            {editingTrade 
              ? 'Update the transaction details.' 
              : 'Record a new transaction (buy, sell, add cash/deposit, or withdraw cash).'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="tradeType">Transaction Type *</Label>
                <Select value={tradeType} onValueChange={(value) => {
                  const newType = value as 'buy' | 'sell' | 'add' | 'remove'
                  setTradeType(newType)
                  if (newType === 'add' || newType === 'remove') {
                    setAssetType('cash')
                    setSymbol('CASH')
                    setName('Cash')
                  } else if (assetType === 'cash') {
                    setAssetType('us-equity') // Reset if moving away from cash
                    setSymbol('')
                    setName('')
                  }
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
                    <SelectItem value="remove">Withdraw Cash</SelectItem>
                  </SelectContent>
                </Select>
                {tradeType === 'add' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Add cash or deposits to your portfolio
                  </p>
                )}
                {tradeType === 'remove' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Withdraw cash from your portfolio
                  </p>
                )}
              </div>

            <div className="grid grid-cols-2 gap-4">
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

            {tradeType !== 'add' && tradeType !== 'remove' && assetType !== 'cash' && (
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
                      disabled={!name && (fetchingPrice || fetchingHistoricalPrice)}
                    />
                  )}
                  {fetchingPrice && !name && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Auto-fetching asset name...
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                <Label htmlFor="quantity">
                  {tradeType === 'sell' ? 'Number of Shares to Sell *' : (tradeType === 'add' || tradeType === 'remove') ? 'Amount *' : 'Quantity *'}
                </Label>
                  {tradeType === 'buy' && cashBalance !== null && purchasePrice && parseFloat(purchasePrice) > 0 && assetType !== 'cash' && !editingTrade && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const maxQuantity = Math.floor(cashBalance / parseFloat(purchasePrice))
                        if (maxQuantity > 0) {
                          setQuantity(maxQuantity.toString())
                        }
                      }}
                      className="h-7 px-2 text-xs"
                      disabled={!purchasePrice || parseFloat(purchasePrice) <= 0 || cashBalance <= 0}
                    >
                      Max ({cashBalance > 0 && purchasePrice ? Math.floor(cashBalance / parseFloat(purchasePrice)).toLocaleString() : '0'})
                    </Button>
                  )}
                </div>
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
                <Label htmlFor="tradeDate">Transaction Date *</Label>
                <Input
                  id="tradeDate"
                  type="date"
                  value={tradeDate}
                  onChange={(e) => setTradeDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
            </div>

            {tradeType === 'buy' ? (
              <>
                {/* Purchase Price - Main field for buy transactions */}
                <div className="space-y-2">
                  <Label htmlFor="purchasePrice">Purchase Price per Unit *</Label>
                  <div className="space-y-1">
                    <Input
                      id="purchasePrice"
                      type="number"
                      step="any"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      placeholder="0.00"
                      required
                      className={priceValidation.isError ? "border-red-500 focus-visible:ring-red-500" : ""}
                    />
                    {fetchingHistoricalPrice && tradeDate && symbol && (assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals') && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {priceRange ? `Updating historical price for ${tradeDate}...` : `Fetching historical price for ${tradeDate}...`}
                      </p>
                    )}
                    {priceRange && tradeDate && (
                      <p className="text-xs text-muted-foreground">
                        Expected range: {priceRange.min.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })} - {priceRange.max.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })} (±5% of {priceRange.center.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })} on {tradeDate})
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

                {/* Current Price - Reference only, less prominent - Auto-fetched */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="currentPriceBuy" className="text-sm text-muted-foreground">Current Market Price (Auto-fetched for reference)</Label>
                    {(assetType === 'crypto' || assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500') && symbol && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={fetchCurrentPrice}
                        disabled={fetchingPrice || !symbol}
                        title="Fetch current market price"
                        className="h-7 px-2"
                      >
                        {fetchingPrice ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                  <Input
                    id="currentPriceBuy"
                    type="number"
                    step="any"
                    value={currentPriceBuy}
                    onChange={(e) => setCurrentPriceBuy(e.target.value)}
                    placeholder="Click refresh to fetch"
                    className="bg-muted text-muted-foreground"
                    disabled={!currentPriceBuy}
                  />
                  {currentPriceBuy && !fetchingPrice && (
                    <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Current price fetched
                    </p>
                  )}
                </div>
              </>
            ) : tradeType === 'sell' && selectedHolding && (assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500') ? (
              <div className="space-y-2">
                <Label htmlFor="price">Sell Price per Unit *</Label>
                <Tabs value={priceTab} onValueChange={(v) => setPriceTab(v as 'current' | 'historical')}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="current">Current Price</TabsTrigger>
                      <TabsTrigger value="historical">Price on {tradeDate}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="current" className="space-y-2 mt-2">
                      <div className="flex gap-2">
                        <Input
                          id="price"
                          type="number"
                          step="any"
                          value={price}
                          onChange={(e) => {
                            const newPrice = e.target.value
                            setPrice(newPrice)
                            setPriceFetched(false) // Reset fetched flag if manually changed
                          }}
                          placeholder="0.00"
                          required
                          className="flex-1"
                          disabled={currentPrice === null}
                        />
                      </div>
                      {currentPrice !== null && (
                        <p className="text-xs text-muted-foreground">
                          Current market price: {currentPrice.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </TabsContent>
                    <TabsContent value="historical" className="space-y-2 mt-2">
                      <div className="flex gap-2">
                        <Input
                          id="price"
                          type="number"
                          step="any"
                          value={price}
                          onChange={(e) => {
                            const newPrice = e.target.value
                            setPrice(newPrice)
                            setPriceFetched(false) // Reset fetched flag if manually changed
                          }}
                          placeholder="0.00"
                          required
                          className={`flex-1 ${priceValidation.isWarning ? 'border-yellow-500 focus-visible:ring-yellow-500' : ''}`}
                          disabled={historicalPrice === null}
                        />
                      </div>
                      {fetchingHistoricalPrice && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {priceRange ? `Updating historical price for ${tradeDate}...` : `Fetching historical price for ${tradeDate}...`}
                        </p>
                      )}
                      {priceRange && (
                        <p className="text-xs text-muted-foreground">
                          Expected range: {priceRange.min.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })} - {priceRange.max.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })} (±5% of {priceRange.center.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 })})
                        </p>
                      )}
                      {priceValidation.message && priceTab === 'historical' && (
                        <p className={`text-xs ${priceValidation.isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                          {priceValidation.message}
                        </p>
                      )}
                    </TabsContent>
                  </Tabs>
              </div>
            ) : null}

            {tradeType !== 'add' && tradeType !== 'remove' && (
              <div className="space-y-2">
                <Label>Total Amount</Label>
                <div className="h-10 px-3 py-2 bg-muted rounded-md flex items-center">
                  {quantity && ((tradeType === 'buy' && purchasePrice && parseFloat(purchasePrice) > 0) || (tradeType !== 'buy' && price && parseFloat(price) > 0)) && parseFloat(quantity) > 0
                    ? (parseFloat(quantity) * (tradeType === 'buy' ? parseFloat(purchasePrice) : parseFloat(price))).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : '0.00'}
                </div>
              </div>
            )}

            {/* Cash Balance & Withdrawal Validation - Show for withdraw transactions */}
            {tradeType === 'remove' && assetType === 'cash' && !editingTrade && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Available Cash ({currency})
                  </Label>
                  {loadingCashBalance ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <span className={`font-semibold ${cashBalance !== null && cashBalance > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                      {cashBalance !== null ? formatCurrency(cashBalance, currency) : 'Loading...'}
                    </span>
                  )}
                </div>
                
                {cashBalance !== null && quantity && parseFloat(quantity) > 0 && (
                  <div className="space-y-2">
                    {(() => {
                      const withdrawAmount = parseFloat(quantity) || 0
                      const ROUNDING_EPSILON = 0.0001
                      const exceedsAvailable = (withdrawAmount - cashBalance) > ROUNDING_EPSILON

                      return (
                        <>
                          {exceedsAvailable && (
                            <Alert className="border-red-500 bg-red-50 dark:bg-red-950">
                              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                              <AlertDescription className="text-red-800 dark:text-red-200">
                                <div className="space-y-1">
                                  <p className="font-semibold">Insufficient cash balance!</p>
                                  <p className="text-sm">
                                    Requested: {formatCurrency(withdrawAmount, currency)}<br />
                                    Available: {formatCurrency(cashBalance, currency)}<br />
                                    Shortfall: {formatCurrency(withdrawAmount - cashBalance, currency)}
                                  </p>
                                </div>
                              </AlertDescription>
                            </Alert>
                          )}
                          
                          {!exceedsAvailable && withdrawAmount > 0 && cashBalance > 0 && (
                            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Sufficient cash available for withdrawal
                            </p>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Cash Balance & Affordability - Only show for buy transactions of non-cash assets */}
            {tradeType === 'buy' && assetType !== 'cash' && !editingTrade && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Available Cash ({currency})
                  </Label>
                  {loadingCashBalance ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <span className={`font-semibold ${cashBalance !== null && cashBalance > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                      {cashBalance !== null ? formatCurrency(cashBalance, currency) : 'Loading...'}
                    </span>
                  )}
                </div>
                
                {cashBalance !== null && purchasePrice && parseFloat(purchasePrice) > 0 && (
                  <div className="space-y-2">
                    {(() => {
                      const totalAmount = (parseFloat(quantity) || 0) * parseFloat(purchasePrice)
                      const ROUNDING_EPSILON = 0.0001
                      const affordableQuantity = Math.floor((cashBalance + ROUNDING_EPSILON) / parseFloat(purchasePrice))
                      const shortfall = Math.max(0, totalAmount - cashBalance)
                      const hasInsufficientCash = (totalAmount - cashBalance) > ROUNDING_EPSILON

                      return (
                        <>
                          {affordableQuantity > 0 && (
                            <p className="text-xs text-muted-foreground">
                              You can buy up to <span className="font-semibold">{affordableQuantity.toLocaleString()}</span> shares with available cash
                            </p>
                          )}
                          
                          {hasInsufficientCash && totalAmount > 0 && (
                            <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                                <div className="space-y-1">
                                  <p className="font-semibold">Insufficient cash balance!</p>
                                  <p className="text-sm">
                                    Required: {formatCurrency(totalAmount, currency)}<br />
                                    Available: {formatCurrency(cashBalance, currency)}<br />
                                    Shortfall: {formatCurrency(shortfall, currency)}
                                  </p>
                                  <div className="flex items-center gap-2 mt-2">
                                    <input
                                      type="checkbox"
                                      id="autoDeposit"
                                      checked={autoDeposit}
                                      onChange={(e) => setAutoDeposit(e.target.checked)}
                                      className="rounded border-gray-300"
                                    />
                                    <label htmlFor="autoDeposit" className="text-sm cursor-pointer">
                                      Auto-deposit {formatCurrency(shortfall, currency)} to complete purchase
                                    </label>
                                  </div>
                                </div>
                              </AlertDescription>
                            </Alert>
                          )}
                          
                          {!hasInsufficientCash && totalAmount > 0 && cashBalance > 0 && (
                            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Sufficient cash available
                            </p>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}

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

          {/* Show loading state when initializing historical data */}
          {initializingHistoricalData && (
            <Alert className="mb-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                Fetching and storing all historical data for {symbol.toUpperCase()}. This may take a moment...
              </AlertDescription>
            </Alert>
          )}
          
          {/* Show message if historical data is not ready */}
          {needsHistoricalData && !historicalDataReady && !initializingHistoricalData && symbol && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please click "Refresh Price" to fetch historical data before adding this transaction.
              </AlertDescription>
            </Alert>
          )}

          {/* Show error message if save failed */}
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}

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
