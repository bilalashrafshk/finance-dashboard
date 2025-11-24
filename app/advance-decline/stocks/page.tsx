"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { SharedNavbar } from "@/components/shared-navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Stock {
  symbol: string
  name: string
  marketCap: number
  sector: string
  industry: string
}

export default function AdvanceDeclineStocksPage() {
  const searchParams = useSearchParams()
  const sector = searchParams.get('sector') || 'all'
  const limit = parseInt(searchParams.get('limit') || '100', 10)

  const [stocks, setStocks] = useState<Stock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStocks() {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          sector,
          limit: limit.toString(),
        })
        const response = await fetch(`/api/advance-decline/stocks?${params.toString()}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch stocks')
        }

        const result = await response.json()
        
        if (result.success) {
          setStocks(result.stocks || [])
        } else {
          throw new Error(result.error || 'Failed to fetch stocks')
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load stocks')
      } finally {
        setLoading(false)
      }
    }

    fetchStocks()
  }, [sector, limit])

  const formatMarketCap = (value: number) => {
    if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
    return value.toLocaleString()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SharedNavbar />
        <div className="container max-w-6xl mx-auto p-6">
          <Card>
            <CardContent className="flex items-center justify-center h-[400px]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <SharedNavbar />
        <div className="container max-w-6xl mx-auto p-6">
          <Card>
            <CardHeader>
              <CardTitle>Error</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <div className="container max-w-6xl mx-auto p-6">
      <div className="mb-4">
        <Link href="/charts#advance-decline">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Chart
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Stocks in Advance-Decline Calculation
          </CardTitle>
          <CardDescription>
            Showing top {limit} stocks by market cap
            {sector !== 'all' && ` in ${sector} sector`}
            {` (${stocks.length} stocks)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Market Cap</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Industry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stocks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No stocks found
                    </TableCell>
                  </TableRow>
                ) : (
                  stocks.map((stock, index) => {
                    const assetSlug = generateAssetSlug('pk-equity', stock.symbol)
                    return (
                      <TableRow key={stock.symbol} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell className="font-mono">
                          <Link 
                            href={`/asset/${assetSlug}`}
                            className="text-primary hover:underline"
                          >
                            {stock.symbol}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link 
                            href={`/asset/${assetSlug}`}
                            className="text-primary hover:underline"
                          >
                            {stock.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMarketCap(stock.marketCap)} PKR
                        </TableCell>
                        <TableCell>{stock.sector}</TableCell>
                        <TableCell>{stock.industry}</TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}

