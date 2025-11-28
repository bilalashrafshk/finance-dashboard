"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Plus, RefreshCw, Loader2, DollarSign, ChevronDown, ChevronRight } from "lucide-react"
import { AddCashDialog } from "./add-cash-dialog"
import { AddFDDialog } from "./add-fd-dialog"
import { AddCommodityDialog } from "./add-commodity-dialog"
import { AssetTypeSelectorDialog } from "./asset-type-selector-dialog"
import { PortfolioSummary } from "./portfolio-summary"
import { AllocationChart } from "./allocation-chart"
import { PortfolioHistoryChart } from "./portfolio-history-chart"
import { PnLBreakdown } from "./pnl-breakdown"
import { LazyChartWrapper } from "./lazy-chart-wrapper"
import dynamic from "next/dynamic"

// Lazy load heavy chart components
const PKEquityPortfolioChart = dynamic(() => import("./pk-equity-portfolio-chart").then(mod => ({ default: mod.PKEquityPortfolioChart })), {
  ssr: false,
})

const CryptoPortfolioChart = dynamic(() => import("./crypto-portfolio-chart").then(mod => ({ default: mod.CryptoPortfolioChart })), {
  ssr: false,
})

const USEquityPortfolioChart = dynamic(() => import("./us-equity-portfolio-chart").then(mod => ({ default: mod.USEquityPortfolioChart })), {
  ssr: false,
})

const MetalsPortfolioChart = dynamic(() => import("./metals-portfolio-chart").then(mod => ({ default: mod.MetalsPortfolioChart })), {
  ssr: false,
})
import { PortfolioUpdateSection } from "./portfolio-update-section"
import { MyDividends } from "./my-dividends"
import type { Holding, AssetType } from "@/lib/portfolio/types"
import { loadPortfolio, addHolding, updateHolding, deleteHolding, sellHolding } from "@/lib/portfolio/portfolio-db-storage"
import {
  calculatePortfolioSummary,
  calculatePortfolioSummaryWithDividends,
  calculateAssetAllocation,
  groupHoldingsByCurrency,
  calculateUnifiedPortfolioSummary,
  calculateUnifiedAssetAllocation,
  formatCurrency
} from "@/lib/portfolio/portfolio-utils"
import { parseSymbolToBinance } from "@/lib/portfolio/binance-api"
import { useAuth } from "@/lib/auth/auth-context"
import { LoginDialog } from "@/components/auth/login-dialog"
import { RegisterDialog } from "@/components/auth/register-dialog"

