"use client"

import { useMemo } from "react"
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
} from "@/lib/portfolio/portfolio-utils"
import Link from "next/link"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"
import type { AssetType } from "@/lib/portfolio/types"

interface PnLBreakdownProps {
  holdings: Holding[]
  currency?: string
}

export function PnLBreakdown({ holdings, currency = 'USD' }: PnLBreakdownProps) {
  const pnlData = useMemo(() => {
    return holdings
      .map(holding => {
        const invested = calculateInvested(holding)
        const currentValue = calculateCurrentValue(holding)
        const gainLoss = calculateGainLoss(holding)
        const gainLossPercent = calculateGainLossPercent(holding)
        
        return {
          holding,
          invested,
          currentValue,
          gainLoss,
          gainLossPercent,
        }
      })
      .sort((a, b) => b.gainLoss - a.gainLoss) // Sort by PnL descending
  }, [holdings])

  const totalPnL = useMemo(() => {
    return pnlData.reduce((sum, item) => sum + item.gainLoss, 0)
  }, [pnlData])

  const totalInvested = useMemo(() => {
    return pnlData.reduce((sum, item) => sum + item.invested, 0)
  }, [pnlData])

  if (holdings.length === 0) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>PnL by Asset</CardTitle>
        <CardDescription>
          Profit and Loss breakdown by individual assets. Total PnL: {formatCurrency(totalPnL, currency)} ({formatPercent((totalPnL / totalInvested) * 100)})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Invested</TableHead>
                <TableHead className="text-right">Current Value</TableHead>
                <TableHead className="text-right">PnL</TableHead>
                <TableHead className="text-right">PnL %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pnlData.map(({ holding, invested, currentValue, gainLoss, gainLossPercent }) => {
                const isPositive = gainLoss >= 0
                const supportedTypes: AssetType[] = ['us-equity', 'pk-equity', 'crypto', 'metals', 'kse100', 'spx500']
                const isSupportedInScreener = supportedTypes.includes(holding.assetType)
                const assetSlug = isSupportedInScreener ? generateAssetSlug(holding.assetType, holding.symbol) : null

                return (
                  <TableRow key={holding.id}>
                    <TableCell className="font-medium">
                      {assetSlug ? (
                        <Link 
                          href={`/asset-screener/${assetSlug}`}
                          className="hover:underline hover:text-primary transition-colors"
                        >
                          <div>{holding.symbol}</div>
                          {holding.name !== holding.symbol && (
                            <div className="text-xs text-muted-foreground">{holding.name}</div>
                          )}
                        </Link>
                      ) : (
                        <>
                          <div>{holding.symbol}</div>
                          {holding.name !== holding.symbol && (
                            <div className="text-xs text-muted-foreground">{holding.name}</div>
                          )}
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{ASSET_TYPE_LABELS[holding.assetType]}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(invested, holding.currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(currentValue, holding.currency)}</TableCell>
                    <TableCell className={`text-right font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(gainLoss, holding.currency)}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercent(gainLossPercent)}
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

