"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, TrendingUp, TrendingDown, Activity, Shield, ArrowUpRight, ArrowDownRight, Wallet } from "lucide-react"
import {
  formatCurrency,
  formatPercent,
  calculateAdjustedPortfolioHistory,
  calculateAdjustedDailyReturns,
  calculateXIRR,
  calculateLiquidAdjustedHistory,
  type PortfolioHistoryEntry,
  type AdjustedPortfolioHistoryEntry,
  type AdjustedDailyReturn
} from "@/lib/portfolio/portfolio-utils"

interface PerformanceMetricsProps {
  currency?: string
  unified?: boolean
}

interface PerformanceData {
  cagr: number | null
  xirr: number | null
  maxDrawdown: number | null
  volatility: number | null
  sharpeRatio: number | null
  beta: number | null
  bestDay: { value: number; date: string } | null
  worstDay: { value: number; date: string } | null
  winningDays: number | null
  avgDailyReturn: number | null
}

export function PerformanceMetrics({ currency = 'USD', unified = false }: PerformanceMetricsProps) {
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<PerformanceData>({
    cagr: null,
    xirr: null,
    maxDrawdown: null,
    volatility: null,
    sharpeRatio: null,
    beta: null,
    bestDay: null,
    worstDay: null,
    winningDays: null,
    avgDailyReturn: null,
  })


  useEffect(() => {
    async function calculateMetrics() {
      setLoading(true)
      try {
        const token = localStorage.getItem('auth_token')
        if (!token) {
          setLoading(false)
          return
        }

        const headers = { 'Authorization': `Bearer ${token}` }

        const historyRes = await fetch(
          `/api/user/portfolio/history?currency=${currency === 'PKR' ? 'PKR' : 'USD'}&unified=${unified}&days=ALL`,
          { headers }
        )

        if (!historyRes.ok) {
          console.error("Failed to fetch history")
          setLoading(false)
          return
        }

        const historyData = await historyRes.json()

        if (!historyData.history || historyData.history.length === 0) {
          setMetrics({
            cagr: null, xirr: null, maxDrawdown: null, volatility: null,
            sharpeRatio: null, beta: null, bestDay: null, worstDay: null,
            winningDays: null, avgDailyReturn: null
          })
          setLoading(false)
          return
        }

        const rawHistory: PortfolioHistoryEntry[] = historyData.history

        // --- 1. Total Portfolio Metrics (Wealth) ---
        // Used for CAGR and IRR/XIRR (External perspective)
        const totalAdjustedHistory = calculateAdjustedPortfolioHistory(rawHistory)

        // CAGR
        let cagr: number | null = null
        if (totalAdjustedHistory.length > 0) {
          const first = totalAdjustedHistory.find(e => e.adjustedValue > 0)
          const last = totalAdjustedHistory[totalAdjustedHistory.length - 1]
          if (first && last) {
            const firstVal = first.adjustedValue
            const lastVal = last.adjustedValue
            const years = (new Date(last.date).getTime() - new Date(first.date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
            if (years >= 0.00274) {
              const ratio = lastVal / firstVal
              if (ratio > 0 && isFinite(ratio)) {
                const val = (Math.pow(ratio, 1 / years) - 1) * 100
                if (!isNaN(val) && isFinite(val) && val <= 1000000) cagr = val
              }
            }
          }
        }

        // IRR (XIRR)
        let xirr: number | null = null
        try {
          const currentTotalValue = rawHistory[rawHistory.length - 1].value;
          const flows = rawHistory
            .filter((h: any) => h.cashFlow !== 0)
            .map((h: any) => ({
              amount: -(h.cashFlow || 0),
              date: h.date
            }));
          flows.push({ amount: currentTotalValue, date: new Date().toISOString().split('T')[0] });

          const xirrVal = calculateXIRR(flows);
          if (xirrVal !== null) xirr = xirrVal * 100;
        } catch (e) { console.error("XIRR Error", e); }


        // --- 2. Liquid Portfolio Metrics (Risk) ---
        // Specific Logic: Exclude Commodities, Treat Comm. Buy as Withdrawal.
        // Handled by backend fields `liquidValue` and `liquidCashFlow`.
        // Zero-Basis Safeguard: If Liquid Start <= 0, Return = 0.

        // Use centralized utility for consistent logic
        const liquidStats: { date: string; adjustedValue: number; rawValue: number; dailyReturn: number }[] = calculateLiquidAdjustedHistory(rawHistory);

        const liquidAdjustedHistory: { date: string; adjustedValue: number }[] = liquidStats.map(e => ({
          date: e.date,
          adjustedValue: e.adjustedValue
        }));

        // Daily returns (skip first day as it has no valid return relative to previous)
        const liquidDailyReturns: { date: string; return: number; adjustedValue: number }[] = liquidStats.slice(1).map(e => ({
          date: e.date,
          return: e.dailyReturn,
          adjustedValue: e.adjustedValue
        }));


        // Max Drawdown (Liquid)
        let maxDrawdown = 0;
        let peak = -Infinity;
        for (const entry of liquidAdjustedHistory) {
          if (entry.adjustedValue > peak) peak = entry.adjustedValue;
          const dd = peak > 0 ? ((entry.adjustedValue - peak) / peak) * 100 : 0;
          if (dd < maxDrawdown) maxDrawdown = dd;
        }

        // Volatility (Liquid)
        let volatility: number | null = null;
        if (liquidDailyReturns.length > 1) {
          const rets = liquidDailyReturns.map(r => r.return / 100);
          const mean = rets.reduce((a: number, b: number) => a + b, 0) / rets.length;
          const variance = rets.reduce((a: number, b: number) => a + Math.pow(b - mean, 2), 0) / rets.length;
          volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;
        }

        // Sharpe Ratio (Liquid)
        let sharpeRatio: number | null = null;
        if (volatility && volatility > 0 && liquidDailyReturns.length > 0) {
          const rets = liquidDailyReturns.map(r => r.return / 100);
          const meanDaily = rets.reduce((s: number, r: number) => s + r, 0) / rets.length;
          const annRet = meanDaily * 252 * 100;
          const riskFreeRate = 2.5; // 2.5% annual risk-free rate
          sharpeRatio = (annRet - riskFreeRate) / (volatility || 1); // Avoid division by zero
        }


        // Highlights (Using Liquid Returns? Usually people want Total highlights, but for consistency lets use Liquid for consistency)
        // actually let's use LIQUID returns for 'Winning Days' etc as it reflects trading skill better 
        // without commodity holding bias.
        const last30 = liquidDailyReturns.slice(-30);
        const last90 = liquidDailyReturns.slice(-90);

        let bestDayReturn: { date: string; return: number } | null = null;
        let worstDayReturn: { date: string; return: number } | null = null;

        if (liquidDailyReturns.length > 0) {
          bestDayReturn = liquidDailyReturns.reduce((best: { date: string; return: number }, curr: { date: string; return: number }) => curr.return > best.return ? curr : best, liquidDailyReturns[0]);
          worstDayReturn = liquidDailyReturns.reduce((worst: { date: string; return: number }, curr: { date: string; return: number }) => curr.return < worst.return ? curr : worst, liquidDailyReturns[0]);
        }

        // Calculate Dollar Value for Best/Worst (Approximation using Total History value change? Or Liquid Value change?)
        // Let's use Liquid Value change to match the return %
        // Actually showing Dollar change of LIQUID part only might be confusing if user thinks "Total Portfolio".
        // But Mixing metrics is worse. Let's stick to Liquid for consistency with the "Risk/Performance" theme.

        let bestDay: { value: number; date: string } | null = null;
        let worstDay: { value: number; date: string } | null = null;

        if (bestDayReturn) {
          const idx = liquidAdjustedHistory.findIndex(h => h.date === bestDayReturn!.date);
          if (idx > 0) {
            // Improve: Calculate actual dollar gain from raw liquid value?
            // Current logic usually was: Adjusted Value comparison. 
            // Let's stick to logic: Dollar Gain = Liquid Value Today - (Liquid Value Yesterday + Net Liquid Flow)
            // Or just Delta.
            // Ideally we want "PnL".
            const dayRaw = rawHistory.find(h => h.date === bestDayReturn!.date);
            const prevRaw = rawHistory.find(h => h.date === liquidAdjustedHistory[idx - 1].date);
            if (dayRaw && prevRaw) {
              const flow = dayRaw.liquidCashFlow !== undefined ? dayRaw.liquidCashFlow : dayRaw.cashFlow;
              const val = dayRaw.liquidValue !== undefined ? dayRaw.liquidValue : dayRaw.value;
              const prevVal = prevRaw.liquidValue !== undefined ? prevRaw.liquidValue : prevRaw.value;
              const pnl = val - ((prevVal || 0) + (flow || 0)); // Pure PnL
              bestDay = { value: pnl, date: bestDayReturn.date };
            }
          }
        }

        if (worstDayReturn) {
          const idx = liquidAdjustedHistory.findIndex(h => h.date === worstDayReturn!.date);
          if (idx > 0) {
            const dayRaw = rawHistory.find(h => h.date === worstDayReturn!.date);
            const prevRaw = rawHistory.find(h => h.date === liquidAdjustedHistory[idx - 1].date);
            if (dayRaw && prevRaw) {
              const flow = dayRaw.liquidCashFlow !== undefined ? dayRaw.liquidCashFlow : dayRaw.cashFlow;
              const val = dayRaw.liquidValue !== undefined ? dayRaw.liquidValue : dayRaw.value;
              const prevVal = prevRaw.liquidValue !== undefined ? prevRaw.liquidValue : prevRaw.value;
              const pnl = val - ((prevVal || 0) + (flow || 0));
              worstDay = { value: pnl, date: worstDayReturn.date };
            }
          }
        }

        const winningDays = last30.length > 0 ? (last30.filter(r => r.return > 0).length / last30.length) * 100 : null;
        const avgDailyReturn = last90.length > 0 ? last90.reduce((s: number, r: { date: string; return: number; adjustedValue: number }) => s + r.return, 0) / last90.length : null;

        // BETA (Liquid)
        let beta: number | null = null;
        try {
          const benchmarkAssetType = currency === 'PKR' ? 'kse100' : 'spx500';
          const benchmarkSymbol = currency === 'PKR' ? 'KSE100' : 'SPX500';

          if (liquidAdjustedHistory.length > 0) {
            const startD = liquidAdjustedHistory[0].date;
            const endD = liquidAdjustedHistory[liquidAdjustedHistory.length - 1].date;

            const benchRes = await fetch(`/api/historical-data?assetType=${benchmarkAssetType}&symbol=${benchmarkSymbol}&startDate=${startD}&endDate=${endD}`);

            if (benchRes.ok) {
              const benchData = await benchRes.json();
              const benchPrices = (benchData.data || []).filter((p: any) => p.close > 0);

              if (benchPrices.length >= 5) {
                // Explicit types for Map to satisfy linter
                const liqMap = new Map<string, number>(liquidAdjustedHistory.map(h => [h.date, h.adjustedValue]));
                const benMap = new Map<string, number>(benchPrices.map((p: any) => [p.date, p.close]));

                const common = Array.from(liqMap.keys()).filter(d => benMap.has(d)).sort();
                const pRet: number[] = [];
                const bRet: number[] = [];

                for (let i = 1; i < common.length; i++) {
                  const curD = common[i];
                  const preD = common[i - 1];
                  const cL = liqMap.get(curD);
                  const pL = liqMap.get(preD);
                  const cB = benMap.get(curD);
                  const pB = benMap.get(preD);

                  if (cL !== undefined && pL !== undefined && cB !== undefined && pB !== undefined) {
                    if (pL > 0 && pB > 0) {
                      pRet.push((cL - pL) / pL);
                      bRet.push((cB - pB) / pB);
                    }
                  }
                }

                if (pRet.length >= 5) {
                  const meanP = pRet.reduce((a, b) => a + b, 0) / pRet.length;
                  const meanB = bRet.reduce((a, b) => a + b, 0) / bRet.length;
                  let cov = 0, varB = 0;
                  for (let k = 0; k < pRet.length; k++) {
                    cov += (pRet[k] - meanP) * (bRet[k] - meanB);
                    varB += Math.pow(bRet[k] - meanB, 2);
                  }
                  if (varB > 0) beta = cov / varB;
                }
              }
            }
          }
        } catch (e) { console.error("Beta Error", e) }

        setMetrics({
          cagr,
          xirr,
          maxDrawdown,
          volatility,
          sharpeRatio,
          beta,
          bestDay,
          worstDay,
          winningDays,
          avgDailyReturn
        });

      } catch (err) {
        console.error('[Performance Metrics] Error', err)
      } finally {
        setLoading(false)
      }
    }

    calculateMetrics();
  }, [currency, unified])


  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
          <CardDescription>Key risk and return indicators</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* CAGR */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-muted-foreground">CAGR</span>
              </div>
              <div className={`text-xl sm:text-2xl font-bold truncate ${metrics.cagr !== null && metrics.cagr >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {metrics.cagr !== null ? formatPercent(metrics.cagr, 2) : '—'}
              </div>
              <p className="text-xs text-muted-foreground">Portfolio Return (TWR)</p>
            </div>

            {/* Investor Return (IRR) */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium text-muted-foreground">Investor Return</span>
              </div>
              <div className={`text-xl sm:text-2xl font-bold truncate ${metrics.xirr !== null && metrics.xirr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {metrics.xirr !== null ? formatPercent(metrics.xirr, 2) : '—'}
              </div>
              <p className="text-xs text-muted-foreground">Money-weighted (XIRR)</p>
            </div>

            {/* Max Drawdown */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-muted-foreground">Max Drawdown</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold truncate text-red-600 dark:text-red-400">
                {metrics.maxDrawdown !== null ? formatPercent(metrics.maxDrawdown) : '—'}
              </div>
              <p className="text-xs text-muted-foreground">Largest peak-to-trough decline</p>
            </div>

            {/* Volatility */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-muted-foreground">Volatility</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold truncate text-blue-600 dark:text-blue-400">
                {metrics.volatility !== null ? formatPercent(metrics.volatility) : '—'}
              </div>
              <p className="text-xs text-muted-foreground">30-day price volatility</p>
            </div>

            {/* Sharpe Ratio */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-muted-foreground">Sharpe Ratio</span>
              </div>
              <div className={`text-xl sm:text-2xl font-bold truncate ${metrics.sharpeRatio !== null && metrics.sharpeRatio >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {metrics.sharpeRatio !== null ? metrics.sharpeRatio.toFixed(2) : '—'}
              </div>
              <p className="text-xs text-muted-foreground">Risk-adjusted return</p>
            </div>

            {/* Beta */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-medium text-muted-foreground">Beta</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold truncate text-purple-600 dark:text-purple-400">
                {metrics.beta !== null ? metrics.beta.toFixed(2) : '—'}
              </div>
              <p className="text-xs text-muted-foreground">
                {currency === 'PKR' ? 'vs KSE 100' : 'vs S&P 500'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Highlights */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Highlights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Best Day */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Best Day</div>
              {metrics.bestDay ? (
                <>
                  <div className="text-xl font-bold text-green-600 dark:text-green-400 flex items-center gap-1">
                    <ArrowUpRight className="h-4 w-4" />
                    {formatCurrency(metrics.bestDay.value, currency)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(metrics.bestDay.date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </p>
                </>
              ) : (
                <div className="text-xl font-bold text-muted-foreground">—</div>
              )}
            </div>

            {/* Worst Day */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Worst Day</div>
              {metrics.worstDay ? (
                <>
                  <div className="text-xl font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                    <ArrowDownRight className="h-4 w-4" />
                    {formatCurrency(metrics.worstDay.value, currency)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(metrics.worstDay.date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </p>
                </>
              ) : (
                <div className="text-xl font-bold text-muted-foreground">—</div>
              )}
            </div>

            {/* Winning Days */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Winning Days</div>
              <div className={`text-xl font-bold ${metrics.winningDays !== null && metrics.winningDays >= 50 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                {metrics.winningDays !== null ? `${metrics.winningDays.toFixed(0)}%` : '—'}
              </div>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </div>

            {/* Avg Daily Return */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Avg Daily Return</div>
              <div className={`text-xl font-bold flex items-center gap-1 ${metrics.avgDailyReturn !== null && metrics.avgDailyReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {metrics.avgDailyReturn !== null ? (
                  <>
                    {metrics.avgDailyReturn >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    {formatPercent(metrics.avgDailyReturn)}
                  </>
                ) : (
                  '—'
                )}
              </div>
              <p className="text-xs text-muted-foreground">Last 90 days</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


