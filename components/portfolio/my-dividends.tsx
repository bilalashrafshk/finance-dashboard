"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2 } from "lucide-react"
import type { Holding } from "@/lib/portfolio/types"
import { calculateDividendsCollected, type HoldingDividend } from "@/lib/portfolio/portfolio-utils"
import { formatCurrency } from "@/lib/portfolio/portfolio-utils"

interface MyDividendsProps {
  holdings: Holding[]
  currency?: string
  hideCard?: boolean // If true, don't render the outer Card wrapper
}

export function MyDividends({ holdings, currency = 'PKR', hideCard = false }: MyDividendsProps) {
  const [loading, setLoading] = useState(true)
  const [holdingDividends, setHoldingDividends] = useState<HoldingDividend[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadDividends = async () => {
      setLoading(true)
      setError(null)

      try {
        const pkEquityHoldings = holdings.filter(h => h.assetType === 'pk-equity')

        if (pkEquityHoldings.length === 0) {
          setHoldingDividends([])
          setLoading(false)
          return
        }

        const dividends = await calculateDividendsCollected(pkEquityHoldings)
        setHoldingDividends(dividends)
      } catch (err: any) {
        console.error('Error loading dividends:', err)
        setError(err.message || 'Failed to load dividends')
      } finally {
        setLoading(false)
      }
    }

    loadDividends()
  }, [holdings])

  const content = (() => {
    if (loading) {
      return (
        <>
          {!hideCard && (
            <CardHeader>
              <CardTitle>My Dividends</CardTitle>
              <CardDescription>Loading dividend data...</CardDescription>
            </CardHeader>
          )}
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </>
      )
    }

    if (error) {
      return (
        <>
          {!hideCard && (
            <CardHeader>
              <CardTitle>My Dividends</CardTitle>
              <CardDescription className="text-destructive">{error}</CardDescription>
            </CardHeader>
          )}
        </>
      )
    }

    const pkEquityHoldings = holdings.filter(h => h.assetType === 'pk-equity')
    if (pkEquityHoldings.length === 0) {
      return (
        <>
          {!hideCard && (
            <CardHeader>
              <CardTitle>My Dividends</CardTitle>
              <CardDescription>No PK equity holdings to calculate dividends</CardDescription>
            </CardHeader>
          )}
        </>
      )
    }

    const totalDividends = holdingDividends.reduce((sum, hd) => sum + hd.totalCollected, 0)
    const totalDividendCount = holdingDividends.reduce((sum, hd) => sum + hd.dividends.length, 0)

    // Format date for display
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    }

    // Get holding name by symbol
    const getHoldingName = (symbol: string) => {
      const holding = holdings.find(h => h.symbol === symbol && h.assetType === 'pk-equity')
      return holding?.name || symbol
    }

    // Get holding quantity by symbol
    const getHoldingQuantity = (symbol: string) => {
      const holding = holdings.find(h => h.symbol === symbol && h.assetType === 'pk-equity')
      return holding?.quantity || 0
    }

    // Get holding currency by symbol
    const getHoldingCurrency = (symbol: string) => {
      const holding = holdings.find(h => h.symbol === symbol)
      return holding?.currency || currency
    }

    // Sort by date descending (most recent first)
    const allDividends = holdingDividends.flatMap(hd =>
      hd.dividends.map(d => ({
        ...d,
        symbol: hd.symbol,
        holdingId: hd.holdingId
      }))
    ).sort((a, b) => b.date.localeCompare(a.date))

    return (
      <>
        {!hideCard && (
          <CardHeader>
            <CardTitle>My Dividends</CardTitle>
            <CardDescription>
              Dividends collected from PK equity holdings since purchase
              {totalDividendCount > 0 && (
                <span className="ml-2">
                  • {totalDividendCount} payment{totalDividendCount !== 1 ? 's' : ''} • Total: {formatCurrency(totalDividends, currency)}
                </span>
              )}
            </CardDescription>
          </CardHeader>
        )}
        <CardContent>
          {totalDividends === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No dividends collected yet
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary by Holding */}
              <div>
                <h3 className="text-sm font-semibold mb-3">By Holding</h3>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Holding Name</TableHead>
                        <TableHead className="text-right">Shares</TableHead>
                        <TableHead className="text-right">Dividend Payments</TableHead>
                        <TableHead className="text-right">Total Collected</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {holdingDividends
                        .filter(hd => hd.totalCollected > 0)
                        .sort((a, b) => b.totalCollected - a.totalCollected)
                        .map((hd) => (
                          <TableRow key={hd.holdingId}>
                            <TableCell className="font-medium">{hd.symbol}</TableCell>
                            <TableCell>{getHoldingName(hd.symbol)}</TableCell>
                            <TableCell className="text-right">{getHoldingQuantity(hd.symbol).toLocaleString()}</TableCell>
                            <TableCell className="text-right">{hd.dividends.length}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(hd.totalCollected, getHoldingCurrency(hd.symbol))}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* All Dividends List */}
              <div>
                <h3 className="text-sm font-semibold mb-3">All Dividend Payments</h3>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Holding Name</TableHead>
                        <TableHead className="text-right">Dividend per Share</TableHead>
                        <TableHead className="text-right">Total Collected</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allDividends.map((dividend, index) => (
                        <TableRow key={`${dividend.holdingId}-${dividend.date}-${index}`}>
                          <TableCell className="font-medium">{formatDate(dividend.date)}</TableCell>
                          <TableCell>{dividend.symbol}</TableCell>
                          <TableCell>{getHoldingName(dividend.symbol)}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(dividend.dividendAmount, getHoldingCurrency(dividend.symbol))}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(dividend.totalCollected, getHoldingCurrency(dividend.symbol))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </>
    )
  })()

  if (hideCard) {
    return <>{content}</>
  }

  return <Card>{content}</Card>
}

