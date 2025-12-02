"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  Coins,
  Trophy,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  BarChart3,
  PiggyBank,
} from "lucide-react"
import { PortfolioUpdateSection } from "./portfolio-update-section"
import { AllocationBarChart } from "./allocation-bar-chart"
import { DividendPayoutChart } from "./dividend-payout-chart"
import { PortfolioHistoryChart } from "./portfolio-history-chart"
import { PerformanceMetrics } from "./performance-metrics"
import { PnLBreakdown } from "./pnl-breakdown"
import { TransactionsView } from "./transactions-view"
import { LazyChartWrapper } from "./lazy-chart-wrapper"
import dynamic from "next/dynamic"
import type { Holding } from "@/lib/portfolio/types"
import { loadPortfolio } from "@/lib/portfolio/portfolio-db-storage"
import {
  calculatePortfolioSummaryWithDividends,
  calculateAssetAllocation,
  calculateUnifiedPortfolioSummary,
  calculateUnifiedAssetAllocation,
  formatCurrency,
  formatPercent,
  calculateCurrentValue,
  calculateGainLossPercent,
  combineHoldingsByAsset,
  getTopPerformers,
  groupHoldingsByCurrency,
} from "@/lib/portfolio/portfolio-utils"
import { useAuth } from "@/lib/auth/auth-context"
import { LoginDialog } from "@/components/auth/login-dialog"
import { RegisterDialog } from "@/components/auth/register-dialog"
import { Loader2 } from "lucide-react"
import { ASSET_TYPE_LABELS } from "@/lib/portfolio/types"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { usePortfolio } from "@/hooks/use-portfolio"

// Exchange rate series key for USD/PKR
const EXCHANGE_RATE_SERIES_KEY = 'TS_GP_ER_FAERPKR_M.E00220'

// Lazy load heavy chart components
const CryptoPortfolioChart = dynamic(() => import("./crypto-portfolio-chart").then(mod => ({ default: mod.CryptoPortfolioChart })), {
  ssr: false,
})

const MetalsPortfolioChart = dynamic(() => import("./metals-portfolio-chart").then(mod => ({ default: mod.MetalsPortfolioChart })), {
  ssr: false,
})

