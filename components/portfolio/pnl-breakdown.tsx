"use client"

import { useMemo, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { Holding } from "@/lib/portfolio/types"
import { ASSET_TYPE_LABELS } from "@/lib/portfolio/types"
import {
  calculateInvested,
  calculateCurrentValue,
  calculateGainLoss,
  calculateGainLossPercent,
  formatCurrency,
  formatPercent,
  combineHoldingsByAsset,
  calculateRealizedPnLPerAsset,
  calculateInvestedPerAsset,
  type Trade,
} from "@/lib/portfolio/portfolio-utils"
import Link from "next/link"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"
import type { AssetType } from "@/lib/portfolio/types"

interface PnLBreakdownProps {
  holdings: Holding[]
  currency?: string
}

export function PnLBreakdown({ holdings, currency = 'USD' }: PnLBreakdownProps) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loadingTrades, setLoadingTrades] = useState(true)

  // Fetch all trades to calculate realized PnL
  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const token = localStorage.getItem('auth_token')
        if (!token) {
          setLoadingTrades(false)
          return
        }

        const response = await fetch('/api/user/trades', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (response.ok) {
          const data = await response.json()
          setTrades(data.trades || [])
        }
      } catch (error) {
        console.error('Error fetching trades:', error)
      } finally {
        setLoadingTrades(false)
      }
    }

    fetchTrades()
  }, [])

  // Calculate realized PnL per asset
  const realizedPnLMap = useMemo(() => {
    return calculateRealizedPnLPerAsset(trades)
  }, [trades])

  // Calculate invested amount per asset from buy transactions
  const investedPerAssetMap = useMemo(() => {
    return calculateInvestedPerAsset(trades)
  }, [trades])

  // Get all unique assets (from holdings + closed positions with realized PnL)
  const allAssets = useMemo(() => {
    const assetMap = new Map<string, {
      holding: Holding | null
      assetKey: string
      assetType: string
      symbol: string
      name: string
      currency: string
    }>()

    // Add active holdings
    const combinedHoldings = combineHoldingsByAsset(holdings)
    combinedHoldings.forEach(holding => {
      const assetKey = `${holding.assetType}:${holding.symbol.toUpperCase()}:${holding.currency}`
      assetMap.set(assetKey, {
        holding,
        assetKey,
        assetType: holding.assetType,
        symbol: holding.symbol,
        name: holding.name,
        currency: holding.currency,
      })
    })

    // Add closed positions (have realized PnL but no active holding)
    realizedPnLMap.forEach((realizedPnL, assetKey) => {
      if (!assetMap.has(assetKey) && realizedPnL !== 0) {
        // Extract asset info from key
        const [assetType, symbol, assetCurrency] = assetKey.split(':')
        // Try to get name from trades
        const assetTrade = trades.find(t =>
          t.assetType === assetType &&
          t.symbol.toUpperCase() === symbol &&
          t.currency === assetCurrency
        )
        assetMap.set(assetKey, {
          holding: null,
          assetKey,
          assetType,
          symbol,
          name: assetTrade?.name || symbol,
          currency: assetCurrency,
        })
      }
    })

    return Array.from(assetMap.values())
  }, [holdings, realizedPnLMap, trades])

  const pnlData = useMemo(() => {
    return allAssets
      .map(({ holding, assetKey, assetType, symbol, name, currency: assetCurrency }) => {
        const realizedPnL = realizedPnLMap.get(assetKey) || 0
        const totalInvestedFromTrades = investedPerAssetMap.get(assetKey) || 0

        if (holding) {
          // Active position
          const invested = calculateInvested(holding)
          const currentValue = calculateCurrentValue(holding)
          const unrealizedPnL = calculateGainLoss(holding)
          const totalPnL = realizedPnL + unrealizedPnL
          // For active positions, use current invested amount
          // But we could also show total invested from all trades (including sold shares)
          const totalInvested = invested
          const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0

          return {
            holding,
            assetKey,
            assetType,
            symbol,
            name,
            currency: assetCurrency,
            status: 'active' as const,
            invested,
            currentValue,
            realizedPnL,
            unrealizedPnL,
            totalPnL,
            totalPnLPercent,
          }
        } else {
          // Closed position (only realized PnL)
          // Use total invested from buy transactions to calculate ROI
          const invested = totalInvestedFromTrades
          const totalPnL = realizedPnL
          const totalPnLPercent = invested > 0 ? (totalPnL / invested) * 100 : 0

          return {
            holding: null,
            assetKey,
            assetType,
            symbol,
            name,
            currency: assetCurrency,
            status: 'closed' as const,
            invested,
            currentValue: 0,
            realizedPnL,
            unrealizedPnL: 0,
            totalPnL,
            totalPnLPercent,
          }
        }
      })
      .sort((a, b) => b.totalPnL - a.totalPnL) // Sort by total PnL descending
  }, [allAssets, realizedPnLMap, investedPerAssetMap])

  const totalPnL = useMemo(() => {
    return pnlData.reduce((sum, item) => sum + item.totalPnL, 0)
  }, [pnlData])

  const totalInvested = useMemo(() => {
    return pnlData.reduce((sum, item) => sum + item.invested, 0)
  }, [pnlData])

  const totalRealizedPnL = useMemo(() => {
    return pnlData.reduce((sum, item) => sum + item.realizedPnL, 0)
  }, [pnlData])

  const totalUnrealizedPnL = useMemo(() => {
    return pnlData.reduce((sum, item) => sum + item.unrealizedPnL, 0)
  }, [pnlData])

  if (holdings.length === 0 && pnlData.length === 0 && !loadingTrades) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>PnL by Asset</CardTitle>
          <CardDescription>Profit and Loss breakdown by individual assets</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            No holdings to display
          </div>
        </CardContent>
      </Card>
    )
  }

  const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>PnL by Asset</CardTitle>
        <CardDescription>
          Profit and Loss breakdown by individual assets. Total PnL: {formatCurrency(totalPnL, currency)} ({formatPercent(totalPnLPercent)})
          {totalRealizedPnL !== 0 && (
            <span className="ml-2 text-xs">
              (Realized: {formatCurrency(totalRealizedPnL, currency)}, Unrealized: {formatCurrency(totalUnrealizedPnL, currency)})
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loadingTrades ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            Loading trades...
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Invested</TableHead>
                  <TableHead className="text-right">Current Value</TableHead>
                  <TableHead className="text-right">Realized PnL</TableHead>
                  <TableHead className="text-right">Unrealized PnL</TableHead>
                  <TableHead className="text-right">Total PnL</TableHead>
                  <TableHead className="text-right">Total PnL %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pnlData.map(({ holding, assetKey, assetType, symbol, name, currency: assetCurrency, status, invested, currentValue, realizedPnL, unrealizedPnL, totalPnL: assetTotalPnL, totalPnLPercent: assetTotalPnLPercent }) => {
                  const isPositive = assetTotalPnL >= 0
                  const supportedTypes: AssetType[] = ['us-equity', 'pk-equity', 'crypto', 'metals', 'kse100', 'spx500']
                  const isSupportedInScreener = supportedTypes.includes(assetType as AssetType)
                  const assetSlug = isSupportedInScreener ? generateAssetSlug(assetType as AssetType, symbol) : null

                  return (
                    <TableRow key={assetKey}>
                      <TableCell className="font-medium">
                        {assetSlug ? (
                          <Link
                            href={`/my-list/${assetSlug}`}
                            className="hover:underline hover:text-primary transition-colors"
                          >
                            <div>{symbol}</div>
                            {name !== symbol && (
                              <div className="text-xs text-muted-foreground">{name}</div>
                            )}
                          </Link>
                        ) : (
                          <>
                            <div>{symbol}</div>
                            {name !== symbol && (
                              <div className="text-xs text-muted-foreground">{name}</div>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{ASSET_TYPE_LABELS[assetType as AssetType]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status === 'active' ? 'default' : 'secondary'}>
                          {status === 'active' ? 'Active' : 'Closed'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {invested > 0 ? formatCurrency(invested, assetCurrency) : (status === 'closed' && invested === 0 ? '-' : formatCurrency(invested, assetCurrency))}
                      </TableCell>
                      <TableCell className="text-right">
                        {currentValue > 0 ? formatCurrency(currentValue, assetCurrency) : '-'}
                      </TableCell>
                      <TableCell className={`text-right ${realizedPnL !== 0 ? (realizedPnL >= 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
                        {realizedPnL !== 0 ? formatCurrency(realizedPnL, assetCurrency) : '-'}
                      </TableCell>
                      <TableCell className={`text-right ${unrealizedPnL !== 0 ? (unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
                        {unrealizedPnL !== 0 ? formatCurrency(unrealizedPnL, assetCurrency) : '-'}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(assetTotalPnL, assetCurrency)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {invested > 0 ? formatPercent(assetTotalPnLPercent) : '-'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

