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
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [todayChange, setTodayChange] = useState<{ value: number; percent: number } | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedAsset, setSelectedAsset] = useState<{ assetType: string; symbol: string; currency: string; name: string } | null>(null)
  const [includeDividends, setIncludeDividends] = useState(false)

  useEffect(() => {
    if (!authLoading && user) {
      loadHoldings(true).then(() => {
        setTimeout(() => {
          handleRefreshPrices()
        }, 1500)
      })
    } else if (!authLoading && !user) {
      setLoading(false)
    }
  }, [authLoading, user])

  // Fetch exchange rate
  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        const response = await fetch(`/api/sbp/economic-data?seriesKey=${encodeURIComponent(EXCHANGE_RATE_SERIES_KEY)}&startDate=${new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0]}&endDate=${new Date().toISOString().split('T')[0]}`)
        if (response.ok) {
          const data = await response.json()
          const exchangeData = data.data || []
          if (exchangeData.length > 0) {
            // Get the most recent exchange rate
            const sorted = [...exchangeData].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
            setExchangeRate(sorted[0].value)
          }
        }
      } catch (error) {
        console.error('Error fetching exchange rate:', error)
      }
    }
    fetchExchangeRate()
  }, [])

  // Calculate today's change
  useEffect(() => {
    // Reset todayChange when tab changes to prevent showing stale data
    setTodayChange(null)
    
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

        // Use more days to ensure we have enough data and can find a valid comparison day
        const unifiedParam = unified ? '&unified=true' : ''
        const response = await fetch(`/api/user/portfolio/history?days=7&currency=${currency}${unifiedParam}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        })

        if (response.ok) {
          const data = await response.json()
          const history = data.history || []
          
          if (history.length < 2) {
            setTodayChange(null)
            return
          }

          // Sort by date to ensure correct order
          const sortedHistory = [...history].sort((a: any, b: any) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
          )
          
          const today = sortedHistory[sortedHistory.length - 1]
          const yesterday = sortedHistory[sortedHistory.length - 2]
          
          // Validate data
          if (!today || !yesterday || !today.invested || !yesterday.invested) {
            setTodayChange(null)
            return
          }
          
          // Exclude cash injections/withdrawals from daily returns
          // If today has a cash flow, skip this calculation (it's not a real return)
          const todayCashFlow = today.cashFlow || 0
          if (Math.abs(todayCashFlow) < 0.01) { // Use small epsilon to handle floating point
            // No cash flow, calculate actual return
            const change = today.invested - yesterday.invested
            const changePercent = yesterday.invested > 0 ? (change / yesterday.invested) * 100 : 0
            
            // Only set if values are valid numbers
            if (!isNaN(change) && !isNaN(changePercent) && isFinite(change) && isFinite(changePercent)) {
              setTodayChange({ value: change, percent: changePercent })
            } else {
              setTodayChange(null)
            }
          } else {
            // Cash flow detected, try to find a day without cash flow
            // Look back up to 7 days to find a day without cash flow
            let foundValidChange = false
            for (let i = sortedHistory.length - 2; i >= Math.max(0, sortedHistory.length - 8); i--) {
              const prevDay = sortedHistory[i]
              if (!prevDay || !prevDay.invested) continue
              
              const prevDayCashFlow = prevDay.cashFlow || 0
              if (Math.abs(prevDayCashFlow) < 0.01) {
                const change = today.invested - prevDay.invested
                const changePercent = prevDay.invested > 0 ? (change / prevDay.invested) * 100 : 0
                
                // Only set if values are valid numbers
                if (!isNaN(change) && !isNaN(changePercent) && isFinite(change) && isFinite(changePercent)) {
                  setTodayChange({ value: change, percent: changePercent })
                  foundValidChange = true
                  break
                }
              }
            }
            if (!foundValidChange) {
              // Couldn't find a valid day, set to null
              setTodayChange(null)
            }
          }
        } else {
          setTodayChange(null)
        }
      } catch (error) {
        console.error('Error calculating today change:', error)
        setTodayChange(null)
      }
    }

    // Add a small delay to ensure tab change is complete before calculating
    const timeoutId = setTimeout(() => {
      calculateTodayChange()
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [holdings, user, activeTab])

  const loadHoldings = async (fast: boolean = false) => {
    try {
      const portfolio = await loadPortfolio(fast)
      setHoldings(portfolio.holdings)
      
      // Calculate summary with dividends (deferred)
      setTimeout(async () => {
        // Calculate summaries for each currency
        const holdingsByCurrency = groupHoldingsByCurrency(portfolio.holdings)
        const currencies = Array.from(holdingsByCurrency.keys())
        
        const summaries: Record<string, any> = {}
        for (const currency of currencies) {
          const currencyHoldings = holdingsByCurrency.get(currency) || []
          summaries[currency] = await calculatePortfolioSummaryWithDividends(currencyHoldings)
        }

        // Calculate unified summary if we have exchange rate
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
          
          const { calculateUnifiedPortfolioSummaryWithRealizedPnL } = await import('@/lib/portfolio/portfolio-utils')
          unifiedSummary = await calculateUnifiedPortfolioSummaryWithRealizedPnL(portfolio.holdings, exchangeRatesMap)
          
          // Add dividends
          const pkEquityHoldings = portfolio.holdings.filter(h => h.assetType === 'pk-equity')
          if (pkEquityHoldings.length > 0) {
            const { calculateTotalDividendsCollected } = await import('@/lib/portfolio/portfolio-utils')
            const dividendsCollected = await calculateTotalDividendsCollected(portfolio.holdings)
            unifiedSummary.dividendsCollected = dividendsCollected
            unifiedSummary.dividendsCollectedPercent = unifiedSummary.totalInvested > 0 ? (dividendsCollected / unifiedSummary.totalInvested) * 100 : 0
          }
        }

        setSummary({
          byCurrency: summaries,
          unified: unifiedSummary,
          currencies,
        })
        setLoading(false)
      }, 500)
    } catch (error) {
      console.error('Error loading holdings:', error)
      setHoldings([])
      setLoading(false)
    }
  }

  const handleRefreshPrices = async () => {
    await loadHoldings(false)
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
  if (authLoading || loading) {
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
  let totalPortfolioValue = 0
  let totalPortfolioChange = 0
  let totalPortfolioChangePercent = 0
  let totalInvested = 0

  if (useUnified && summary.unified) {
    // Use unified summary for overview
    totalPortfolioValue = summary.unified.currentValue
    totalPortfolioChange = summary.unified.totalGainLoss + (summary.unified.realizedPnL || 0)
    totalInvested = summary.unified.totalInvested
    totalPortfolioChangePercent = totalInvested > 0 
      ? (totalPortfolioChange / totalInvested) * 100 
      : 0
  } else {
    // Use currency-specific summaries
    selectedCurrencies.forEach(currency => {
      const currencySummary = summary.byCurrency[currency]
      if (currencySummary) {
        if (currency === 'USD') {
          totalPortfolioValue += currencySummary.currentValue
          totalPortfolioChange += currencySummary.totalGainLoss + (currencySummary.realizedPnL || 0)
          totalInvested += currencySummary.totalInvested
        } else if (currency === 'PKR') {
          if (activeTab === 'overview' && exchangeRate) {
            // Convert PKR to USD for overview
            totalPortfolioValue += currencySummary.currentValue / exchangeRate
            totalPortfolioChange += (currencySummary.totalGainLoss + (currencySummary.realizedPnL || 0)) / exchangeRate
            totalInvested += currencySummary.totalInvested / exchangeRate
          } else {
            // Use PKR directly for PKR tab
            totalPortfolioValue += currencySummary.currentValue
            totalPortfolioChange += currencySummary.totalGainLoss + (currencySummary.realizedPnL || 0)
            totalInvested += currencySummary.totalInvested
          }
        } else {
          // For other currencies, just add
          totalPortfolioValue += currencySummary.currentValue
          totalPortfolioChange += currencySummary.totalGainLoss + (currencySummary.realizedPnL || 0)
          totalInvested += currencySummary.totalInvested
        }
      }
    })
    totalPortfolioChangePercent = totalInvested > 0 ? (totalPortfolioChange / totalInvested) * 100 : 0
  }

  const isPositive = totalPortfolioChange >= 0
  const totalAssets = combineHoldingsByAsset(
    activeTab === 'overview' 
      ? holdings 
      : holdings.filter(h => {
          const hCurrency = h.currency || 'USD'
          if (activeTab === 'pkr') return hCurrency === 'PKR'
          if (activeTab === 'usd') return hCurrency === 'USD'
          return true
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
              <DividendPayoutChart holdings={holdings} currency="USD" />
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
                  <DividendPayoutChart holdings={holdingsByCurrency.get('PKR') || []} currency="PKR" />
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
                  <DividendPayoutChart holdings={holdingsByCurrency.get('USD') || []} currency="USD" />
                </div>
                
                <PortfolioHistoryChart currency="USD" />
                
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
