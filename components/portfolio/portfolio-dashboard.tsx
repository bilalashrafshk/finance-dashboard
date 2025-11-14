"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, RefreshCw, Loader2, DollarSign } from "lucide-react"
import { AddHoldingDialog } from "./add-holding-dialog"
import { PortfolioSummary } from "./portfolio-summary"
import { HoldingsTable } from "./holdings-table"
import { AllocationChart } from "./allocation-chart"
import { PerformanceChart } from "./performance-chart"
import { PKEquityPortfolioChart } from "./pk-equity-portfolio-chart"
import { CryptoPortfolioChart } from "./crypto-portfolio-chart"
import { USEquityPortfolioChart } from "./us-equity-portfolio-chart"
import { MetalsPortfolioChart } from "./metals-portfolio-chart"
import { PortfolioUpdateSection } from "./portfolio-update-section"
import type { Holding } from "@/lib/portfolio/types"
import { loadPortfolio, addHolding, updateHolding, deleteHolding } from "@/lib/portfolio/portfolio-storage"
import { 
  calculatePortfolioSummary, 
  calculateAssetAllocation,
  groupHoldingsByCurrency,
  calculateUnifiedPortfolioSummary,
  calculateUnifiedAssetAllocation
} from "@/lib/portfolio/portfolio-utils"
import { parseSymbolToBinance } from "@/lib/portfolio/binance-api"

