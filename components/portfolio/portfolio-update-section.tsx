"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RefreshCw, Loader2, TrendingUp, TrendingDown, Minus, Plus } from "lucide-react"
import type { Holding, AssetType } from "@/lib/portfolio/types"
import { ASSET_TYPE_LABELS } from "@/lib/portfolio/types"
import { formatCurrency } from "@/lib/portfolio/portfolio-utils"
import { parseSymbolToBinance } from "@/lib/portfolio/binance-api"
import Link from "next/link"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TransactionsView } from "./transactions-view"

interface PortfolioUpdateSectionProps {
  holdings: Holding[]
  onUpdate: () => void
  // Holdings are now read-only (calculated from transactions)
  // All modifications should be done through transactions
}

interface HoldingUpdateStatus {
  holding: Holding
  lastUpdatedDate: string | null
  dayChange: number | null
  dayChangePercent: number | null
  dayPnL: number | null // Day PnL = dayChange * quantity
  isUpdating: boolean
  error: string | null
  originalHoldingIds?: string[] // For combined holdings, track all original IDs
}

export function PortfolioUpdateSection({ holdings, onUpdate }: PortfolioUpdateSectionProps) {
  const [updateStatuses, setUpdateStatuses] = useState<Map<string, HoldingUpdateStatus>>(new Map())
  const [isUpdatingAll, setIsUpdatingAll] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<{ assetType: string; symbol: string; currency: string; name: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'updates' | 'transactions'>('updates')
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

    if (holdingsToLoad.length === 0) {
      // No holdings to load, just set empty statuses
      setUpdateStatuses(new Map(holdings.map(h => [h.id, {
        holding: h,
        lastUpdatedDate: null,
        dayChange: null,
        dayChangePercent: null,
        dayPnL: null,
        isUpdating: false,
        error: null,
      }])))
      return
    }

    try {
      // OPTIMIZATION: Use batch price API instead of individual calls
      const { parseSymbolToBinance } = await import('@/lib/portfolio/binance-api')

      // Prepare assets for batch API
      const assets = holdingsToLoad.map(holding => {
        if (holding.assetType === 'crypto') {
          const binanceSymbol = parseSymbolToBinance(holding.symbol)
          return { type: 'crypto', symbol: binanceSymbol }
        }
        return { type: holding.assetType, symbol: holding.symbol }
      })

      // Fetch all prices in one batch call
      const priceResponse = await fetch('/api/prices/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets }),
      })

      const priceData: Record<string, { price: number; date: string; source: string }> = {}
      if (priceResponse.ok) {
        const batchResult = await priceResponse.json()
        holdingsToLoad.forEach((holding, index) => {
          const asset = assets[index]
          const key = `${asset.type}:${asset.symbol.toUpperCase()}`
          const result = batchResult.results?.[key]
          if (result && result.price !== null && !result.error) {
            priceData[holding.id] = {
              price: result.price,
              date: result.date || new Date().toISOString().split('T')[0],
              source: result.source || 'api'
            }
          }
        })
      }

      // Fetch historical data for day change calculation in parallel
      const historicalPromises = holdingsToLoad.map(async (holding) => {
        const assetType = holding.assetType
        const symbol = holding.assetType === 'crypto'
          ? parseSymbolToBinance(holding.symbol)
          : holding.symbol.toUpperCase()
        const market = assetType === 'pk-equity' ? 'PSX' : assetType === 'us-equity' ? 'US' : null

        try {
          const url = `/api/historical-data?assetType=${assetType}&symbol=${encodeURIComponent(symbol)}${market ? `&market=${market}` : ''}&limit=5`
          const response = await fetch(url)

          if (response.ok) {
            const data = await response.json()
            const records = data.data || []

            if (records.length > 0) {
              const sortedRecords = [...records].sort((a: any, b: any) => b.date.localeCompare(a.date))

              let dayChange: number | null = null
              let dayChangePercent: number | null = null

              if (sortedRecords.length >= 2) {
                const latest = sortedRecords[0]
                const previous = sortedRecords[1]
                dayChange = latest.close - previous.close
                dayChangePercent = previous.close > 0 ? ((dayChange / previous.close) * 100) : 0
              }

              return {
                holdingId: holding.id,
                lastUpdatedDate: sortedRecords[0].date,
                dayChange,
                dayChangePercent,
              }
            }
          }
        } catch (err) {
          console.error(`[LOAD STATUSES] Historical data fetch failed for ${holding.assetType}/${holding.symbol}:`, err)
        }

        return {
          holdingId: holding.id,
          lastUpdatedDate: priceData[holding.id]?.date || null,
          dayChange: null,
          dayChangePercent: null,
        }
      })

      const historicalResults = await Promise.all(historicalPromises)
      const historicalMap = new Map(historicalResults.map(r => [r.holdingId, r]))

      // Combine price and historical data
      const batchResults = holdingsToLoad.map((holding) => {
        const priceInfo = priceData[holding.id]
        const historicalInfo = historicalMap.get(holding.id)

        // Update holding if we got a new price
        if (priceInfo && priceInfo.price !== null && priceInfo.price !== holding.currentPrice) {
          holding.currentPrice = priceInfo.price
          // Update in storage (fire and forget)
          import('@/lib/portfolio/portfolio-db-storage').then(({ updateHolding }) => {
            updateHolding(holding.id, { currentPrice: priceInfo.price }).catch(err =>
              console.error(`Failed to update holding ${holding.id}:`, err)
            )
          })
        }

        const dayPnL = historicalInfo?.dayChange !== null ? historicalInfo.dayChange * holding.quantity : null

        return {
          holdingId: holding.id,
          holding,
          lastUpdatedDate: historicalInfo?.lastUpdatedDate || priceInfo?.date || null,
          dayChange: historicalInfo?.dayChange || null,
          dayChangePercent: historicalInfo?.dayChangePercent || null,
          dayPnL,
          error: null
        }
      })

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
            existing.dayPnL !== result.dayPnL ||
            existing.holding.currentPrice !== result.holding.currentPrice

          if (dataChanged) {
            hasChanges = true
            updatedStatuses.set(result.holdingId, {
              holding: result.holding,
              lastUpdatedDate: result.lastUpdatedDate,
              dayChange: result.dayChange,
              dayChangePercent: result.dayChangePercent,
              dayPnL: result.dayPnL,
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
              dayPnL: result.dayPnL,
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
              dayPnL: null,
              isUpdating: false,
              error: null,
            })
          }
        })

        // Only return new Map if there are changes, otherwise return existing to maintain stability
        return hasChanges ? updatedStatuses : prevStatuses
      })
    } catch (err: any) {
      console.error('[LOAD STATUSES] Error:', err)
      // On error, still set statuses for holdings (with null values)
      setUpdateStatuses(new Map(holdings.map(h => [h.id, {
        holding: h,
        lastUpdatedDate: null,
        dayChange: null,
        dayChangePercent: null,
        dayPnL: null,
        isUpdating: false,
        error: err.message || "Update failed",
      }])))
    }
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

    // Initial load or re-load
    if (holdingsIds !== holdingsIdsRef.current) {
      holdingsIdsRef.current = holdingsIds
      loadUpdateStatuses()
    } else if (holdingsIdsRef.current === '' && holdings.length > 0) {
      // Handle case where ref was initialized empty but not updated yet
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
            const { updateHolding } = await import('@/lib/portfolio/portfolio-db-storage')
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
              dayChangePercent: null,
              dayPnL: null
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


  const statusArray = Array.from(updateStatuses.values())

  // Group holdings by assetType + symbol + currency (case-insensitive)
  // Only combine holdings with same asset type, symbol, and currency
  const groupedStatuses = new Map<string, HoldingUpdateStatus[]>()

  statusArray.forEach(status => {
    const key = `${status.holding.assetType}:${status.holding.symbol.toUpperCase()}:${status.holding.currency}`
    if (!groupedStatuses.has(key)) {
      groupedStatuses.set(key, [])
    }
    groupedStatuses.get(key)!.push(status)
  })

  // Combine grouped holdings into single entries
  const combinedStatuses: HoldingUpdateStatus[] = []

  groupedStatuses.forEach((statuses, key) => {
    if (statuses.length === 1) {
      // Single holding, no need to combine
      combinedStatuses.push(statuses[0])
    } else {
      // Multiple holdings of same asset - combine them
      const firstStatus = statuses[0]
      const totalQuantity = statuses.reduce((sum, s) => sum + s.holding.quantity, 0)
      const totalInvested = statuses.reduce((sum, s) => sum + (s.holding.purchasePrice * s.holding.quantity), 0)
      const averagePurchasePrice = totalQuantity > 0 ? totalInvested / totalQuantity : firstStatus.holding.purchasePrice

      // Sum day PnL from all holdings
      const combinedDayPnL = statuses.reduce((sum, s) => {
        return sum + (s.dayPnL || 0)
      }, 0)

      // Use the most recent last updated date
      const mostRecentDate = statuses.reduce((latest, s) => {
        if (!s.lastUpdatedDate) return latest
        if (!latest) return s.lastUpdatedDate
        return s.lastUpdatedDate > latest ? s.lastUpdatedDate : latest
      }, null as string | null)

      // Day change and day change percent are per-share, so use from first (they should be same)
      const dayChange = firstStatus.dayChange
      const dayChangePercent = firstStatus.dayChangePercent

      // Current price should be same for all (same asset), use first
      const currentPrice = firstStatus.holding.currentPrice

      // Create combined holding
      const combinedHolding: Holding = {
        ...firstStatus.holding,
        quantity: totalQuantity,
        purchasePrice: averagePurchasePrice,
      }

      combinedStatuses.push({
        holding: combinedHolding,
        lastUpdatedDate: mostRecentDate,
        dayChange,
        dayChangePercent,
        dayPnL: combinedDayPnL,
        isUpdating: statuses.some(s => s.isUpdating),
        error: statuses.find(s => s.error)?.error || null,
        originalHoldingIds: statuses.map(s => s.holding.id), // Track all original IDs for delete
      })
    }
  })

  // Always render the component, even with no holdings
  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Portfolio Updates</CardTitle>
            <CardDescription>
              {activeTab === 'updates'
                ? 'View last updated dates and day changes for all holdings'
                : selectedAsset
                  ? `Transaction history for ${selectedAsset.name || selectedAsset.symbol}`
                  : 'View all transactions and transaction history'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'updates' | 'transactions')}>
          <TabsList>
            <TabsTrigger value="updates">Portfolio Updates</TabsTrigger>
            <TabsTrigger value="transactions">
              Transactions
              {selectedAsset && (
                <span className="ml-2 text-xs">({selectedAsset.symbol})</span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="updates" className="space-y-4">
            {holdings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground mb-4">No holdings yet. Add your first transaction to get started!</p>
                <Button onClick={() => setActiveTab('transactions')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Your First Transaction
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Current Price</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Day Change</TableHead>
                      <TableHead className="text-right">Day Change %</TableHead>
                      <TableHead className="text-right">Day PnL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {combinedStatuses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No holdings found
                        </TableCell>
                      </TableRow>
                    ) : (
                      combinedStatuses.map((status) => {
                        // Check if asset type is supported in asset screener
                        const supportedTypes: AssetType[] = ['us-equity', 'pk-equity', 'crypto', 'metals', 'kse100', 'spx500']
                        const isSupportedInScreener = supportedTypes.includes(status.holding.assetType)
                        const assetSlug = isSupportedInScreener ? generateAssetSlug(status.holding.assetType, status.holding.symbol) : null

                        // Use a unique key based on asset type, symbol, and currency for combined holdings
                        const uniqueKey = status.originalHoldingIds && status.originalHoldingIds.length > 1
                          ? `${status.holding.assetType}:${status.holding.symbol.toUpperCase()}:${status.holding.currency}`
                          : status.holding.id

                        // Get individual holdings for this asset
                        const getIndividualHoldings = () => {
                          if (status.originalHoldingIds && status.originalHoldingIds.length > 1) {
                            return holdings.filter(h => status.originalHoldingIds!.includes(h.id))
                          }
                          return [status.holding]
                        }

                        return (
                          <TableRow key={uniqueKey}>
                            <TableCell className="font-medium">
                              <button
                                onClick={() => {
                                  setSelectedAsset({
                                    assetType: status.holding.assetType,
                                    symbol: status.holding.symbol,
                                    currency: status.holding.currency,
                                    name: status.holding.name || status.holding.symbol,
                                  })
                                  setActiveTab('transactions')
                                }}
                                className="hover:underline hover:text-primary transition-colors cursor-pointer text-left"
                                title="View transaction history"
                              >
                                {status.holding.name || status.holding.symbol}
                              </button>
                            </TableCell>
                            <TableCell>
                              {assetSlug ? (
                                <Link
                                  href={`/asset/${assetSlug}`}
                                  className="hover:underline hover:text-primary transition-colors"
                                >
                                  <Badge variant="outline" className="cursor-pointer">{status.holding.symbol.toUpperCase()}</Badge>
                                </Link>
                              ) : (
                                <Badge variant="outline">{status.holding.symbol.toUpperCase()}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {status.holding.quantity.toLocaleString()}
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
                            <TableCell className={`text-right font-semibold ${getDayChangeColor(status.dayPnL)}`}>
                              {status.dayPnL !== null ? (
                                <div className="flex items-center justify-end gap-1">
                                  {getDayChangeIcon(status.dayPnL)}
                                  {formatCurrency(Math.abs(status.dayPnL), status.holding.currency)}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <TransactionsView
              holdings={holdings}
              selectedAsset={selectedAsset}
              onClearAssetFilter={() => setSelectedAsset(null)}
              onHoldingsUpdate={onUpdate}
            />
          </TabsContent>
        </Tabs>
      </CardContent>

    </Card>
  )
}

