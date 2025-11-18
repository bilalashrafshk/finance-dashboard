"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RefreshCw, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react"
import type { Holding, AssetType } from "@/lib/portfolio/types"
import { formatCurrency } from "@/lib/portfolio/portfolio-utils"
import { parseSymbolToBinance } from "@/lib/portfolio/binance-api"
import Link from "next/link"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"

interface PortfolioUpdateSectionProps {
  holdings: Holding[]
  onUpdate: () => void
}

interface HoldingUpdateStatus {
  holding: Holding
  lastUpdatedDate: string | null
  dayChange: number | null
  dayChangePercent: number | null
  isUpdating: boolean
  error: string | null
}

export function PortfolioUpdateSection({ holdings, onUpdate }: PortfolioUpdateSectionProps) {
  const [updateStatuses, setUpdateStatuses] = useState<Map<string, HoldingUpdateStatus>>(new Map())
  const [isUpdatingAll, setIsUpdatingAll] = useState(false)
  const isUpdatingRef = useRef(false)
  const holdingsIdsRef = useRef<string>('')

  const loadUpdateStatuses = useCallback(async () => {
    // Don't reload if we're currently updating
    if (isUpdatingRef.current) {
      return
    }
    
    // Filter holdings that need data loading
    const holdingsToLoad = holdings.filter(h => 
      h.assetType === 'pk-equity' || h.assetType === 'us-equity' || h.assetType === 'crypto' || h.assetType === 'metals'
    )
    
    // Process all in parallel for speed
    const loadPromises = holdingsToLoad.map(async (holding) => {
      let lastUpdatedDate: string | null = null
      let dayChange: number | null = null
      let dayChangePercent: number | null = null

      try {
        const assetType = holding.assetType
        const symbol = holding.symbol.toUpperCase()
        const market = assetType === 'pk-equity' ? 'PSX' : assetType === 'us-equity' ? 'US' : null
        
        // Only fetch latest 5 records (enough for last updated date and day change calculation)
        const url = `/api/historical-data?assetType=${assetType}&symbol=${encodeURIComponent(symbol)}${market ? `&market=${market}` : ''}&limit=5`
        
        const response = await fetch(url)
        
        if (response.ok) {
          const data = await response.json()
          const records = data.data || []
          
          if (records.length > 0) {
            // Records are already sorted ASC from API, so last item is latest
            const sortedRecords = [...records].sort((a: any, b: any) => b.date.localeCompare(a.date))
            lastUpdatedDate = sortedRecords[0].date
            
            if (sortedRecords.length >= 2) {
              const latest = sortedRecords[0]
              const previous = sortedRecords[1]
              dayChange = latest.close - previous.close
              dayChangePercent = previous.close > 0 ? ((dayChange / previous.close) * 100) : 0
            }
          }
        } else {
          console.error(`[LOAD STATUSES] ${assetType}/${symbol}: API error ${response.status}`)
        }
      } catch (error) {
        console.error(`[LOAD STATUSES] ${holding.assetType}/${holding.symbol}: Error:`, error)
      }

      return {
        holdingId: holding.id,
        holding,
        lastUpdatedDate,
        dayChange,
        dayChangePercent,
      }
    })
    
    // Wait for all to complete
    const batchResults = await Promise.all(loadPromises)
    
    // Update statuses incrementally - only update what changed, preserve existing
    setUpdateStatuses(prevStatuses => {
      const updatedStatuses = new Map(prevStatuses)
      let hasChanges = false
      
      batchResults.forEach(result => {
        const existing = updatedStatuses.get(result.holdingId)
        
        // Check if data actually changed
        const dataChanged = !existing || 
          existing.lastUpdatedDate !== result.lastUpdatedDate ||
          existing.dayChange !== result.dayChange ||
          existing.dayChangePercent !== result.dayChangePercent ||
          existing.holding.currentPrice !== result.holding.currentPrice
        
        if (dataChanged) {
          hasChanges = true
          updatedStatuses.set(result.holdingId, {
            holding: result.holding,
            lastUpdatedDate: result.lastUpdatedDate,
            dayChange: result.dayChange,
            dayChangePercent: result.dayChangePercent,
            isUpdating: existing?.isUpdating || false,
            error: null,
          })
        } else if (existing) {
          // Preserve existing status if nothing changed - maintain reference stability
          updatedStatuses.set(result.holdingId, existing)
        } else {
          // New holding
          hasChanges = true
          updatedStatuses.set(result.holdingId, {
            holding: result.holding,
            lastUpdatedDate: result.lastUpdatedDate,
            dayChange: result.dayChange,
            dayChangePercent: result.dayChangePercent,
            isUpdating: false,
            error: null,
          })
        }
      })
      
      // Add statuses for holdings that don't need data loading
      holdings.forEach(holding => {
        if (!updatedStatuses.has(holding.id)) {
          hasChanges = true
          updatedStatuses.set(holding.id, {
            holding,
            lastUpdatedDate: null,
            dayChange: null,
            dayChangePercent: null,
            isUpdating: false,
            error: null,
          })
        }
      })
      
      // Only return new Map if there are changes, otherwise return existing to maintain stability
      return hasChanges ? updatedStatuses : prevStatuses
    })
  }, [holdings])

  // Load last updated dates and calculate day changes on mount
  // NO automatic price checks - only load what's already in DB
  useEffect(() => {
    // Don't load if we're currently updating
    if (isUpdatingRef.current) {
      return
    }
    
    // Create stable dependency: holding IDs string
    const holdingsIds = holdings.map(h => h.id).sort().join(',')
    
    // Initial load: if ref is empty/initialized and we have holdings, load them
    if (holdingsIdsRef.current === '' && holdings.length > 0) {
      holdingsIdsRef.current = holdingsIds
      loadUpdateStatuses()
      return
    }
    
    // Reload if holdings IDs actually changed (not just reference)
    if (holdingsIds !== holdingsIdsRef.current && holdingsIds.length > 0) {
      holdingsIdsRef.current = holdingsIds
      loadUpdateStatuses()
    }
  }, [holdings, loadUpdateStatuses]) // Include loadUpdateStatuses to ensure it's available

  const updateAllHoldings = async () => {
    setIsUpdatingAll(true)
    isUpdatingRef.current = true
    const updatedStatuses = new Map(updateStatuses)

    // Filter holdings that need price updates
    const holdingsToUpdate = Array.from(updatedStatuses.entries()).filter(([id, status]) => {
      const assetType = status.holding.assetType
      return assetType === 'crypto' || assetType === 'pk-equity' || assetType === 'us-equity' || assetType === 'metals'
    })

    // Mark all holdings as updating
    for (const [id, status] of updatedStatuses.entries()) {
      updatedStatuses.set(id, { ...status, isUpdating: true, error: null })
    }
    setUpdateStatuses(new Map(updatedStatuses))

    // Process all updates in parallel for maximum speed
    // Update UI progressively as each completes
    const updatePromises = holdingsToUpdate.map(async ([id, status]) => {
      const { holding } = status
      const assetType = holding.assetType
      const symbol = holding.symbol.toUpperCase()
      
      try {
        let newPrice: number | null = null
        let priceDate: string | null = null
        let apiResponse: any = null

        // Fetch price using unified API (with refresh=true to force fresh fetch)
        if (holding.assetType === 'crypto') {
          const binanceSymbol = parseSymbolToBinance(holding.symbol)
          const { fetchCryptoPrice } = await import('@/lib/portfolio/unified-price-api')
          apiResponse = await fetchCryptoPrice(binanceSymbol, true)
          if (apiResponse) {
            newPrice = apiResponse.price
            priceDate = apiResponse.date
          } else {
            console.error(`[UPDATE ALL] ${assetType}/${symbol}: API returned null`)
          }
        } else if (holding.assetType === 'pk-equity') {
          const { fetchPKEquityPrice } = await import('@/lib/portfolio/unified-price-api')
          apiResponse = await fetchPKEquityPrice(holding.symbol.toUpperCase(), true)
          if (apiResponse) {
            newPrice = apiResponse.price
            priceDate = apiResponse.date
          }
        } else if (holding.assetType === 'us-equity') {
          const { fetchUSEquityPrice } = await import('@/lib/portfolio/unified-price-api')
          apiResponse = await fetchUSEquityPrice(holding.symbol.toUpperCase(), true)
          if (apiResponse) {
            newPrice = apiResponse.price
            priceDate = apiResponse.date
          }
        } else if (holding.assetType === 'metals') {
          const { fetchMetalsPrice } = await import('@/lib/portfolio/unified-price-api')
          apiResponse = await fetchMetalsPrice(holding.symbol.toUpperCase(), true)
          if (apiResponse) {
            newPrice = apiResponse.price
            priceDate = apiResponse.date
          }
        }

        if (newPrice !== null && priceDate) {
          // Update holding price in portfolio
          if (newPrice !== holding.currentPrice) {
            const { updateHolding } = await import('@/lib/portfolio/portfolio-storage')
            updateHolding(holding.id, { currentPrice: newPrice })
          }

          const result = {
            id,
            status: {
              ...status,
              isUpdating: false,
              error: null,
              lastUpdatedDate: priceDate,
              dayChange: null,
              dayChangePercent: null
            }
          }
          
          // Update UI immediately when this holding completes (progressive updates)
          updatedStatuses.set(result.id, result.status)
          setUpdateStatuses(new Map(updatedStatuses))
          
          return result
        } else {
          console.error(`[UPDATE ALL] ${assetType}/${symbol}: Missing data - price=${newPrice}, date=${priceDate}`)
          const result = {
            id,
            status: { ...status, isUpdating: false, error: 'Price fetch failed' }
          }
          updatedStatuses.set(result.id, result.status)
          setUpdateStatuses(new Map(updatedStatuses))
          return result
        }
      } catch (error) {
        console.error(`[UPDATE ALL] ${assetType}/${symbol}: Exception:`, error)
        const result = {
          id,
          status: { ...status, isUpdating: false, error: 'Update failed' }
        }
        updatedStatuses.set(result.id, result.status)
        setUpdateStatuses(new Map(updatedStatuses))
        return result
      }
    })
    
    // Wait for all updates to complete
    await Promise.all(updatePromises)

    // Final update after all complete
    setUpdateStatuses(new Map(updatedStatuses))
    setIsUpdatingAll(false)
    
    // Call onUpdate to refresh parent holdings
    onUpdate()
    
    // Allow reloading after a delay to let parent state settle
    // Then reload statuses to get fresh day change data
    setTimeout(() => {
      isUpdatingRef.current = false
      // Reload statuses to refresh day change data after prices are updated
      loadUpdateStatuses()
    }, 1500)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    if (dateStr === today.toISOString().split('T')[0]) {
      return 'Today'
    } else if (dateStr === yesterday.toISOString().split('T')[0]) {
      return 'Yesterday'
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    }
  }

  const getDayChangeColor = (change: number | null) => {
    if (change === null) return 'text-muted-foreground'
    if (change > 0) return 'text-green-600 dark:text-green-400'
    if (change < 0) return 'text-red-600 dark:text-red-400'
    return 'text-muted-foreground'
  }

  const getDayChangeIcon = (change: number | null) => {
    if (change === null) return <Minus className="h-3 w-3" />
    if (change > 0) return <TrendingUp className="h-3 w-3" />
    if (change < 0) return <TrendingDown className="h-3 w-3" />
    return <Minus className="h-3 w-3" />
  }

  if (holdings.length === 0) {
    return null
  }

  const statusArray = Array.from(updateStatuses.values())

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Portfolio Updates</CardTitle>
            <CardDescription>
              View last updated dates and day changes for all holdings
            </CardDescription>
          </div>
          <Button
            onClick={updateAllHoldings}
            disabled={isUpdatingAll}
            variant="default"
          >
            {isUpdatingAll ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating All...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Update All Prices
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Current Price</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Day Change</TableHead>
                <TableHead className="text-right">Day Change %</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statusArray.map((status) => {
                // Check if asset type is supported in asset screener
                const supportedTypes: AssetType[] = ['us-equity', 'pk-equity', 'crypto', 'metals', 'kse100', 'spx500']
                const isSupportedInScreener = supportedTypes.includes(status.holding.assetType)
                const assetSlug = isSupportedInScreener ? generateAssetSlug(status.holding.assetType, status.holding.symbol) : null

                return (
                  <TableRow key={status.holding.id}>
                    <TableCell className="font-medium">
                      {status.holding.name || status.holding.symbol}
                    </TableCell>
                    <TableCell>
                      {assetSlug ? (
                        <Link 
                          href={`/asset-screener/${assetSlug}`}
                          className="hover:underline hover:text-primary transition-colors"
                        >
                          <Badge variant="outline" className="cursor-pointer">{status.holding.symbol.toUpperCase()}</Badge>
                        </Link>
                      ) : (
                        <Badge variant="outline">{status.holding.symbol.toUpperCase()}</Badge>
                      )}
                    </TableCell>
                  <TableCell>
                    {formatCurrency(status.holding.currentPrice || 0, status.holding.currency)}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatDate(status.lastUpdatedDate)}
                    </span>
                  </TableCell>
                  <TableCell className={`text-right ${getDayChangeColor(status.dayChange)}`}>
                    {status.dayChange !== null ? (
                      <div className="flex items-center justify-end gap-1">
                        {getDayChangeIcon(status.dayChange)}
                        {formatCurrency(Math.abs(status.dayChange), status.holding.currency)}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className={`text-right ${getDayChangeColor(status.dayChange)}`}>
                    {status.dayChangePercent !== null ? (
                      <span>{status.dayChangePercent > 0 ? '+' : ''}{status.dayChangePercent.toFixed(2)}%</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {status.isUpdating ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : status.error ? (
                      <Badge variant="destructive" className="text-xs">Error</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Ready</Badge>
                    )}
                  </TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

