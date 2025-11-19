"use client"

import { useState, useEffect } from "react"
import { SharedNavbar } from "@/components/shared-navbar"
import { ValuationScatterChart } from "@/components/screener/valuation-scatter-chart"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, Filter, Plus, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/lib/auth/auth-context"
import { AddAssetDialog, type TrackedAsset } from "@/components/asset-screener/add-asset-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function ScreenerPage() {
  const { user, loading: authLoading } = useAuth()
  const [metrics, setMetrics] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [groupBy, setGroupBy] = useState<'sector' | 'industry'>('sector')
  
  // Filters
  const [minMarketCap, setMinMarketCap] = useState(0) // In Billions
  const [sectorFilter, setSectorFilter] = useState<string>("")
  
  // All stocks with price data (PK equities only)
  interface StockInfo {
    symbol: string
    name: string
    sector: string
    industry: string
  }
  const [allStocks, setAllStocks] = useState<StockInfo[]>([])
  const [loadingStocks, setLoadingStocks] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [addingKSE100, setAddingKSE100] = useState(false)
  const [kse100Error, setKse100Error] = useState<string | null>(null)
  const [kse100Success, setKse100Success] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/screener/metrics')
        if (res.ok) {
            const data = await res.json()
            setMetrics(data.data || [])
        }
      } catch (e) {
        console.error("Failed to load screener metrics", e)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    loadAllStocks()
  }, [])

  const loadAllStocks = async () => {
    try {
      setLoadingStocks(true)
      const response = await fetch('/api/screener/stocks')

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setAllStocks(data.stocks || [])
        }
      }
    } catch (error) {
      console.error('Error loading stocks:', error)
      setAllStocks([])
    } finally {
      setLoadingStocks(false)
    }
  }

  const handleAddStock = async (assetData: Omit<TrackedAsset, 'id' | 'createdAt' | 'updatedAt'>) => {
    // Ensure it's a PK equity
    if (assetData.assetType !== 'pk-equity') {
      throw new Error('Only PK equities can be added to the screener')
    }

    // Check for duplicate symbol (case-insensitive)
    const symbolUpper = assetData.symbol.toUpperCase().trim()
    const existingStock = allStocks.find(
      stock => stock.symbol.toUpperCase() === symbolUpper
    )
    
    if (existingStock) {
      throw new Error(`Stock "${symbolUpper}" already exists in the database`)
    }

    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        throw new Error('Authentication required')
      }

      // Add to user tracked assets (for personal tracking)
      const response = await fetch('/api/user/tracked-assets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(assetData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add stock')
      }

      // Reload all stocks to show the newly added one
      await loadAllStocks()
    } catch (error: any) {
      console.error('Error adding stock:', error)
      throw error
    }
  }

  const handleAddAllKSE100 = async () => {
    try {
      setAddingKSE100(true)
      setKse100Error(null)
      setKse100Success(null)

      const token = localStorage.getItem('auth_token')
      if (!token) {
        throw new Error('Authentication required')
      }

      const response = await fetch('/api/screener/add-kse100-stocks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add KSE100 stocks')
      }

      if (data.success) {
      setKse100Success(
        `Successfully added ${data.added} stocks. ${data.failed > 0 ? `${data.failed} failed.` : ''}`
      )
      // Reload all stocks to show newly added ones
      await loadAllStocks()
      }
    } catch (error: any) {
      console.error('Error adding KSE100 stocks:', error)
      setKse100Error(error.message || 'Failed to add KSE100 stocks')
    } finally {
      setAddingKSE100(false)
    }
  }
  
  const filteredMetrics = metrics.filter(m => {
      const groupName = groupBy === 'industry' ? (m.industry || m.sector) : m.sector
      const matchesGroup = sectorFilter ? groupName?.toLowerCase().includes(sectorFilter.toLowerCase()) : true
      // Assuming market_cap stored in raw rupees. 1 Billion = 1,000,000,000
      const matchesCap = (m.market_cap || 0) >= (minMarketCap * 1_000_000_000)
      return matchesGroup && matchesCap
  })

  return (
    <div className="min-h-screen bg-background">
      <SharedNavbar />
      <main className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Value Hunter Screener</h1>
            <p className="text-muted-foreground">
                Find undervalued companies relative to their sector peers.
            </p>
        </div>

        <Tabs defaultValue="chart" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="chart">Valuation Chart</TabsTrigger>
            <TabsTrigger value="stocks">List of Stocks</TabsTrigger>
          </TabsList>

          <TabsContent value="chart" className="space-y-6">
            {/* Filter Controls */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col gap-6">
                        <div className="flex items-center gap-4">
                            <Label>Group By:</Label>
                            <ToggleGroup type="single" value={groupBy} onValueChange={(value) => value && setGroupBy(value as 'sector' | 'industry')}>
                                <ToggleGroupItem value="sector" aria-label="Sector">
                                    Sector
                                </ToggleGroupItem>
                                <ToggleGroupItem value="industry" aria-label="Industry">
                                    Industry
                                </ToggleGroupItem>
                            </ToggleGroup>
                        </div>
                        
                        <div className="flex flex-wrap gap-6 items-end">
                            <div className="space-y-2 w-full md:w-64">
                                <Label className="flex items-center gap-2">
                                    <Filter className="h-4 w-4" />
                                    Filter by {groupBy === 'industry' ? 'Industry' : 'Sector'}
                                </Label>
                                <Input 
                                    placeholder={groupBy === 'industry' ? "e.g. Oil & Gas, Banking..." : "e.g. Cement, Bank..."} 
                                    value={sectorFilter}
                                    onChange={(e) => setSectorFilter(e.target.value)}
                                />
                            </div>
                            
                            <div className="space-y-4 w-full md:w-64">
                                <Label>Min Market Cap: {minMarketCap} Billion PKR</Label>
                                <Slider 
                                    min={0} 
                                    max={100} 
                                    step={1} 
                                    value={[minMarketCap]} 
                                    onValueChange={(v) => setMinMarketCap(v[0])} 
                                />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {loading ? (
              <div className="flex justify-center py-20">
                 <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid gap-6">
                 <ValuationScatterChart data={filteredMetrics} groupBy={groupBy} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="stocks" className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold">All PK Equities</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  All stocks with price data in the database ({allStocks.length} stocks)
                </p>
              </div>
              {user && (
                <div className="flex gap-2">
                  <Button 
                    variant="outline"
                    onClick={handleAddAllKSE100}
                    disabled={addingKSE100}
                  >
                    {addingKSE100 ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Add All KSE100 Stocks
                      </>
                    )}
                  </Button>
                  <Button onClick={() => setIsAddDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Stock
                  </Button>
                </div>
              )}
            </div>

            {kse100Error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{kse100Error}</AlertDescription>
              </Alert>
            )}
            {kse100Success && (
              <Alert>
                <AlertDescription>{kse100Success}</AlertDescription>
              </Alert>
            )}

            {loadingStocks ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : allStocks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground mb-4">
                    No stocks with price data found. Add stocks to get started.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {allStocks.map((stock) => (
                  <Card key={stock.symbol} className="overflow-hidden hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <CardTitle className="text-lg">{stock.name}</CardTitle>
                            <Badge variant="outline">PK Equity</Badge>
                          </div>
                          <CardDescription className="flex items-center gap-2">
                            <span className="font-mono">{stock.symbol}</span>
                            <span className="text-muted-foreground">•</span>
                            <span>{stock.sector}</span>
                            {stock.industry && stock.industry !== 'Unknown' && (
                              <>
                                <span className="text-muted-foreground">•</span>
                                <span>{stock.industry}</span>
                              </>
                            )}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {user && (
          <AddAssetDialog
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            onSave={handleAddStock}
            defaultAssetType="pk-equity"
            restrictToAssetType="pk-equity"
          />
        )}
      </main>
    </div>
  )
}