export function PortfolioDashboard() {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null)
  const [refreshingPrices, setRefreshingPrices] = useState(false)
  const [exchangeRates, setExchangeRates] = useState<Map<string, number>>(new Map())
  const [viewMode, setViewMode] = useState<'unified' | 'segregated'>('segregated')

  useEffect(() => {
    loadHoldings()
  }, [])

  const loadHoldings = () => {
    const portfolio = loadPortfolio()
    setHoldings(portfolio.holdings)
  }

  const handleAddHolding = (holdingData: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editingHolding) {
      updateHolding(editingHolding.id, holdingData)
    } else {
      addHolding(holdingData)
    }
    loadHoldings()
    setEditingHolding(null)
  }

  const handleEditHolding = (holding: Holding) => {
    setEditingHolding(holding)
    setIsAddDialogOpen(true)
  }

  const handleDeleteHolding = (id: string) => {
    deleteHolding(id)
    loadHoldings()
  }

  const handleOpenAddDialog = () => {
    setEditingHolding(null)
    setIsAddDialogOpen(true)
  }

  const handleRefreshPrices = async () => {
    const cryptoHoldings = holdings.filter((h) => h.assetType === 'crypto')
    const pkEquityHoldings = holdings.filter((h) => h.assetType === 'pk-equity')
    const usEquityHoldings = holdings.filter((h) => h.assetType === 'us-equity')
    const metalsHoldings = holdings.filter((h) => h.assetType === 'metals')
    
    if (cryptoHoldings.length === 0 && pkEquityHoldings.length === 0 && usEquityHoldings.length === 0 && metalsHoldings.length === 0) return

    try {
      setRefreshingPrices(true)
      let updatedCount = 0

      // Refresh crypto prices
      for (const holding of cryptoHoldings) {
        try {
          const binanceSymbol = parseSymbolToBinance(holding.symbol)
          const { fetchCryptoPrice } = await import('@/lib/portfolio/unified-price-api')
          const data = await fetchCryptoPrice(binanceSymbol)
          
          if (data && data.price !== null && data.price !== holding.currentPrice) {
            updateHolding(holding.id, { currentPrice: data.price })
            updatedCount++
          }
        } catch (error) {
          console.error(`Error updating price for ${holding.symbol}:`, error)
        }
      }

      // Refresh PK equity prices
      for (const holding of pkEquityHoldings) {
        try {
          const { fetchPKEquityPrice } = await import('@/lib/portfolio/unified-price-api')
          const data = await fetchPKEquityPrice(holding.symbol)
          
          if (data && data.price !== null && data.price !== holding.currentPrice) {
            updateHolding(holding.id, { currentPrice: data.price })
            updatedCount++
            
              }
        } catch (error) {
          console.error(`Error updating price for ${holding.symbol}:`, error)
        }
      }

      // Refresh US equity prices
      for (const holding of usEquityHoldings) {
        try {
          const { fetchUSEquityPrice } = await import('@/lib/portfolio/unified-price-api')
          const data = await fetchUSEquityPrice(holding.symbol)
          
          if (data && data.price !== null && data.price !== holding.currentPrice) {
            updateHolding(holding.id, { currentPrice: data.price })
            updatedCount++
            
              }
        } catch (error) {
          console.error(`Error updating price for ${holding.symbol}:`, error)
        }
      }

      // Refresh metals prices
      for (const holding of metalsHoldings) {
        try {
          const { fetchMetalsPrice } = await import('@/lib/portfolio/unified-price-api')
          const data = await fetchMetalsPrice(holding.symbol)
          
          if (data && data.price !== null && data.price !== holding.currentPrice) {
            updateHolding(holding.id, { currentPrice: data.price })
            updatedCount++
          }
        } catch (error) {
          console.error(`Error updating price for ${holding.symbol}:`, error)
        }
      }

      if (updatedCount > 0) {
        loadHoldings()
      }
    } catch (error) {
      console.error('Error refreshing prices:', error)
    } finally {
      setRefreshingPrices(false)
    }
  }

  // Group holdings by currency
  const holdingsByCurrency = groupHoldingsByCurrency(holdings)
  const currencies = Array.from(holdingsByCurrency.keys()).sort()
  
  // Get unique currencies that need exchange rates (excluding USD)
  const currenciesNeedingRates = currencies.filter(c => c !== 'USD')
  
  // Calculate summaries for each currency
  const summariesByCurrency = new Map<string, ReturnType<typeof calculatePortfolioSummary>>()
  currencies.forEach((currency) => {
    const currencyHoldings = holdingsByCurrency.get(currency) || []
    summariesByCurrency.set(currency, calculatePortfolioSummary(currencyHoldings))
  })
  
  // Check if all required exchange rates are available
  const allExchangeRatesAvailable = currenciesNeedingRates.length === 0 || 
    currenciesNeedingRates.every(c => exchangeRates.has(c))
  
  // Calculate unified USD summary
  // Only show unified view if all exchange rates are provided (or if no non-USD currencies exist)
  const unifiedSummary = viewMode === 'unified' && allExchangeRatesAvailable
    ? calculateUnifiedPortfolioSummary(holdings, exchangeRates)
    : null
  
  const allocation = calculateAssetAllocation(holdings)
  const hasAutoPriceHoldings = holdings.some(
    (h) => h.assetType === 'crypto' || h.assetType === 'pk-equity' || h.assetType === 'us-equity' || h.assetType === 'metals'
  )

  const handleExchangeRateChange = (currency: string, rate: string) => {
    const rateValue = parseFloat(rate) || 0
    const newRates = new Map(exchangeRates)
    if (rateValue > 0) {
      newRates.set(currency, rateValue)
    } else {
      newRates.delete(currency)
    }
    setExchangeRates(newRates)
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Portfolio Tracker</h1>
          <p className="text-muted-foreground">
            Track and manage all your investments in one place
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleOpenAddDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Holding
          </Button>
        </div>
      </div>

      {/* Portfolio Update Section - Show all holdings together */}
      {holdings.length > 0 && (
        <PortfolioUpdateSection holdings={holdings} onUpdate={loadHoldings} />
      )}

      {/* View Mode Toggle */}
      {currencies.length > 1 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Portfolio View Mode</Label>
                <p className="text-sm text-muted-foreground">
                  {viewMode === 'unified' 
                    ? 'View all holdings combined in USD' 
                    : 'View holdings separated by currency'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant={viewMode === 'segregated' ? 'default' : 'outline'}
                  onClick={() => setViewMode('segregated')}
                >
                  Segregated
                </Button>
                <Button
                  variant={viewMode === 'unified' ? 'default' : 'outline'}
                  onClick={() => setViewMode('unified')}
                >
                  Unified (USD)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Exchange Rate Input Section - Show when unified view is selected */}
      {viewMode === 'unified' && currenciesNeedingRates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Exchange Rates (for Unified USD View)
            </CardTitle>
            <CardDescription>
              Enter exchange rates to convert all holdings to USD. Rates should be: 1 USD = ? {currenciesNeedingRates.join('/1 USD = ? ')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {currenciesNeedingRates.map((currency) => (
                <div key={currency} className="space-y-2">
                  <Label htmlFor={`rate-${currency}`}>
                    1 USD = {currency}
                  </Label>
                  <Input
                    id={`rate-${currency}`}
                    type="number"
                    step="0.0001"
                    placeholder="0.00"
                    value={exchangeRates.get(currency)?.toString() || ''}
                    onChange={(e) => handleExchangeRateChange(currency, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unified USD View */}
      {viewMode === 'unified' && (
        <>
          {!allExchangeRatesAvailable && (
            <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
              <CardContent className="pt-6">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  ⚠️ Please enter all required exchange rates above to view the unified portfolio in USD. Charts and summary will be shown once all rates are provided.
                </p>
              </CardContent>
            </Card>
          )}
          
          {unifiedSummary && (
            <>
              <Card className="border-2 border-primary">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    Unified Portfolio (USD)
                  </CardTitle>
                  <CardDescription>
                    Combined view of all holdings converted to USD
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PortfolioSummary summary={unifiedSummary} currency="USD" />
                </CardContent>
              </Card>

              <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="holdings">Holdings</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <AllocationChart allocation={calculateUnifiedAssetAllocation(holdings, exchangeRates)} holdings={holdings} currency="USD" />
                    <PerformanceChart allocation={calculateUnifiedAssetAllocation(holdings, exchangeRates)} currency="USD" />
                  </div>
                  {/* US Equities Portfolio Chart */}
                  {(() => {
                    const usEquityHoldings = holdings.filter(h => h.assetType === 'us-equity')
                    return usEquityHoldings.length > 0 ? (
                      <USEquityPortfolioChart 
                        holdings={usEquityHoldings} 
                        currency="USD"
                      />
                    ) : null
                  })()}
                  {/* PK Equities Portfolio Chart */}
                  {(() => {
                    const pkEquityHoldings = holdings.filter(h => h.assetType === 'pk-equity')
                    return pkEquityHoldings.length > 0 ? (
                      <PKEquityPortfolioChart 
                        holdings={pkEquityHoldings} 
                        currency="USD"
                      />
                    ) : null
                  })()}
                  {/* Crypto Portfolio Chart */}
                  {(() => {
                    const cryptoHoldings = holdings.filter(h => h.assetType === 'crypto')
                    return cryptoHoldings.length > 0 ? (
                      <CryptoPortfolioChart 
                        holdings={cryptoHoldings} 
                        currency="USD"
                      />
                    ) : null
                  })()}
                  {/* Metals Portfolio Chart */}
                  {(() => {
                    const metalsHoldings = holdings.filter(h => h.assetType === 'metals')
                    return metalsHoldings.length > 0 ? (
                      <MetalsPortfolioChart 
                        holdings={metalsHoldings} 
                        currency="USD"
                      />
                    ) : null
                  })()}
                </TabsContent>

                <TabsContent value="holdings" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>All Holdings (USD)</CardTitle>
                      <CardDescription>
                        Manage and track all your investment positions
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <HoldingsTable
                        holdings={holdings}
                        onEdit={handleEditHolding}
                        onDelete={handleDeleteHolding}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </>
      )}

      {/* Separate Portfolio Views by Currency */}
      {viewMode === 'segregated' && currencies.map((currency) => {
        const currencyHoldings = holdingsByCurrency.get(currency) || []
        const summary = summariesByCurrency.get(currency)!
        
        return (
          <div key={currency} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{currency} Portfolio</CardTitle>
                <CardDescription>
                  {currencyHoldings.length} {currencyHoldings.length === 1 ? 'holding' : 'holdings'} in {currency}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PortfolioSummary summary={summary} currency={currency} />
              </CardContent>
            </Card>

            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="holdings">Holdings</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <AllocationChart allocation={calculateAssetAllocation(currencyHoldings)} holdings={currencyHoldings} currency={currency} />
                  <PerformanceChart allocation={calculateAssetAllocation(currencyHoldings)} currency={currency} />
                </div>
                {/* PK Equities Portfolio Chart - only show for PKR currency with actual PK equity holdings */}
                {currency === 'PKR' && (() => {
                  const pkEquityHoldings = currencyHoldings.filter(h => h.assetType === 'pk-equity')
                  return pkEquityHoldings.length > 0 ? (
                    <PKEquityPortfolioChart 
                      holdings={pkEquityHoldings} 
                      currency={currency}
                    />
                  ) : null
                })()}
                {/* US Equities Portfolio Chart - show for USD currency with actual US equity holdings */}
                {currency === 'USD' && (() => {
                  const usEquityHoldings = currencyHoldings.filter(h => h.assetType === 'us-equity')
                  return usEquityHoldings.length > 0 ? (
                    <USEquityPortfolioChart 
                      holdings={usEquityHoldings} 
                      currency={currency}
                    />
                  ) : null
                })()}
                {/* Crypto Portfolio Chart - show for any currency with crypto holdings */}
                {(() => {
                  const cryptoHoldings = currencyHoldings.filter(h => h.assetType === 'crypto')
                  return cryptoHoldings.length > 0 ? (
                    <CryptoPortfolioChart 
                      holdings={cryptoHoldings} 
                      currency={currency}
                    />
                  ) : null
                })()}
                {/* Metals Portfolio Chart - show for USD currency with metals holdings */}
                {currency === 'USD' && (() => {
                  const metalsHoldings = currencyHoldings.filter(h => h.assetType === 'metals')
                  return metalsHoldings.length > 0 ? (
                    <MetalsPortfolioChart 
                      holdings={metalsHoldings} 
                      currency={currency}
                    />
                  ) : null
                })()}
              </TabsContent>

              <TabsContent value="holdings" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{currency} Holdings</CardTitle>
                    <CardDescription>
                      Manage and track all your {currency} investment positions
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <HoldingsTable
                      holdings={currencyHoldings}
                      onEdit={handleEditHolding}
                      onDelete={handleDeleteHolding}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )
      })}

      <AddHoldingDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSave={handleAddHolding}
        editingHolding={editingHolding}
      />
    </div>
  )
}

