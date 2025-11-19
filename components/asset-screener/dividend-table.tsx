"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw } from "lucide-react"
import { convertDividendToRupees } from "@/lib/portfolio/dividend-utils"

interface DividendRecord {
  date: string
  dividend_amount: number
}

interface YearlyDividendData {
  year: number
  dividends: DividendRecord[]
  totalDividends: number
  yield?: number // Trailing dividend yield
  lastPriceDate?: string
  lastPrice?: number
}

interface DividendTableProps {
  assetType: string
  symbol: string
}

export function DividendTable({ assetType, symbol }: DividendTableProps) {
  // Only show for PK equity assets
  if (assetType !== 'pk-equity') {
    return null
  }

  const [dividends, setDividends] = useState<DividendRecord[]>([])
  const [yearlyData, setYearlyData] = useState<YearlyDividendData[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [faceValue, setFaceValue] = useState<number | null>(null)
  const [displayYearCount, setDisplayYearCount] = useState(10) // Number of years to display
  const DISPLAY_INCREMENT = 10 // Load 10 more years at a time

  const groupDividendsByYear = (dividendRecords: DividendRecord[], priceRecords: any[]) => {
      // Group dividends by year
      const yearMap = new Map<number, DividendRecord[]>()
      
      dividendRecords.forEach(dividend => {
        const year = new Date(dividend.date).getFullYear()
        if (!yearMap.has(year)) {
          yearMap.set(year, [])
        }
        yearMap.get(year)!.push(dividend)
      })

      // Calculate yearly data with yields
      const yearly: YearlyDividendData[] = []
      
      yearMap.forEach((yearDividends, year) => {
        // Sort dividends by date within year (ascending)
        yearDividends.sort((a, b) => a.date.localeCompare(b.date))
        
        // Calculate total dividends for the year
        const totalDividends = yearDividends.reduce((sum, d) => sum + d.dividend_amount, 0)
        
        // Find last available price for this year
        const yearEndDate = `${year}-12-31`
        const yearStartDate = `${year}-01-01`
        
        // Get all prices for this year
        const yearPrices = priceRecords
          .filter((p: any) => p.date >= yearStartDate && p.date <= yearEndDate)
          .sort((a: any, b: any) => b.date.localeCompare(a.date)) // Descending (most recent first)
        
        const lastPriceRecord = yearPrices[0] // Most recent price in the year
        
        let yieldValue: number | undefined
        let lastPrice: number | undefined
        let lastPriceDate: string | undefined
        
        if (lastPriceRecord && lastPriceRecord.close) {
          lastPrice = parseFloat(lastPriceRecord.close)
          lastPriceDate = lastPriceRecord.date
          
          // Calculate yield: Total Dividends Paid (in Rs.) / Share Price * 100
          // In Pakistan, dividends are typically % of face value (usually Rs. 10)
          // dividend_amount is stored as percent/10 (e.g., 20% = 2.0)
          // To convert to rupees: if 20% = Rs. 2, then face value is Rs. 10
          // Formula: (percent/100) * face_value = rupees
          // Since we store percent/10, and face value is typically Rs. 10:
          // (percent/10) * 1 = rupees
          // Example: 20% stored as 2.0, so 2.0 * 1 = Rs. 2 per share
          if (lastPrice > 0) {
            // Convert dividend_amount to rupees using centralized utility
            const totalDividendRupees = convertDividendToRupees(totalDividends)
            // Yield = (Total Dividends in Rs. / Price) * 100
            yieldValue = (totalDividendRupees / lastPrice) * 100
          }
        }
        
        yearly.push({
          year,
          dividends: yearDividends,
          totalDividends,
          yield: yieldValue,
          lastPrice,
          lastPriceDate
        })
      })

      // Sort by year descending (most recent first)
      yearly.sort((a, b) => b.year - a.year)
      setYearlyData(yearly)
    }

  const fetchDividendsAndPrices = async (forceRefresh: boolean = false) => {
    if (forceRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      // Fetch face value from company profile
      try {
        const profileResponse = await fetch(`/api/financials?symbol=${encodeURIComponent(symbol)}&period=quarterly`)
        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          if (profileData.profile && profileData.profile.face_value) {
            setFaceValue(parseFloat(profileData.profile.face_value))
          }
        }
      } catch (err) {
        console.warn('Failed to fetch face value:', err)
      }

      // Fetch dividends with refresh parameter if needed
      const refreshParam = forceRefresh ? '&refresh=true' : ''
      const dividendResponse = await fetch(`/api/pk-equity/dividend?ticker=${encodeURIComponent(symbol)}${refreshParam}`)
        
      if (!dividendResponse.ok) {
        throw new Error('Failed to fetch dividend data')
      }

      const dividendData = await dividendResponse.json()
      
      let dividendRecords: DividendRecord[] = []
      if (dividendData.dividends && Array.isArray(dividendData.dividends)) {
        // Sort by date descending (most recent first)
        dividendRecords = [...dividendData.dividends].sort((a, b) => b.date.localeCompare(a.date))
        setDividends(dividendRecords)
      } else {
        setDividends([])
        setYearlyData([])
        setLoading(false)
        setRefreshing(false)
        return
      }

      // Fetch historical price data to calculate yields
      const priceResponse = await fetch(`/api/historical-data?assetType=pk-equity&symbol=${encodeURIComponent(symbol)}&market=PSX`)
      
      if (!priceResponse.ok) {
        // If price data fetch fails, still show dividends without yields
        console.warn('Failed to fetch price data for yield calculation')
        groupDividendsByYear(dividendRecords, [])
        setLoading(false)
        setRefreshing(false)
        return
      }

      const priceData = await priceResponse.json()
      const priceRecords = priceData.data || []

      // Group dividends by year and calculate yields
      groupDividendsByYear(dividendRecords, priceRecords)
    } catch (err: any) {
      console.error('Error fetching dividends:', err)
      setError(err.message || 'Failed to fetch dividend data')
      setDividends([])
      setYearlyData([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchDividendsAndPrices(false)
  }, [symbol])

  const handleRefresh = () => {
    fetchDividendsAndPrices(true)
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dividend History</CardTitle>
          <CardDescription>Loading dividend data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dividend History</CardTitle>
          <CardDescription className="text-destructive">{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (dividends.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dividend History</CardTitle>
          <CardDescription>No dividend data available for this asset</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // Calculate summary statistics
  const totalDividends = dividends.length
  const latestDividend = dividends[0] // Already sorted descending
  const oldestDividend = dividends[dividends.length - 1]
  const averageDividend = dividends.length > 0
    ? dividends.reduce((sum, d) => sum + d.dividend_amount, 0) / dividends.length
    : 0
  
  // Calculate average dividend amount per year
  const averageDividendPerYear = yearlyData.length > 0
    ? yearlyData.reduce((sum, y) => sum + y.totalDividends, 0) / yearlyData.length
    : 0
  
  // Calculate average dividend yield per year
  const yieldsWithData = yearlyData.filter(y => y.yield !== undefined).map(y => y.yield!)
  const averageYieldPerYear = yieldsWithData.length > 0
    ? yieldsWithData.reduce((sum, y) => sum + y, 0) / yieldsWithData.length
    : null

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  // Format dividend amount (already stored as percent/10, so just show the number)
  const formatDividend = (amount: number) => {
    return amount.toFixed(2)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Dividend History</CardTitle>
            <CardDescription>
              {totalDividends} dividend payment{totalDividends !== 1 ? 's' : ''} recorded
              {oldestDividend && latestDividend && (
                <span className="ml-2">
                  ({formatDate(oldestDividend.date)} - {formatDate(latestDividend.date)})
                </span>
              )}
              {faceValue && (
                <span className="ml-2">• Face Value: {faceValue.toFixed(2)}</span>
              )}
            </CardDescription>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleRefresh} 
            disabled={refreshing || loading}
            title="Refresh and recalculate dividends with correct face value"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div>
            <div className="text-sm text-muted-foreground">Latest Dividend</div>
            <div className="text-lg font-semibold">{formatDividend(latestDividend.dividend_amount)}</div>
            <div className="text-xs text-muted-foreground">{formatDate(latestDividend.date)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Average Dividend</div>
            <div className="text-lg font-semibold">{formatDividend(averageDividend)}</div>
            <div className="text-xs text-muted-foreground">per payment</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Avg Dividend Amount/Year</div>
            <div className="text-lg font-semibold">{formatDividend(averageDividendPerYear)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Avg Dividend Yield/Year</div>
            <div className="text-lg font-semibold">
              {averageYieldPerYear !== null ? (
                <span className="text-green-600 dark:text-green-400">
                  {averageYieldPerYear.toFixed(2)}%
                </span>
              ) : (
                <span className="text-muted-foreground">N/A</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Face Value</div>
            <div className="text-lg font-semibold">
              {faceValue ? faceValue.toFixed(2) : <span className="text-muted-foreground">N/A</span>}
            </div>
          </div>
        </div>

        {/* Dividend Table - Grouped by Year */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Dividend Amount</TableHead>
                <TableHead className="text-right">Trailing Dividend Yield</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {yearlyData.slice(0, displayYearCount).flatMap((yearData) => {
                const rows: JSX.Element[] = []
                yearData.dividends.forEach((dividend, index) => {
                  const isFirstInYear = index === 0
                  rows.push(
                    <TableRow key={`${yearData.year}-${dividend.date}-${index}`}>
                      {isFirstInYear && (
                        <TableCell 
                          className="font-semibold align-top" 
                          rowSpan={yearData.dividends.length}
                        >
                          {yearData.year}
                          {yearData.lastPriceDate && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Price: {formatDate(yearData.lastPriceDate)}
                              {yearData.lastPrice && (
                                <span className="ml-1">({yearData.lastPrice.toFixed(2)})</span>
                              )}
                            </div>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{formatDate(dividend.date)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatDividend(dividend.dividend_amount)}
                      </TableCell>
                      {isFirstInYear && (
                        <TableCell 
                          className="text-right font-semibold align-top" 
                          rowSpan={yearData.dividends.length}
                        >
                          {yearData.yield !== undefined ? (
                            <span className="text-green-600 dark:text-green-400">
                              {yearData.yield.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">N/A</span>
                          )}
                          {yearData.dividends.length > 1 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Total: {formatDividend(yearData.totalDividends)}
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })
                return rows
              })}
            </TableBody>
          </Table>
          {yearlyData.length > displayYearCount && (
            <div className="px-4 py-4 text-center border-t">
              <div className="text-sm text-muted-foreground mb-3">
                Showing {displayYearCount} of {yearlyData.length} years
              </div>
              <Button
                variant="outline"
                onClick={() => setDisplayYearCount(prev => Math.min(prev + DISPLAY_INCREMENT, yearlyData.length))}
              >
                Load More ({Math.min(DISPLAY_INCREMENT, yearlyData.length - displayYearCount)} more)
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

