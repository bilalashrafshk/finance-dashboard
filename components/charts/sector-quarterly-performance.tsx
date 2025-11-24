"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Loader2, TrendingUp, TrendingDown, CheckCircle2, XCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useTheme } from "next-themes"

interface QuarterPerformance {
  quarter: string
  startDate: string
  endDate: string
  sectorReturn: number
  kse100Return: number
  outperformance: number
  outperformed: boolean
}

interface SectorQuarterlyPerformance {
  sector: string
  quarters: QuarterPerformance[]
}

interface SectorPerformanceResponse {
  success: boolean
  year: number
  includeDividends: boolean
  data: SectorQuarterlyPerformance[]
  count: number
}

export function SectorQuarterlyPerformance() {
  const { theme } = useTheme()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SectorQuarterlyPerformance[]>([])
  const [year, setYear] = useState(new Date().getFullYear())
  const [includeDividends, setIncludeDividends] = useState(false)
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())

  // Generate years list (last 10 years)
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i)

  useEffect(() => {
    setCurrentYear(new Date().getFullYear())
  }, [])

  useEffect(() => {
    loadData()
  }, [year, includeDividends])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      params.append('year', year.toString())
      params.append('includeDividends', includeDividends.toString())

      const response = await fetch(`/api/sector-performance/quarterly?${params.toString()}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(errorData.error || errorData.details || 'Failed to fetch sector performance data')
      }

      const result: SectorPerformanceResponse = await response.json()

      if (!result.success || !result.data) {
        throw new Error('Invalid response format')
      }

      setData(result.data)
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load sector performance data'
      setError(errorMessage)
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Get all unique quarters from the data
  const allQuarters = data.length > 0
    ? Array.from(new Set(data.flatMap(s => s.quarters.map(q => q.quarter)))).sort()
    : []

  // Format percentage
  const formatPercent = (value: number | null | undefined): string => {
    if (value === null || value === undefined || isNaN(value)) {
      return 'N/A'
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  // Get color for return value
  const getReturnColor = (value: number | null | undefined): string => {
    if (value === null || value === undefined || isNaN(value)) {
      return 'text-muted-foreground'
    }
    return value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sector Quarterly Performance</CardTitle>
          <CardDescription>
            Quarter-wise performance of each sector compared to KSE100
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Select value={year.toString()} onValueChange={(value) => setYear(parseInt(value, 10))}>
                <SelectTrigger id="year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dividends" className="flex items-center justify-between">
                <span>Include Dividends</span>
                <Switch
                  id="dividends"
                  checked={includeDividends}
                  onCheckedChange={setIncludeDividends}
                />
              </Label>
              <p className="text-xs text-muted-foreground">
                {includeDividends
                  ? 'Returns include dividend reinvestment'
                  : 'Returns are price-only (no dividends)'}
              </p>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center h-[400px] border rounded-lg bg-muted/10">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p>Loading sector performance data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-[400px] border rounded-lg bg-destructive/10">
              <div className="text-center text-destructive">
                <p className="font-medium">Error loading data</p>
                <p className="text-sm mt-2">{error}</p>
              </div>
            </div>
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center h-[400px] border rounded-lg bg-muted/10">
              <div className="text-center text-muted-foreground">
                <p>No data available for the selected year</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">
                      Sector
                    </TableHead>
                    {allQuarters.map(quarter => (
                      <TableHead key={quarter} className="text-center min-w-[120px]">
                        {quarter}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((sectorData) => (
                    <TableRow key={sectorData.sector}>
                      <TableCell className="sticky left-0 bg-background z-10 font-medium">
                        {sectorData.sector}
                      </TableCell>
                      {allQuarters.map(quarter => {
                        const quarterData = sectorData.quarters.find(q => q.quarter === quarter)
                        return (
                          <TableCell key={quarter} className="text-center">
                            {quarterData ? (
                              <div className="space-y-1">
                                <div className={`font-semibold ${getReturnColor(quarterData.sectorReturn)}`}>
                                  {formatPercent(quarterData.sectorReturn)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  KSE100: {formatPercent(quarterData.kse100Return)}
                                </div>
                                <div className="flex items-center justify-center gap-1">
                                  {quarterData.outperformed ? (
                                    <>
                                      <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                                      <span className="text-xs text-green-600 dark:text-green-400">
                                        +{formatPercent(quarterData.outperformance)}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
                                      <span className="text-xs text-red-600 dark:text-red-400">
                                        {formatPercent(quarterData.outperformance)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">N/A</span>
                            )}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Summary Stats */}
          {!loading && !error && data.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Total Sectors</div>
                <div className="text-2xl font-bold mt-1">{data.length}</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Quarters Analyzed</div>
                <div className="text-2xl font-bold mt-1">{allQuarters.length}</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground">Dividend Adjustment</div>
                <div className="text-2xl font-bold mt-1">
                  {includeDividends ? 'Enabled' : 'Disabled'}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