export function PortfolioDashboard() {
  const { user, loading: authLoading } = useAuth()
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isAssetTypeSelectorOpen, setIsAssetTypeSelectorOpen] = useState(false)
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | null>(null)
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null)
  const [refreshingPrices, setRefreshingPrices] = useState(false)
  const [exchangeRates, setExchangeRates] = useState<Map<string, number>>(new Map())
  const [viewMode, setViewMode] = useState<'unified' | 'segregated'>('segregated')
  const [summariesByCurrency, setSummariesByCurrency] = useState<Map<string, ReturnType<typeof calculatePortfolioSummary>>>(new Map())
  const [unifiedSummary, setUnifiedSummary] = useState<ReturnType<typeof calculateUnifiedPortfolioSummary> | null>(null)
  const [dividendsOpen, setDividendsOpen] = useState<{ [key: string]: boolean }>({})

  useEffect(() => {
    if (!authLoading && user) {
      // Fast load first (instant render from DB)
      loadHoldings(true).then(() => {
        // Defer price refresh by 1.5 seconds to allow initial render
        setTimeout(() => {
          handleRefreshPrices()
        }, 1500)
      })
    }
  }, [authLoading, user])

  const loadHoldings = async (fast: boolean = false) => {
    try {
      // Use cache-busting to ensure fresh data after transactions
      const portfolio = await loadPortfolio(fast)
      setHoldings(portfolio.holdings)
    } catch (error) {
      console.error('Error loading holdings:', error)
      // Fallback to empty portfolio if not authenticated
      setHoldings([])
    }
  }

  const handleAddHolding = async (holdingData: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'> & { autoDeposit?: boolean }) => {
    const autoDeposit = holdingData.autoDeposit || false
    try {
      if (editingHolding) {
        await updateHolding(editingHolding.id, holdingData)
      } else {
        try {
          await addHolding({ ...holdingData, autoDeposit })
        } catch (error: any) {
          // Check if it's a cash balance error
          if (error.details?.error === 'Insufficient cash balance' && !autoDeposit) {
            const shortfall = error.details.shortfall
            const cashBalance = error.details.cashBalance
            const required = error.details.required
            const currency = error.details.currency

            // Show confirmation dialog for auto-deposit
            const confirmed = window.confirm(
              `Insufficient cash balance!\n\n` +
              `Available: ${formatCurrency(cashBalance, currency)}\n` +
              `Required: ${formatCurrency(required, currency)}\n` +
              `Shortfall: ${formatCurrency(shortfall, currency)}\n\n` +
              `Would you like to auto-deposit ${formatCurrency(shortfall, currency)} to complete this purchase?`
            )

            if (confirmed) {
              // Retry with auto-deposit
              return handleAddHolding({ ...holdingData, autoDeposit: true })
            } else {
              throw error
            }
          }
          throw error
        }

        // Auto-add to asset screener if it's a supported asset type
        const supportedTypes: AssetType[] = ['us-equity', 'pk-equity', 'crypto', 'metals', 'kse100', 'spx500']
        if (supportedTypes.includes(holdingData.assetType)) {
          try {
            const token = localStorage.getItem('auth_token')
            if (token) {
              // Check if asset already exists in screener
              const checkResponse = await fetch('/api/user/tracked-assets', {
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              })

              if (checkResponse.ok) {
                const checkData = await checkResponse.json()
                if (checkData.success) {
                  const existingAsset = checkData.assets.find(
                    (a: any) => a.assetType === holdingData.assetType && a.symbol === holdingData.symbol
                  )

                  // Only add if it doesn't already exist
                  if (!existingAsset) {
                    await fetch('/api/user/tracked-assets', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                      },
                      body: JSON.stringify({
                        assetType: holdingData.assetType,
                        symbol: holdingData.symbol,
                        name: holdingData.name,
                        currency: holdingData.currency,
                        notes: holdingData.notes,
                      }),
                    })
                  }
                }
              }
            }
          } catch (screenerError) {
            // Silently fail - don't block portfolio addition if screener add fails
            console.warn('Failed to auto-add to asset screener:', screenerError)
          }
        }
      }
      await loadHoldings()
      setEditingHolding(null)
    } catch (error: any) {
      console.error('Error saving holding:', error)
      throw error // Re-throw to let the dialog handle it
    }
  }


  const handleDeleteHolding = async (id: string) => {
    try {
      await deleteHolding(id)
      await loadHoldings()
    } catch (error) {
      console.error('Error deleting holding:', error)
    }
  }

  const handleSellHolding = async (holding: Holding, quantity: number, price: number, date: string, fees?: number, notes?: string) => {
    try {
      const result = await sellHolding(holding.id, quantity, price, date, fees, notes)
      await loadHoldings()
      // Show success message (could use toast here)
      console.log(result.message)
      return result
    } catch (error: any) {
      console.error('Error selling holding:', error)
      throw error
    }
  }

  const handleOpenAddDialog = () => {
    setEditingHolding(null)
    setSelectedAssetType(null)
    setIsAssetTypeSelectorOpen(true)
  }

  const handleAssetTypeSelect = (assetType: AssetType) => {
    setSelectedAssetType(assetType)
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

      // Import APIs dynamically but in parallel if possible, or just upfront
      const { fetchCryptoPrice, fetchPKEquityPrice, fetchUSEquityPrice, fetchMetalsPrice } = await import('@/lib/portfolio/unified-price-api')

      const updates: Promise<any>[] = []
      const priceUpdates: { id: string, price: number }[] = []

      // Create fetch promises for all assets
      const cryptoPromises = cryptoHoldings.map(async (holding) => {
        try {
          const binanceSymbol = parseSymbolToBinance(holding.symbol)
          const data = await fetchCryptoPrice(binanceSymbol)
          if (data && data.price !== null && data.price !== holding.currentPrice) {
            return { id: holding.id, price: data.price }
          }
        } catch (e) {
          console.error(`Error fetching crypto price for ${holding.symbol}`, e)
        }
        return null
      })

      const pkEquityPromises = pkEquityHoldings.map(async (holding) => {
        try {
          const data = await fetchPKEquityPrice(holding.symbol)
          if (data && data.price !== null && data.price !== holding.currentPrice) {
            return { id: holding.id, price: data.price }
          }
        } catch (e) {
          console.error(`Error fetching PK equity price for ${holding.symbol}`, e)
        }
        return null
      })

      const usEquityPromises = usEquityHoldings.map(async (holding) => {
        try {
          const data = await fetchUSEquityPrice(holding.symbol)
          if (data && data.price !== null && data.price !== holding.currentPrice) {
            return { id: holding.id, price: data.price }
          }
        } catch (e) {
          console.error(`Error fetching US equity price for ${holding.symbol}`, e)
        }
        return null
      })

      const metalsPromises = metalsHoldings.map(async (holding) => {
        try {
          const data = await fetchMetalsPrice(holding.symbol)
          if (data && data.price !== null && data.price !== holding.currentPrice) {
            return { id: holding.id, price: data.price }
          }
        } catch (e) {
          console.error(`Error fetching metals price for ${holding.symbol}`, e)
        }
        return null
      })

      // Execute all fetches in parallel
      const allResults = await Promise.all([
        ...cryptoPromises,
        ...pkEquityPromises,
        ...usEquityPromises,
        ...metalsPromises
      ])

      // Filter out nulls and collect updates
      allResults.forEach(result => {
        if (result) {
          priceUpdates.push(result)
        }
      })

      // Perform DB updates in parallel
      if (priceUpdates.length > 0) {
        await Promise.all(priceUpdates.map(update => updateHolding(update.id, { currentPrice: update.price })))
        await loadHoldings()
      }

    } catch (error) {
      console.error('Error refreshing prices:', error)
    } finally {
      setRefreshingPrices(false)
    }
  }

  // Group holdings by currency (memoized to avoid recreation on every render)
  const holdingsByCurrency = useMemo(() => groupHoldingsByCurrency(holdings), [holdings])
  const currencies = useMemo(() => Array.from(holdingsByCurrency.keys()).sort(), [holdingsByCurrency])

  // Get unique currencies that need exchange rates (excluding USD)
  const currenciesNeedingRates = useMemo(() => currencies.filter(c => c !== 'USD'), [currencies])

  // Convert exchangeRates Map to a stable string for dependency checking
  const exchangeRatesKey = useMemo(() => {
    return Array.from(exchangeRates.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, rate]) => `${currency}:${rate}`)
      .join(',')
  }, [exchangeRates])

  // Check if all required exchange rates are available
  const allExchangeRatesAvailable = useMemo(() => {
    return currenciesNeedingRates.length === 0 ||
      currenciesNeedingRates.every(c => exchangeRates.has(c))
  }, [currenciesNeedingRates, exchangeRatesKey, exchangeRates])

  // Calculate summaries - defer heavy calculations (dividends/realized PnL) until after initial render
  useEffect(() => {
    const calculateSummaries = async () => {
      // Recalculate inside useEffect to avoid dependency issues
      const currentHoldingsByCurrency = groupHoldingsByCurrency(holdings)
      const currentCurrencies = Array.from(currentHoldingsByCurrency.keys()).sort()

      // First, calculate basic summaries without dividends/realized PnL for fast initial render
      const basicSummaryPromises = currentCurrencies.map(async (currency) => {
        const currencyHoldings = currentHoldingsByCurrency.get(currency) || []
        const summary = calculatePortfolioSummary(currencyHoldings)
        return { currency, summary }
      })

      const basicSummaries = await Promise.all(basicSummaryPromises)
      const newSummaries = new Map<string, ReturnType<typeof calculatePortfolioSummary>>()
      basicSummaries.forEach(({ currency, summary }) => {
        newSummaries.set(currency, summary)
      })
      setSummariesByCurrency(newSummaries)

      // Defer heavy calculations (dividends/realized PnL) by 500ms to allow initial render
      setTimeout(async () => {
        // Calculate summaries with dividends in parallel
        const summaryPromises = currentCurrencies.map(async (currency) => {
          const currencyHoldings = currentHoldingsByCurrency.get(currency) || []
          const summary = await calculatePortfolioSummaryWithDividends(currencyHoldings)
          return { currency, summary }
        })

        const summaries = await Promise.all(summaryPromises)

        const updatedSummaries = new Map<string, ReturnType<typeof calculatePortfolioSummary>>()
        summaries.forEach(({ currency, summary }) => {
          updatedSummaries.set(currency, summary)
        })
        setSummariesByCurrency(updatedSummaries)

        // Calculate unified USD summary with dividends and realized PnL
        if (viewMode === 'unified' && allExchangeRatesAvailable) {
          try {
            const { calculateUnifiedPortfolioSummaryWithRealizedPnL } = await import('@/lib/portfolio/portfolio-utils')
            const unified = await calculateUnifiedPortfolioSummaryWithRealizedPnL(holdings, exchangeRates)
            // Add dividends to unified summary
            const pkEquityHoldings = holdings.filter(h => h.assetType === 'pk-equity')
            if (pkEquityHoldings.length > 0) {
              const { calculateTotalDividendsCollected } = await import('@/lib/portfolio/portfolio-utils')
              const dividendsCollected = await calculateTotalDividendsCollected(holdings)
              unified.dividendsCollected = dividendsCollected
              unified.dividendsCollectedPercent = unified.totalInvested > 0 ? (dividendsCollected / unified.totalInvested) * 100 : 0
            }
            setUnifiedSummary(unified)
          } catch (error) {
            console.error('Error calculating unified summary:', error)
            // Fallback to basic unified summary without realized PnL
            const { calculateUnifiedPortfolioSummary } = await import('@/lib/portfolio/portfolio-utils')
            setUnifiedSummary(calculateUnifiedPortfolioSummary(holdings, exchangeRates))
          }
        } else {
          setUnifiedSummary(null)
        }
      }, 500)
    }

    if (holdings.length > 0) {
      calculateSummaries()
    } else {
      setSummariesByCurrency(new Map())
      setUnifiedSummary(null)
    }
  }, [holdings, exchangeRatesKey, viewMode, allExchangeRatesAvailable])

  // Memoize allocation calculation
  const allocation = useMemo(() => calculateAssetAllocation(holdings), [holdings])
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

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show login prompt if not authenticated
  if (!user) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Tracker</CardTitle>
            <CardDescription>
              Please login or create an account to track your portfolio
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your portfolio holdings and trades are stored securely and synced across all your devices.
            </p>
            <div className="flex gap-2">
              <LoginDialog>
                <Button>Login</Button>
              </LoginDialog>
              <RegisterDialog>
                <Button variant="outline">Create Account</Button>
              </RegisterDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    )
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
        {/* Add Holding button removed - use Transactions tab to add transactions */}
      </div>

      {/* Portfolio Update Section - Always show to allow adding transactions */}
      <PortfolioUpdateSection
        holdings={holdings}
        onUpdate={loadHoldings}
      />

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
                  <PortfolioSummary summary={unifiedSummary} currency="USD" showDividends={true} />
                </CardContent>
              </Card>

              {/* My Dividends Section - Collapsible */}
              {(() => {
                const pkEquityHoldings = holdings.filter(h => h.assetType === 'pk-equity')
                const key = 'unified'
                const totalDividends = unifiedSummary?.dividendsCollected || 0
                return pkEquityHoldings.length > 0 ? (
                  <Collapsible open={dividendsOpen[key]} onOpenChange={(open) => setDividendsOpen(prev => ({ ...prev, [key]: open }))}>
                    <CollapsibleTrigger asChild>
                      <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0">
                          <div className="flex items-center gap-2">
                            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${dividendsOpen[key] ? 'rotate-90' : ''}`} />
                            <div className="flex flex-col">
                              <CardTitle>My Dividends</CardTitle>
                              {totalDividends > 0 && (
                                <CardDescription className="text-xs mt-0.5">
                                  Total: {formatCurrency(totalDividends, 'USD')}
                                </CardDescription>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                      </Card>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <MyDividends holdings={holdings} currency="USD" hideCard={true} />
                    </CollapsibleContent>
                  </Collapsible>
                ) : null
              })()}

              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <AllocationChart allocation={calculateUnifiedAssetAllocation(holdings, exchangeRates)} holdings={holdings} currency="USD" />
                  <PortfolioHistoryChart currency="USD" />
                </div>
                <PnLBreakdown holdings={holdings} currency="USD" />
                {/* US Equities Portfolio Chart - Lazy loaded */}
                {(() => {
                  const usEquityHoldings = holdings.filter(h => h.assetType === 'us-equity')
                  return usEquityHoldings.length > 0 ? (
                    <LazyChartWrapper pieChart title="US Equities Holdings Breakdown">
                      <USEquityPortfolioChart
                        holdings={usEquityHoldings}
                        currency="USD"
                      />
                    </LazyChartWrapper>
                  ) : null
                })()}
                {/* PK Equities Portfolio Chart - Lazy loaded */}
                {(() => {
                  const pkEquityHoldings = holdings.filter(h => h.assetType === 'pk-equity')
                  return pkEquityHoldings.length > 0 ? (
                    <LazyChartWrapper pieChart title="PK Equities Holdings Breakdown">
                      <PKEquityPortfolioChart
                        holdings={pkEquityHoldings}
                        currency="USD"
                      />
                    </LazyChartWrapper>
                  ) : null
                })()}
                {/* Crypto Portfolio Chart - Lazy loaded */}
                {(() => {
                  const cryptoHoldings = holdings.filter(h => h.assetType === 'crypto')
                  return cryptoHoldings.length > 0 ? (
                    <LazyChartWrapper pieChart title="Crypto Holdings Breakdown">
                      <CryptoPortfolioChart
                        holdings={cryptoHoldings}
                        currency="USD"
                      />
                    </LazyChartWrapper>
                  ) : null
                })()}
                {/* Metals Portfolio Chart - Lazy loaded */}
                {(() => {
                  const metalsHoldings = holdings.filter(h => h.assetType === 'metals')
                  return metalsHoldings.length > 0 ? (
                    <LazyChartWrapper pieChart title="Metals Holdings Breakdown">
                      <MetalsPortfolioChart
                        holdings={metalsHoldings}
                        currency="USD"
                      />
                    </LazyChartWrapper>
                  ) : null
                })()}
              </div>
            </>
          )}
        </>
      )}

      {/* Separate Portfolio Views by Currency */}
      {viewMode === 'segregated' && currencies.map((currency) => {
        const currencyHoldings = holdingsByCurrency.get(currency) || []
        const summary = summariesByCurrency.get(currency)

        // Skip rendering if summary is not yet calculated
        if (!summary) {
          return null
        }

        return (
          <div key={currency} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{currency} Portfolio</CardTitle>
                <CardDescription>
                  {summary.holdingsCount} {summary.holdingsCount === 1 ? 'holding' : 'holdings'} in {currency}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PortfolioSummary summary={summary} currency={currency} showDividends={true} />
              </CardContent>
            </Card>

            {/* My Dividends Section - Collapsible, only show for PKR currency with PK equity holdings */}
            {currency === 'PKR' && (() => {
              const pkEquityHoldings = currencyHoldings.filter(h => h.assetType === 'pk-equity')
              const key = `pkr-${currency}`
              const summary = summariesByCurrency.get(currency)
              const totalDividends = summary?.dividendsCollected || 0
              return pkEquityHoldings.length > 0 ? (
                <Collapsible open={dividendsOpen[key]} onOpenChange={(open) => setDividendsOpen(prev => ({ ...prev, [key]: open }))}>
                  <CollapsibleTrigger asChild>
                    <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <div className="flex items-center gap-2">
                          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${dividendsOpen[key] ? 'rotate-90' : ''}`} />
                          <div className="flex flex-col">
                            <CardTitle>My Dividends</CardTitle>
                            {totalDividends > 0 && (
                              <CardDescription className="text-xs mt-0.5">
                                Total: {formatCurrency(totalDividends, currency)}
                              </CardDescription>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <MyDividends holdings={currencyHoldings} currency={currency} hideCard={true} />
                  </CollapsibleContent>
                </Collapsible>
              ) : null
            })()}

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <AllocationChart allocation={calculateAssetAllocation(currencyHoldings)} holdings={currencyHoldings} currency={currency} />
                <PortfolioHistoryChart currency={currency} />
              </div>
              <PnLBreakdown holdings={currencyHoldings} currency={currency} />
              {/* PK Equities Portfolio Chart - only show for PKR currency with actual PK equity holdings - Lazy loaded */}
              {currency === 'PKR' && (() => {
                const pkEquityHoldings = currencyHoldings.filter(h => h.assetType === 'pk-equity')
                return pkEquityHoldings.length > 0 ? (
                  <LazyChartWrapper pieChart title="PK Equities Holdings Breakdown">
                    <PKEquityPortfolioChart
                      holdings={pkEquityHoldings}
                      currency={currency}
                    />
                  </LazyChartWrapper>
                ) : null
              })()}
              {/* US Equities Portfolio Chart - show for USD currency with actual US equity holdings - Lazy loaded */}
              {currency === 'USD' && (() => {
                const usEquityHoldings = currencyHoldings.filter(h => h.assetType === 'us-equity')
                return usEquityHoldings.length > 0 ? (
                  <LazyChartWrapper pieChart title="US Equities Holdings Breakdown">
                    <USEquityPortfolioChart
                      holdings={usEquityHoldings}
                      currency={currency}
                    />
                  </LazyChartWrapper>
                ) : null
              })()}
              {/* Crypto Portfolio Chart - show for any currency with crypto holdings - Lazy loaded */}
              {(() => {
                const cryptoHoldings = currencyHoldings.filter(h => h.assetType === 'crypto')
                return cryptoHoldings.length > 0 ? (
                  <LazyChartWrapper pieChart title="Crypto Holdings Breakdown">
                    <CryptoPortfolioChart
                      holdings={cryptoHoldings}
                      currency={currency}
                    />
                  </LazyChartWrapper>
                ) : null
              })()}
              {/* Metals Portfolio Chart - show for USD currency with metals holdings - Lazy loaded */}
              {currency === 'USD' && (() => {
                const metalsHoldings = currencyHoldings.filter(h => h.assetType === 'metals')
                return metalsHoldings.length > 0 ? (
                  <LazyChartWrapper pieChart title="Metals Holdings Breakdown">
                    <MetalsPortfolioChart
                      holdings={metalsHoldings}
                      currency={currency}
                    />
                  </LazyChartWrapper>
                ) : null
              })()}
            </div>
          </div>
        )
      })}

      {/* Asset Type Selector */}
      <AssetTypeSelectorDialog
        open={isAssetTypeSelectorOpen}
        onOpenChange={setIsAssetTypeSelectorOpen}
        onSelect={handleAssetTypeSelect}
      />

      {/* Show appropriate dialog based on asset type */}
      <AddCashDialog
        open={isAddDialogOpen && (selectedAssetType === 'cash' || (editingHolding?.assetType === 'cash'))}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open)
          if (!open) {
            setSelectedAssetType(null)
            setEditingHolding(null)
          }
        }}
        onSave={handleAddHolding}
        editingHolding={editingHolding?.assetType === 'cash' ? editingHolding : null}
      />
      <AddFDDialog
        open={isAddDialogOpen && (selectedAssetType === 'fd' || (editingHolding?.assetType === 'fd'))}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open)
          if (!open) {
            setSelectedAssetType(null)
            setEditingHolding(null)
          }
        }}
        onSave={handleAddHolding}
        editingHolding={editingHolding?.assetType === 'fd' ? editingHolding : null}
      />
      <AddCommodityDialog
        open={isAddDialogOpen && (selectedAssetType === 'commodities' || (editingHolding?.assetType === 'commodities'))}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open)
          if (!open) {
            setSelectedAssetType(null)
            setEditingHolding(null)
          }
        }}
        onSave={handleAddHolding}
        editingHolding={editingHolding?.assetType === 'commodities' ? editingHolding : null}
      />

    </div>
  )
}

