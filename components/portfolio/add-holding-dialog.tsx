"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CryptoSelector } from "./crypto-selector"
import { MetalsSelector } from "./metals-selector"
import type { Holding, AssetType } from "@/lib/portfolio/types"
import { ASSET_TYPE_LABELS } from "@/lib/portfolio/types"
import { formatSymbolForDisplay, parseSymbolToBinance } from "@/lib/portfolio/binance-api"
import { formatMetalForDisplay } from "@/lib/portfolio/metals-api"
import { formatCurrency } from "@/lib/portfolio/portfolio-utils"

interface AddHoldingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (holding: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>) => void
  editingHolding?: Holding | null
}

export function AddHoldingDialog({ open, onOpenChange, onSave, editingHolding }: AddHoldingDialogProps) {
  const [assetType, setAssetType] = useState<AssetType>('us-equity')
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [notes, setNotes] = useState('')
  const [fetchingPrice, setFetchingPrice] = useState(false)
  const [historicalPrice, setHistoricalPrice] = useState<number | null>(null)
  const [fetchingHistoricalPrice, setFetchingHistoricalPrice] = useState(false)
  const [priceRange, setPriceRange] = useState<{ min: number; max: number; center: number } | null>(null)
  // Cache for fetched historical data to reuse between current and historical price fetches
  const [cachedHistoricalData, setCachedHistoricalData] = useState<any[] | null>(null)
  // Track if we're initializing historical data (fetching and storing all historical data)
  const [initializingHistoricalData, setInitializingHistoricalData] = useState(false)
  const [historicalDataReady, setHistoricalDataReady] = useState(false)

  useEffect(() => {
    if (editingHolding) {
      setAssetType(editingHolding.assetType)
      setSymbol(editingHolding.symbol)
      setName(editingHolding.name)
      setQuantity(editingHolding.quantity.toString())
      setPurchasePrice(editingHolding.purchasePrice.toString())
      setPurchaseDate(editingHolding.purchaseDate.split('T')[0])
      setCurrentPrice(editingHolding.currentPrice.toString())
      setCurrency(editingHolding.currency)
      setNotes(editingHolding.notes || '')
    } else {
      // Reset form
      setAssetType('us-equity')
      setSymbol('')
      setName('')
      setQuantity('')
      setPurchasePrice('')
      setPurchaseDate('')
      setCurrentPrice('')
      setCurrency('USD')
      setNotes('')
      setCachedHistoricalData(null) // Clear cache when dialog closes/resets
      setInitializingHistoricalData(false)
      setHistoricalDataReady(false)
    }
    
    // When editing, mark as ready since data should already exist
    if (editingHolding) {
      setHistoricalDataReady(true)
    }
  }, [editingHolding, open])

  // Auto-set currency and symbol based on asset type
  useEffect(() => {
    if (!editingHolding && open) {
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
      // Keep existing currency for other asset types
    }
  }, [assetType, editingHolding, open])

  // Auto-fetch asset name when symbol changes (debounced)
  useEffect(() => {
    if (!symbol || !open || editingHolding) return
    
    // Don't auto-fetch if name is already set (user may have manually entered it)
    if (name && name !== symbol.toUpperCase()) return

    const timeoutId = setTimeout(async () => {
      try {
        // Try to fetch name from company_profiles for PK/US equities
        if (assetType === 'pk-equity' || assetType === 'us-equity') {
          const response = await fetch(`/api/user/tracked-assets`)
          if (response.ok) {
            const data = await response.json()
            if (data.success && data.assets) {
              const asset = data.assets.find((a: any) => 
                a.assetType === assetType && a.symbol.toUpperCase() === symbol.toUpperCase()
              )
              if (asset && asset.name) {
                setName(asset.name)
                return
              }
            }
          }
        }
        
        // If not found in tracked assets, try fetching price which may include name
        // This will be handled by fetchCurrentPrice
      } catch (error) {
        console.error('Error auto-fetching asset name:', error)
      }
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [symbol, assetType, open, editingHolding, name])

  // Auto-fetch removed - user must explicitly click refresh button

  // Fetch historical price for purchase date validation
  const fetchHistoricalPriceForDate = useCallback(async () => {
    // Only fetch for asset types that support historical data
    const supportsHistoricalData = assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500'
    
    if (!supportsHistoricalData || !symbol || !purchaseDate) {
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
              // Convert to StockAnalysis format for compatibility
              const { dbRecordToStockAnalysis } = await import('@/lib/portfolio/db-to-chart-format')
              historicalData = dbRecords.map(dbRecordToStockAnalysis)
              // Mark as ready if we have data
              if (historicalData && historicalData.length > 0) {
                setHistoricalDataReady(true)
              }
            }
          } else if (assetType === 'us-equity') {
            const { deduplicatedFetch } = await import('@/lib/portfolio/request-deduplication')
            const response = await deduplicatedFetch(`/api/historical-data?assetType=us-equity&symbol=${encodeURIComponent(symbol.toUpperCase())}&market=US`)
            if (response.ok) {
              const data = await response.json()
              const dbRecords = data.data || []
              // Convert to StockAnalysis format for compatibility
              const { dbRecordToStockAnalysis } = await import('@/lib/portfolio/db-to-chart-format')
              historicalData = dbRecords.map(dbRecordToStockAnalysis)
              // Mark as ready if we have data
              if (historicalData && historicalData.length > 0) {
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
              // Convert to Binance format for compatibility
              const { dbRecordToBinance } = await import('@/lib/portfolio/db-to-chart-format')
              historicalData = dbRecords.map(dbRecordToBinance)
              // Mark as ready if we have data
              if (historicalData && historicalData.length > 0) {
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
              // Determine asset type for API call
              const apiAssetType = assetType === 'kse100' ? 'kse100' : assetType === 'spx500' ? 'spx500' : 'metals'
              let response = await deduplicatedFetch(`/api/historical-data?assetType=${apiAssetType}&symbol=${encodeURIComponent(symbol.toUpperCase())}`)
              if (response.ok) {
                const data = await response.json()
                const dbRecords = data.data || []
                
                if (dbRecords.length > 0) {
                  // Convert database records to Investing format
                  const { dbRecordToInvesting } = await import('@/lib/portfolio/db-to-chart-format')
                  historicalData = dbRecords.map(dbRecordToInvesting)
                  // Cache it for potential reuse
                  setCachedHistoricalData(historicalData)
                  // Data exists in DB, mark as ready
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
                    // Fetch all historical data client-side (bypasses Cloudflare)
                    const { fetchInvestingHistoricalDataClient } = await import('@/lib/portfolio/investing-client-api')
                    const defaultStartDate = symbol.toUpperCase() === 'GOLD' ? '1990-01-01' : '1970-01-01' // Fetch from as far back as possible
                    const clientData = await fetchInvestingHistoricalDataClient(
                      instrumentId,
                      defaultStartDate,
                      new Date().toISOString().split('T')[0]
                    )
                    
                    if (clientData && clientData.length > 0) {
                      // Cache it
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
                              await storeResponse.json()
                              // Mark historical data as ready after successful storage
                              setHistoricalDataReady(true)
                            } else {
                              const errorData = await storeResponse.json()
                              console.error(`[Add Holding] Failed to store data for ${symbol}:`, errorData)
                            }
                          } catch (storeError) {
                            console.error(`[Add Holding] Error storing data for ${symbol}:`, storeError)
                          }
                      
                      // Use the fetched data
                      historicalData = clientData
                    }
                  }
                }
              } else {
                // Response not ok, mark as ready anyway (will show error later)
                setHistoricalDataReady(false)
              }
            }
          }

          if (historicalData && historicalData.length > 0) {
            // Find price for the purchase date (or closest before)
            const purchaseDateObj = new Date(purchaseDate)
            const purchaseDateStr = purchaseDateObj.toISOString().split('T')[0]
            
            // For StockAnalysis data, date is in 't' field (YYYY-MM-DD)
            // For Binance data, date is in 'date' field (YYYY-MM-DD)
            let pricePoint: any = null
            
            if (assetType === 'crypto') {
              // Binance data: find exact match or closest before
              pricePoint = historicalData.find((d: any) => d.date === purchaseDateStr)
              if (!pricePoint) {
                const beforeDates = historicalData.filter((d: any) => d.date <= purchaseDateStr)
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
              // Investing data: find exact match or closest before
              pricePoint = historicalData.find((d: any) => d.date === purchaseDateStr)
              if (!pricePoint) {
                const beforeDates = historicalData.filter((d: any) => d.date <= purchaseDateStr)
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
              
                  // If we fetched historical data and don't have current price yet, use latest from historical data
                  if (!currentPrice && historicalData.length > 0) {
                    const latestData = historicalData[historicalData.length - 1] // Data is sorted oldest first
                    setCurrentPrice(latestData.close.toString())
                  }
                } else {
                  // StockAnalysis data (PK/US equities): find exact match or closest before
                  pricePoint = historicalData.find((d: any) => d.t === purchaseDateStr)
                  if (!pricePoint) {
                    const beforeDates = historicalData.filter((d: any) => d.t <= purchaseDateStr)
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
                  
                  // If we fetched historical data and don't have current price yet, use latest from historical data
                  if (!currentPrice && historicalData.length > 0) {
                    const latestData = historicalData[historicalData.length - 1] // Data is sorted oldest first
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
  }, [assetType, symbol, purchaseDate])

  // Fetch historical price when purchase date, symbol, or asset type changes
  useEffect(() => {
    if (purchaseDate && symbol && (assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500')) {
      // Debounce the fetch
      const timeoutId = setTimeout(() => {
        fetchHistoricalPriceForDate()
      }, 500)
      
      return () => clearTimeout(timeoutId)
    } else {
      setHistoricalPrice(null)
      setPriceRange(null)
    }
  }, [purchaseDate, symbol, assetType, fetchHistoricalPriceForDate])

  // Validate purchase price against range - STRICT: only allow ±5%
  // Use useMemo to recompute validation whenever purchasePrice, priceRange, or purchaseDate changes
  const priceValidation = useMemo(() => {
    if (!priceRange || !purchasePrice) {
      return { isValid: true, message: null, isWarning: false, isError: false }
    }

    const enteredPrice = parseFloat(purchasePrice)
    if (isNaN(enteredPrice) || enteredPrice <= 0) {
      return { isValid: true, message: null, isWarning: false, isError: false }
    }

    if (enteredPrice < priceRange.min || enteredPrice > priceRange.max) {
      return {
        isValid: false,
        message: `Price must be within ±5% of ${formatCurrency(priceRange.center, currency)} (Range: ${formatCurrency(priceRange.min, currency)} - ${formatCurrency(priceRange.max, currency)})`,
        isWarning: false,
        isError: true,
      }
    }

    return {
      isValid: true,
      message: `Price within expected range (±5% of ${formatCurrency(priceRange.center, currency)})`,
      isWarning: false,
      isError: false,
    }
  }, [priceRange, purchasePrice, currency])

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
        // Check if DB has data (no market parameter for indices/metals)
        const checkUrl = `/api/historical-data?assetType=${assetType}&symbol=${encodeURIComponent(symbol)}&limit=1`
        const checkResponse = await deduplicatedFetch(checkUrl)
        const hasData = checkResponse.ok && (await checkResponse.json()).data?.length > 0
        
        if (!hasData) {
          // DB is empty - fetch all historical data client-side and store it
          console.log(`[Add Holding] DB is empty for ${assetType}/${symbol}, fetching all historical data...`)
          
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
                    console.error(`[Add Holding] Failed to store data for ${symbol}:`, errorData)
                  }
                } catch (storeError) {
                  console.error(`[Add Holding] Error storing data for ${symbol}:`, storeError)
                }
            }
          }
        } else {
          // Data exists in DB
          return true
          }
        } catch (error) {
        console.error(`[Add Holding] Error fetching historical data for ${assetType}/${symbol}:`, error)
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

  const fetchCurrentPrice = async () => {
    if (!symbol) return

    try {
      setFetchingPrice(true)
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
              setCurrentPrice(data.price.toString())
            // Auto-set name if not already set
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
        // Fetch PK equity price using unified API
        const { fetchPKEquityPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchPKEquityPrice(symbol.toUpperCase())
        
        if (data && data.price) {
            setCurrentPrice(data.price.toString())
            
            // Log which endpoint was used
            const sourceLabels: Record<string, string> = {
            'database': '📦 Database',
              'stockanalysis_api': '🌐 StockAnalysis.com API',
              'psx_scraping': '🔍 PSX Website Scraping (Fallback)'
            }
            // Auto-set name if not already set
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
      } else if (assetType === 'kse100' || assetType === 'spx500') {
        // Fetch indices price using unified API (same pattern as metals)
        const indexSymbol = assetType === 'kse100' ? 'KSE100' : 'SPX500'
        const { fetchIndicesPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchIndicesPrice(indexSymbol)
        
        if (data && data.price) {
          setCurrentPrice(data.price.toString())
            
          // Auto-set name and symbol if not already set
                if (!name) {
            setName(assetType === 'kse100' ? 'KSE 100 Index' : 'S&P 500 Index')
          }
          if (!symbol) {
            setSymbol(indexSymbol)
          }
        }
        
        // Wait for historical data if DB was empty (same as metals)
        if (!hasExistingData) {
          const apiAssetType = assetType === 'kse100' ? 'kse100' : 'spx500'
          const dataReady = await waitForHistoricalData(apiAssetType, indexSymbol)
          setHistoricalDataReady(dataReady)
        } else {
          setHistoricalDataReady(true)
        }
      } else if (assetType === 'us-equity') {
        // Fetch US equity price using unified API
        const { fetchUSEquityPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchUSEquityPrice(symbol.toUpperCase())
        
        if (data && data.price) {
            setCurrentPrice(data.price.toString())
            
            // Auto-set name if not already set
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
      } else if (assetType === 'metals') {
        // Fetch metals price using unified API (handles client-side fetch automatically)
        const { fetchMetalsPrice } = await import('@/lib/portfolio/unified-price-api')
        const data = await fetchMetalsPrice(symbol.toUpperCase())
        
        if (data && data.price) {
                setCurrentPrice(data.price.toString())
                
                // Auto-set name if not already set
                if (!name) {
                  setName(formatMetalForDisplay(symbol))
                }
              }
        
        // For metals, historical data is fetched client-side in fetchHistoricalPriceForDate
        // So we mark it as ready if we have current price
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const holding: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'> = {
      assetType,
      symbol: symbol.toUpperCase().trim(),
      name: name.trim() || symbol.toUpperCase().trim(),
      quantity: parseFloat(quantity) || 0,
      purchasePrice: parseFloat(purchasePrice) || 0,
      purchaseDate: purchaseDate || new Date().toISOString().split('T')[0],
      currentPrice: parseFloat(currentPrice) || 0,
      currency: currency.trim(),
      notes: notes.trim() || undefined,
    }

    onSave(holding)
    onOpenChange(false)
  }

  // Form is valid only if:
  // 1. All required fields are filled
  // 2. Historical data is ready (for assets that need it)
  // 3. Purchase date price is available (for assets that support historical data and have a purchase date)
  // 4. Purchase price is within ±5% of historical price (if validation is enabled)
  const needsHistoricalData = assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500'
  const hasPurchaseDate = !!purchaseDate
  const needsPurchaseDatePrice = needsHistoricalData && hasPurchaseDate
  
  const isFormValid = symbol.trim() && 
                      name.trim() && // Require name (auto-fetched or user-entered)
                      quantity && 
                      purchasePrice && 
                      currentPrice && 
                      purchaseDate &&
                      (!needsHistoricalData || historicalDataReady) &&
                      (!needsPurchaseDatePrice || historicalPrice !== null) &&
                      priceValidation.isValid // STRICT: Block if price outside ±5%

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingHolding ? 'Edit Holding' : 'Add New Holding'}</DialogTitle>
          <DialogDescription>
            {editingHolding ? 'Update the details of your holding.' : 'Add a new asset to your portfolio.'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="assetType">Asset Type *</Label>
                <Select value={assetType} onValueChange={(value) => setAssetType(value as AssetType)}>
                  <SelectTrigger id="assetType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ASSET_TYPE_LABELS)
                      .filter(([key]) => key !== 'cash' && key !== 'fd' && key !== 'commodities') // These have their own dialogs
                      .map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Currency *</Label>
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
                {assetType === 'pk-equity' && currency !== 'PKR' && (
                  <p className="text-xs text-muted-foreground">
                    Note: PSX prices are in PKR
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol/Ticker *</Label>
                {assetType === 'crypto' ? (
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
                    onChange={(e) => setSymbol(e.target.value)}
                    placeholder={
                      assetType === 'pk-equity'
                        ? 'PTC, HBL, UBL, etc.'
                        : assetType === 'commodities'
                        ? 'Oil, Wheat, Coffee, etc.'
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
                  placeholder="Auto-fetched from symbol"
                  required
                  disabled={!name && (fetchingPrice || fetchingHistoricalPrice)} // Disable if auto-fetching
                />
                {fetchingPrice && !name && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Auto-fetching asset name...
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="purchaseDate">Purchase Date *</Label>
                <Input
                  id="purchaseDate"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Purchase Price Field - Main field, validated against historical price */}
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
                  className={priceValidation.isError ? "border-red-500 focus-visible:ring-red-500" : priceValidation.isWarning ? "border-yellow-500 focus-visible:ring-yellow-500" : ""}
                />
                {fetchingHistoricalPrice && purchaseDate && symbol && (assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'crypto' || assetType === 'metals') && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {priceRange ? `Updating historical price for ${purchaseDate}...` : `Fetching historical price for ${purchaseDate}...`}
                  </p>
                )}
                {priceRange && purchaseDate && (
                  <p className="text-xs text-muted-foreground">
                    Expected range: {formatCurrency(priceRange.min, currency)} - {formatCurrency(priceRange.max, currency)} (±5% of {formatCurrency(priceRange.center, currency)} on {purchaseDate})
                  </p>
                )}
                {priceValidation.message && (
                  <Alert className={priceValidation.isError ? "border-red-500 bg-red-50 dark:bg-red-950" : priceValidation.isWarning ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-950" : "border-green-500 bg-green-50 dark:bg-green-950"}>
                    <div className="flex items-center gap-2">
                      {priceValidation.isError ? (
                        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      ) : priceValidation.isWarning ? (
                        <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      )}
                      <AlertDescription className={priceValidation.isError ? "text-red-800 dark:text-red-200" : priceValidation.isWarning ? "text-yellow-800 dark:text-yellow-200" : "text-green-800 dark:text-green-200"}>
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
                <Label htmlFor="currentPrice" className="text-sm text-muted-foreground">Current Market Price (Auto-fetched for reference)</Label>
                {(assetType === 'crypto' || assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'metals' || assetType === 'kse100' || assetType === 'spx500') && symbol && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={fetchCurrentPrice}
                    disabled={fetchingPrice || !symbol}
                    title={
                      assetType === 'crypto'
                        ? 'Fetch current price from Binance'
                        : assetType === 'pk-equity'
                        ? 'Fetch current bid price from PSX'
                        : assetType === 'us-equity'
                        ? 'Fetch current price from StockAnalysis.com'
                        : assetType === 'kse100'
                        ? 'Fetch current KSE 100 index value'
                        : assetType === 'spx500'
                        ? 'Fetch current S&P 500 index value'
                        : 'Fetch current price from Investing.com'
                    }
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
                id="currentPrice"
                type="number"
                step="any"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(e.target.value)}
                placeholder="Click refresh to fetch"
                className="bg-muted text-muted-foreground"
                disabled={!currentPrice}
              />
              {currentPrice && !fetchingPrice && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Current price fetched
                </p>
              )}
            </div>

            {/* Total Amount - Calculated */}
            <div className="space-y-2">
              <Label htmlFor="totalAmount">Total Amount</Label>
              <Input
                id="totalAmount"
                type="number"
                step="any"
                value={(parseFloat(quantity) || 0) * (parseFloat(purchasePrice) || 0)}
                disabled
                className="bg-muted"
                placeholder="0.00"
              />
            </div>


            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this holding..."
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
                Please click "Refresh Price" to fetch historical data before adding this holding.
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
                <>
              {editingHolding ? 'Update' : 'Add'} Holding
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