export function PortfolioDashboardV2() {
  const { user, loading: authLoading } = useAuth()

  const { 
    holdings, 
    netDeposits, 
    loading: holdingsLoading, 
    exchangeRate,
    mutate: mutateHoldings,
    pricesValidating
  } = usePortfolio()

  const [summary, setSummary] = useState<any>(null)
  const [todayChange, setTodayChange] = useState<{ value: number; percent: number } | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedAsset, setSelectedAsset] = useState<{ assetType: string; symbol: string; currency: string; name: string } | null>(null)
  const [includeDividends, setIncludeDividends] = useState(false)
  const [dividendData, setDividendData] = useState<any[] | null>(null)

  useEffect(() => {
    if (holdings.length === 0) {
      setSummary(null)
      return
    }

    const calculateSummary = async () => {
      try {
        const { 
          calculatePortfolioSummary, 
          calculateDividendsCollected,
          calculateTotalRealizedPnL,
          calculateUnifiedPortfolioSummary
        } = await import('@/lib/portfolio/portfolio-utils')

        // 1. Start fetching global data in parallel
        // calculateTotalRealizedPnL uses a cached endpoint
        const realizedPnLPromise = calculateTotalRealizedPnL()
        
        // calculateDividendsCollected uses the batch API which we just optimized to be DB-only
        const dividendDetailsPromise = calculateDividendsCollected(holdings)
        
        const [realizedPnL, dividendDetails] = await Promise.all([realizedPnLPromise, dividendDetailsPromise])
        setDividendData(dividendDetails)
        const totalDividends = dividendDetails.reduce((sum, d) => sum + d.totalCollected, 0)

        // 2. Calculate Per-Currency Summaries
        const holdingsByCurrency = groupHoldingsByCurrency(holdings)
        const currencies = Array.from(holdingsByCurrency.keys())

        const summaries: Record<string, any> = {}
        
        for (const currency of currencies) {
          const currencyHoldings = holdingsByCurrency.get(currency) || []
          const summary = calculatePortfolioSummary(currencyHoldings)
          
          // Filter dividends for this currency's holdings
          const currencyHoldingIds = new Set(currencyHoldings.map(h => h.id))
          const currencyDividends = dividendDetails
              .filter(d => currencyHoldingIds.has(d.holdingId))
              .reduce((sum, d) => sum + d.totalCollected, 0)
              
          summary.dividendsCollected = currencyDividends
          summary.dividendsCollectedPercent = summary.totalInvested > 0 ? (currencyDividends / summary.totalInvested) * 100 : 0
          
          summary.realizedPnL = realizedPnL
          summary.totalPnL = summary.totalGainLoss + realizedPnL
          
          if (realizedPnL !== 0) {
            summary.totalInvested = summary.totalInvested - realizedPnL
            if (summary.totalInvested !== 0) {
              summary.totalGainLossPercent = (summary.totalGainLoss / summary.totalInvested) * 100
              summary.dividendsCollectedPercent = (currencyDividends / summary.totalInvested) * 100
            }
          }
          
          summaries[currency] = summary
        }

        // 3. Unified Summary
        let unifiedSummary = null
        if (exchangeRate && currencies.length > 1) {
          const exchangeRatesMap = new Map<string, number>()
          currencies.forEach(c => {
            if (c === 'USD') {
              exchangeRatesMap.set(c, 1)
            } else if (c === 'PKR') {
              exchangeRatesMap.set(c, exchangeRate) // 1 USD = X PKR
            }
          })

          unifiedSummary = calculateUnifiedPortfolioSummary(holdings, exchangeRatesMap)
          
          // Add global realized PnL and Dividends
          unifiedSummary.realizedPnL = realizedPnL
          unifiedSummary.totalPnL = unifiedSummary.totalGainLoss + realizedPnL
          
          // Dividends
          unifiedSummary.dividendsCollected = totalDividends
          unifiedSummary.dividendsCollectedPercent = unifiedSummary.totalInvested > 0 ? (totalDividends / unifiedSummary.totalInvested) * 100 : 0
             
          if (realizedPnL !== 0) {
            unifiedSummary.totalInvested = unifiedSummary.totalInvested - realizedPnL
            if (unifiedSummary.totalInvested !== 0) {
              unifiedSummary.totalGainLossPercent = (unifiedSummary.totalGainLoss / unifiedSummary.totalInvested) * 100
            }
          }
        }

        setSummary({
          byCurrency: summaries,
          unified: unifiedSummary,
          currencies,
          netDeposits, // Store netDeposits in summary
        })
      } catch (error) {
        console.error('Error calculating summary:', error)
      }
    }

    calculateSummary()
  }, [holdings, exchangeRate, netDeposits])

  // Calculate today's change
  useEffect(() => {
    // Reset todayChange when tab changes to prevent showing stale data from previous tab
    setTodayChange(null)
    
    // Create an abort controller to cancel stale requests if tab changes quickly
    const controller = new AbortController()

    const calculateTodayChange = async () => {
      if (!holdings.length || !user) {
        setTodayChange(null)
        return
      }

      try {
        const token = localStorage.getItem('auth_token')

        // Determine currency and unified mode based on active tab
        let currency = 'USD'
        let unified = true
        if (activeTab === 'pkr') {
          currency = 'PKR'
          unified = false
        } else if (activeTab === 'usd') {
          currency = 'USD'
          unified = false
        } else {
          currency = 'USD'
          unified = true
        }

        // Use fewer days (5) for faster loading (Today, Yesterday, + buffer for weekends)
        const unifiedParam = unified ? '&unified=true' : ''
        const response = await fetch(`/api/user/portfolio/history?days=5&currency=${currency}${unifiedParam}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          signal: controller.signal
        })

        if (response.ok) {
          const data = await response.json()
          const history = data.history || []

          // If aborted, do nothing
          if (controller.signal.aborted) return

          // Need at least 1 day of history to show change (vs 0)
          if (history.length === 0) {
            setTodayChange(null)
            return
          }

          // Sort by date to ensure correct order
          const sortedHistory = [...history].sort((a: any, b: any) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
          )

          // Use the last 2 available days (not necessarily today and yesterday)
          // This handles cases where today's PK equity data isn't available yet
          if (sortedHistory.length < 1) {
            setTodayChange(null)
            return
          }

          const latest = sortedHistory[sortedHistory.length - 1]
          const previous = sortedHistory.length >= 2 ? sortedHistory[sortedHistory.length - 2] : { invested: 0, cashFlow: 0 }

          // Validate data (latest must exist)
          if (!latest || latest.invested === undefined) {
            setTodayChange(null)
            return
          }

          // Calculate Daily P&L using standard formula:
          // Daily P&L = (End Value - Start Value) - Net Flows
          
          const latestCashFlow = latest.cashFlow || 0
          const previousInvested = previous.invested || 0
          
          // Note: latest.invested in API response is "Market Value + Cash".
          const change = (latest.invested - previousInvested) - latestCashFlow
          const changePercent = previousInvested > 0 ? (change / previousInvested) * 100 : 0

          // Set if values are valid numbers (including 0 - don't filter out zero change)
          if (!isNaN(change) && !isNaN(changePercent) && isFinite(change) && isFinite(changePercent)) {
            setTodayChange({ value: change, percent: changePercent })
          } else {
            setTodayChange(null)
          }
        } else {
          if (!controller.signal.aborted) {
            setTodayChange(null)
          }
        }
      } catch (error: any) {
        // Ignore abort errors
        if (error.name !== 'AbortError') {
          console.error('Error calculating today change:', error)
          setTodayChange(null)
        }
      }
    }

    // Add a small delay to ensure tab change is complete before calculating
    const timeoutId = setTimeout(() => {
      calculateTodayChange()
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      controller.abort() // Cancel any pending request when tab changes or unmounts
    }
  }, [holdings, user, activeTab])

  const loadHoldings = async (fast: boolean = false) => {
    // Just trigger revalidation
    await mutateHoldings()
  }

  const handleRefreshPrices = async () => {
    await mutateHoldings()
  }

  // Calculate insights (filtered by active tab)
  const insights = useMemo(() => {
    if (holdings.length === 0) return null

    // Filter holdings based on active tab
    const filteredHoldings = activeTab === 'overview'
      ? holdings
      : holdings.filter(h => {
        const hCurrency = h.currency || 'USD'
        if (activeTab === 'pkr') return hCurrency === 'PKR'
        if (activeTab === 'usd') return hCurrency === 'USD'
        return true
      })

    if (filteredHoldings.length === 0) return null

    const combinedHoldings = combineHoldingsByAsset(filteredHoldings)
    const performers = getTopPerformers(combinedHoldings, 1)

    const bestPerformer = performers.best[0]
    if (!bestPerformer) return null

    const gainPercent = calculateGainLossPercent(bestPerformer)
    const currentValue = calculateCurrentValue(bestPerformer)
    const invested = bestPerformer.quantity * bestPerformer.purchasePrice
    const gainValue = currentValue - invested

    return {
      bestPerformer: {
        symbol: bestPerformer.symbol,
        gainPercent,
        gainValue,
      }
    }
  }, [holdings, activeTab])

  // Calculate allocation
  const allocation = useMemo(() => calculateAssetAllocation(holdings), [holdings])

  // Show loading state
  if (authLoading || (holdingsLoading && holdings.length === 0)) {
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
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Please login or create an account to track your portfolio
            </p>
            <div className="flex gap-2">
              <LoginDialog>
                <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md">Login</button>
              </LoginDialog>
              <RegisterDialog>
                <button className="px-4 py-2 border rounded-md">Create Account</button>
              </RegisterDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!summary || holdings.length === 0) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <PortfolioUpdateSection holdings={holdings} onUpdate={loadHoldings} />
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Holdings Yet</h3>
              <p className="text-sm text-muted-foreground">Start tracking your investments by adding your first holding</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Determine which summary to use based on active tab
  const holdingsByCurrency = groupHoldingsByCurrency(holdings)
  const allCurrencies = Array.from(holdingsByCurrency.keys())
  const currencies = allCurrencies // Keep for backward compatibility with existing code

  // Filter currencies based on active tab
  let selectedCurrencies: string[] = []
  let displayCurrency = 'USD'
  let useUnified = false

  if (activeTab === 'overview') {
    // Overview: show both USD and PKR (unified)
    selectedCurrencies = allCurrencies
    displayCurrency = 'USD'
    useUnified = true
  } else if (activeTab === 'pkr') {
    // PKR Portfolio: show only PKR
    selectedCurrencies = ['PKR']
    displayCurrency = 'PKR'
    useUnified = false
  } else if (activeTab === 'usd') {
    // USD Portfolio: show only USD
    selectedCurrencies = ['USD']
    displayCurrency = 'USD'
    useUnified = false
  } else {
    // Default to all currencies
    selectedCurrencies = allCurrencies
    displayCurrency = 'USD'
    useUnified = summary.unified || false
  }

  // Calculate total portfolio value based on selected tab
  let totalPortfolioValue = 0;
  let totalPortfolioChange = 0;
  let totalPortfolioChangePercent = 0;
  let totalInvested = 0;

  if (useUnified && summary.unified) {
    // Use unified summary for overview
    totalPortfolioValue = summary.unified.currentValue;

    // Use Net Deposits if available for accurate total gain/loss
    if (summary.netDeposits && Object.keys(summary.netDeposits).length > 0) {
      // Calculate total invested by converting all net deposits to USD
      let totalNetDepositsUSD = 0;

      // USD deposits
      totalNetDepositsUSD += (summary.netDeposits['USD'] || 0);

      // PKR deposits (convert to USD)
      if (summary.netDeposits['PKR']) {
        const rate = exchangeRate || 1; // Fallback to 1 if no rate
        totalNetDepositsUSD += summary.netDeposits['PKR'] / rate;
      }

      totalInvested = totalNetDepositsUSD;
      totalPortfolioChange = totalPortfolioValue - totalInvested;
    } else {
      totalPortfolioChange = summary.unified.totalGainLoss + (summary.unified.realizedPnL || 0);
      totalInvested = summary.unified.totalInvested;
    }

    totalPortfolioChangePercent = totalInvested > 0
      ? (totalPortfolioChange / totalInvested) * 100
      : 0;
  } else {
    // Use currency-specific summaries
    selectedCurrencies.forEach(currency => {
      const currencySummary = summary.byCurrency[currency];
      if (currencySummary) {
        if (currency === 'USD') {
          totalPortfolioValue += currencySummary.currentValue;
          totalPortfolioChange += currencySummary.totalGainLoss + (currencySummary.realizedPnL || 0);
          totalInvested += currencySummary.totalInvested;
        } else if (currency === 'PKR') {
          if (activeTab === 'overview') {
            // Convert PKR to USD for overview
            const rate = exchangeRate || 1;
            totalPortfolioValue += currencySummary.currentValue / rate;
            totalPortfolioChange += (currencySummary.totalGainLoss + (currencySummary.realizedPnL || 0)) / rate;
            totalInvested += currencySummary.totalInvested / rate;
          } else {
            // Use PKR directly for PKR tab
            totalPortfolioValue += currencySummary.currentValue;
            totalPortfolioChange += currencySummary.totalGainLoss + (currencySummary.realizedPnL || 0);
            totalInvested += currencySummary.totalInvested;
          }
        } else {
          // For other currencies, just add
          totalPortfolioValue += currencySummary.currentValue;
          totalPortfolioChange += currencySummary.totalGainLoss + (currencySummary.realizedPnL || 0);
          totalInvested += currencySummary.totalInvested;
        }
      }
    });

    // If we are in Overview tab but fell through to here (e.g. useUnified is false for some reason),
    // we should still try to use netDeposits if available and we are summing everything up.
    if (activeTab === 'overview' && summary.netDeposits && Object.keys(summary.netDeposits).length > 0) {
      // Recalculate based on net deposits
      let totalNetDepositsUSD = 0;
      totalNetDepositsUSD += (summary.netDeposits['USD'] || 0);
      if (summary.netDeposits['PKR']) {
        const rate = exchangeRate || 1;
        totalNetDepositsUSD += summary.netDeposits['PKR'] / rate;
      }

      totalInvested = totalNetDepositsUSD;
      totalPortfolioChange = totalPortfolioValue - totalInvested;
    }

    totalPortfolioChangePercent = totalInvested > 0 ? (totalPortfolioChange / totalInvested) * 100 : 0;
  }

  const isPositive = totalPortfolioChange >= 0;
  const totalAssets = combineHoldingsByAsset(
    activeTab === 'overview'
      ? holdings
      : holdings.filter(h => {
        const hCurrency = h.currency || 'USD';
        if (activeTab === 'pkr') return hCurrency === 'PKR';
        if (activeTab === 'usd') return hCurrency === 'USD';
        return true;
      })
  ).length

  // Check if dividends exist and calculate totals (filtered by active tab)
  let totalDividends = 0
  if (useUnified && summary.unified) {
    totalDividends = summary.unified.dividendsCollected || 0
  } else {
    selectedCurrencies.forEach(currency => {
      const currencySummary = summary.byCurrency[currency]
      if (currencySummary) {
        totalDividends += currencySummary.dividendsCollected || 0
      }
    })
  }

  const dividendsCollectedPercent = totalInvested > 0 ? (totalDividends / totalInvested) * 100 : 0
  const hasDividends = totalDividends > 0

  // Calculate total return with dividends if enabled
  let totalReturnWithDividends = totalPortfolioChange
  let totalReturnPercentWithDividends = totalPortfolioChangePercent
  if (includeDividends && hasDividends) {
    totalReturnWithDividends = totalPortfolioChange + totalDividends
    totalReturnPercentWithDividends = totalInvested > 0 ? (totalReturnWithDividends / totalInvested) * 100 : 0
  }

  // Calculate total return (price only by default, or price + dividends if toggle is enabled)
  const totalReturn = includeDividends && hasDividends
    ? totalPortfolioChange + totalDividends
    : totalPortfolioChange
  const totalReturnPercent = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* Top Summary Cards */}
      <div className={`grid gap-4 ${hasDividends ? 'md:grid-cols-2 lg:grid-cols-6' : 'md:grid-cols-2 lg:grid-cols-5'}`}>
        {/* Total Portfolio */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Portfolio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-1">{formatCurrency(totalPortfolioValue, displayCurrency)}</div>
            <p className="text-xs text-muted-foreground mb-2">
              {selectedCurrencies.length > 1 ? `${selectedCurrencies.join(' + ')} combined` : selectedCurrencies[0] || displayCurrency}
            </p>
            <div className={`flex items-center gap-1 ${(includeDividends ? totalReturnWithDividends : totalPortfolioChange) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {(includeDividends ? totalReturnWithDividends : totalPortfolioChange) >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              <span className="text-sm font-semibold">{formatPercent(includeDividends ? totalReturnPercentWithDividends : totalPortfolioChangePercent)}</span>
            </div>
            {includeDividends && hasDividends && (
              <p className="text-xs text-muted-foreground mt-1">• With dividends</p>
            )}
          </CardContent>
        </Card>

        {/* Total Return - Always shown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Return</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold mb-1 ${totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatCurrency(totalReturn, displayCurrency)}
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              {includeDividends && hasDividends ? 'Price + Dividends' : 'Price only'}
            </p>
            <div className={`flex items-center gap-1 ${totalReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {totalReturn >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              <span className="text-sm font-semibold">{formatPercent(totalReturnPercent)}</span>
            </div>
            {hasDividends && (
              <p className="text-xs text-muted-foreground mt-1">
                {includeDividends ? '• Includes dividends' : '• Dividends available (toggle to include)'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Today's Change */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Change</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold mb-1 ${todayChange && todayChange.value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {todayChange ? (todayChange.value >= 0 ? '+' : '') + formatCurrency(todayChange.value, displayCurrency) : '—'}
            </div>
            <p className="text-xs text-muted-foreground mb-2">Day P&L</p>
            {todayChange && (
              <div className={`flex items-center gap-1 ${todayChange.percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {todayChange.percent >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                <span className="text-sm font-semibold">{formatPercent(todayChange.percent)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Best Performer */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Best Performer</CardTitle>
          </CardHeader>
          <CardContent>
            {insights?.bestPerformer ? (
              <>
                <div className="text-2xl font-bold mb-1">{insights.bestPerformer.symbol}</div>
                <p className="text-xs text-muted-foreground mb-2">+{formatPercent(insights.bestPerformer.gainPercent)} all time</p>
                <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <ArrowUpRight className="h-4 w-4" />
                  <span className="text-sm font-semibold">+{formatCurrency(insights.bestPerformer.gainValue, displayCurrency)}</span>
                </div>
              </>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">—</div>
            )}
          </CardContent>
        </Card>

        {/* Total Assets */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold mb-1">{totalAssets}</div>
            <p className="text-xs text-muted-foreground">Across {selectedCurrencies.length} {selectedCurrencies.length === 1 ? 'portfolio' : 'portfolios'}</p>
          </CardContent>
        </Card>

        {/* Dividends Collected - Only show if dividends exist */}
        {hasDividends && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Dividends Collected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-1 text-green-600 dark:text-green-400">
                {formatCurrency(totalDividends, displayCurrency)}
              </div>
              <p className="text-xs text-muted-foreground mb-2">Total dividends</p>
              <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <ArrowUpRight className="h-4 w-4" />
                <span className="text-sm font-semibold">{formatPercent(dividendsCollectedPercent)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">of total invested</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {currencies.includes('PKR') && <TabsTrigger value="pkr">PKR Portfolio</TabsTrigger>}
          {currencies.includes('USD') && <TabsTrigger value="usd">USD Portfolio</TabsTrigger>}
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <PortfolioUpdateSection
            holdings={holdings}
            onUpdate={loadHoldings}
            onNavigateToTransactions={(asset) => {
              if (asset) {
                setSelectedAsset(asset)
              } else {
                setSelectedAsset(null)
              }
              setActiveTab('transactions')
            }}
          />

          {summary.unified && (
            <div className="grid gap-4 md:grid-cols-2">
              <AllocationBarChart
                allocation={calculateUnifiedAssetAllocation(holdings, new Map(currencies.map(c => [c, c === 'PKR' ? (exchangeRate || 1) : 1])))}
                holdings={holdings}
                currency="USD"
              />
              <DividendPayoutChart holdings={holdings} currency="USD" preCalculatedDividends={dividendData || undefined} />
            </div>
          )}

          {summary.unified && (
            <PortfolioHistoryChart currency="USD" unified={true} />
          )}

          <PerformanceMetrics currency="USD" unified={summary.unified ? true : false} />

          <PnLBreakdown holdings={holdings} currency="USD" />
        </TabsContent>

        {/* PKR Portfolio Tab */}
        {currencies.includes('PKR') && (
          <TabsContent value="pkr" className="space-y-4">
            {summary.byCurrency.PKR && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>PKR Portfolio</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="text-3xl font-bold mb-1">{formatCurrency(summary.byCurrency.PKR.currentValue, 'PKR')}</div>
                        <div className={`flex items-center gap-1 ${summary.byCurrency.PKR.totalGainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {summary.byCurrency.PKR.totalGainLoss >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                          <span>{formatPercent(summary.byCurrency.PKR.totalGainLossPercent)}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                            <PiggyBank className="h-4 w-4" />
                            <span>Invested</span>
                          </div>
                          <div className="text-lg font-semibold">{formatCurrency(summary.byCurrency.PKR.totalInvested, 'PKR')}</div>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                            <Wallet className="h-4 w-4" />
                            <span>Unrealized P&L</span>
                          </div>
                          <div className={`text-lg font-semibold ${summary.byCurrency.PKR.totalGainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatCurrency(summary.byCurrency.PKR.totalGainLoss, 'PKR')}
                            <span className="ml-2 text-sm">({formatPercent(summary.byCurrency.PKR.totalGainLossPercent)})</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  <AllocationBarChart
                    allocation={calculateAssetAllocation(holdingsByCurrency.get('PKR') || [])}
                    holdings={holdingsByCurrency.get('PKR') || []}
                    currency="PKR"
                  />
                  <DividendPayoutChart holdings={holdingsByCurrency.get('PKR') || []} currency="PKR" preCalculatedDividends={dividendData || undefined} />
                </div>

                <PortfolioHistoryChart currency="PKR" />

                <PerformanceMetrics currency="PKR" unified={false} />

              </>
            )}
          </TabsContent>
        )}

        {/* USD Portfolio Tab */}
        {currencies.includes('USD') && (
          <TabsContent value="usd" className="space-y-4">
            {summary.byCurrency.USD && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>USD Portfolio</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="text-3xl font-bold mb-1">{formatCurrency(summary.byCurrency.USD.currentValue, 'USD')}</div>
                        <div className={`flex items-center gap-1 ${summary.byCurrency.USD.totalGainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {summary.byCurrency.USD.totalGainLoss >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                          <span>{formatPercent(summary.byCurrency.USD.totalGainLossPercent)}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                            <PiggyBank className="h-4 w-4" />
                            <span>Invested</span>
                          </div>
                          <div className="text-lg font-semibold">{formatCurrency(summary.byCurrency.USD.totalInvested, 'USD')}</div>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                            <Wallet className="h-4 w-4" />
                            <span>Unrealized P&L</span>
                          </div>
                          <div className={`text-lg font-semibold ${summary.byCurrency.USD.totalGainLoss >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatCurrency(summary.byCurrency.USD.totalGainLoss, 'USD')}
                            <span className="ml-2 text-sm">({formatPercent(summary.byCurrency.USD.totalGainLossPercent)})</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  <AllocationBarChart
                    allocation={calculateAssetAllocation(holdingsByCurrency.get('USD') || [])}
                    holdings={holdingsByCurrency.get('USD') || []}
                    currency="USD"
                  />
                  <DividendPayoutChart holdings={holdingsByCurrency.get('USD') || []} currency="USD" preCalculatedDividends={dividendData || undefined} />
                </div>

                <PortfolioHistoryChart
                  currency="USD"
                  totalChange={totalPortfolioChange}
                  totalChangePercent={totalPortfolioChangePercent}
                />

                <PerformanceMetrics currency="USD" unified={false} />


                {holdingsByCurrency.get('USD')?.some(h => h.assetType === 'crypto') && (
                  <LazyChartWrapper pieChart title="Crypto Holdings Breakdown">
                    <CryptoPortfolioChart holdings={holdingsByCurrency.get('USD')?.filter(h => h.assetType === 'crypto') || []} currency="USD" />
                  </LazyChartWrapper>
                )}

                {holdingsByCurrency.get('USD')?.some(h => h.assetType === 'metals') && (
                  <LazyChartWrapper pieChart title="Metals Holdings Breakdown">
                    <MetalsPortfolioChart holdings={holdingsByCurrency.get('USD')?.filter(h => h.assetType === 'metals') || []} currency="USD" />
                  </LazyChartWrapper>
                )}
              </>
            )}
          </TabsContent>
        )}

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <TransactionsView
            holdings={holdings}
            selectedAsset={selectedAsset}
            onClearAssetFilter={() => setSelectedAsset(null)}
            onHoldingsUpdate={loadHoldings}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
