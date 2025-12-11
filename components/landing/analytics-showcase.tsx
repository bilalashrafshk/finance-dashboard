'use client'

import React from 'react'
import { TrendingUp, TrendingDown, Zap, LineChart, Award, AlertCircle } from 'lucide-react'

export default function AnalyticsShowcase() {
  const performanceMetrics = [
    {
      name: 'AAPL (Apple)',
      ytdReturn: '+28.3%',
      sharpeRatio: 1.85,
      maxDrawdown: '-12.4%',
      vs5YearAvg: '+8.2%',
      trend: 'up',
      riskAdjustedReturn: '2.1x'
    },
    {
      name: 'TCS (PSX)',
      ytdReturn: '+15.7%',
      sharpeRatio: 1.42,
      maxDrawdown: '-8.9%',
      vs5YearAvg: '+2.1%',
      trend: 'up',
      riskAdjustedReturn: '1.7x'
    },
    {
      name: 'BTC/USDT',
      ytdReturn: '+42.5%',
      sharpeRatio: 0.92,
      maxDrawdown: '-25.3%',
      vs5YearAvg: '+35.8%',
      trend: 'up',
      riskAdjustedReturn: '1.3x'
    },
    {
      name: 'HBL (PSX)',
      ytdReturn: '-5.2%',
      sharpeRatio: 0.65,
      maxDrawdown: '-18.7%',
      vs5YearAvg: '-3.4%',
      trend: 'down',
      riskAdjustedReturn: '0.8x'
    }
  ]

  const riskMetrics = [
    {
      metric: 'Sharpe Ratio',
      description: 'Risk-adjusted returns per unit of risk taken',
      formula: '(Return - Risk-Free Rate) / Volatility',
      useCase: 'Compare investments on equal risk basis'
    },
    {
      metric: 'Sortino Ratio',
      description: 'Focuses only on downside volatility',
      formula: '(Return - Target) / Downside Deviation',
      useCase: 'Better for asymmetric risk profiles'
    },
    {
      metric: 'Maximum Drawdown',
      description: 'Largest peak-to-trough decline',
      formula: '(Trough Value - Peak Value) / Peak Value',
      useCase: 'Understand worst-case scenarios'
    },
    {
      metric: 'CAGR',
      description: 'Compound Annual Growth Rate',
      formula: '(End Value / Start Value)^(1/Years) - 1',
      useCase: 'Standardize returns over time periods'
    },
    {
      metric: 'Beta',
      description: 'Systematic risk vs market',
      formula: 'Covariance(Asset, Market) / Variance(Market)',
      useCase: 'Measure market sensitivity'
    },
    {
      metric: 'Volatility (Std Dev)',
      description: 'Historical price fluctuation',
      formula: 'Square root of variance of returns',
      useCase: 'Assess investment risk'
    }
  ]

  return (
    <section className="py-24 px-4 bg-slate-900/30 border-y border-slate-800">
      <div className="max-w-7xl mx-auto space-y-20">
        {/* Section 1: Asset Performance Analysis */}
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-4xl lg:text-5xl font-bold text-white">
              Asset <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">Performance Analysis</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl">
              Identify which assets have outperformed market benchmarks and which ones are underperforming with comprehensive historic data analysis.
            </p>
          </div>

          {/* Performance Comparison Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  <th className="px-6 py-4 text-left font-semibold text-slate-300">Asset</th>
                  <th className="px-6 py-4 text-right font-semibold text-slate-300">YTD Return</th>
                  <th className="px-6 py-4 text-right font-semibold text-slate-300">Sharpe Ratio</th>
                  <th className="px-6 py-4 text-right font-semibold text-slate-300">Max Drawdown</th>
                  <th className="px-6 py-4 text-right font-semibold text-slate-300">vs 5Y Avg</th>
                  <th className="px-6 py-4 text-right font-semibold text-slate-300">Risk-Adj Return</th>
                  <th className="px-6 py-4 text-center font-semibold text-slate-300">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {performanceMetrics.map((metric, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-white">{metric.name}</td>
                    <td className={`px-6 py-4 text-right font-semibold ${metric.trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {metric.ytdReturn}
                    </td>
                    <td className="px-6 py-4 text-right text-blue-400">{metric.sharpeRatio.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right text-amber-400">{metric.maxDrawdown}</td>
                    <td className={`px-6 py-4 text-right ${metric.trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {metric.vs5YearAvg}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-cyan-400">{metric.riskAdjustedReturn}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${metric.trend === 'up'
                          ? 'bg-emerald-400/20 text-emerald-300'
                          : 'bg-red-400/20 text-red-300'
                        }`}>
                        {metric.trend === 'up' ? (
                          <>
                            <TrendingUp className="w-3 h-3" />
                            Outperforming
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-3 h-3" />
                            Underperforming
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Risk-Adjusted Returns Deep Dive */}
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-4xl lg:text-5xl font-bold text-white">
              Risk-Adjusted Returns{' '}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Explained</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl">
              Calculate and compare returns relative to the risk taken. Higher Sharpe/Sortino ratios mean better risk-adjusted performance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {riskMetrics.map((item, idx) => (
              <div key={idx} className="p-6 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-blue-600/50 hover:bg-slate-900/80 transition-all">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 bg-blue-600/20 rounded-lg">
                    <LineChart className="w-5 h-5 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">{item.metric}</h3>
                </div>
                <p className="text-slate-300 text-sm mb-4">{item.description}</p>
                <div className="space-y-3 pt-4 border-t border-slate-800">
                  <div>
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Formula</div>
                    <div className="text-xs text-slate-300 font-mono bg-slate-950/50 p-2 rounded">
                      {item.formula}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Use Case</div>
                    <div className="text-sm text-slate-300">{item.useCase}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Historic Data Analysis */}
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-4xl lg:text-5xl font-bold text-white">
              Historic Data <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">Analysis</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl">
              Analyze multi-year performance trends, seasonal patterns, and statistical behaviors to make data-driven decisions.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Historic Trends */}
            <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-2 mb-6">
                <LineChart className="w-6 h-6 text-cyan-400" />
                <h3 className="text-xl font-semibold text-white">Multi-Year Performance Tracking</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-300">1-Year Performance</span>
                    <span className="text-sm font-bold text-emerald-400">+18.2%</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full w-[73%] bg-gradient-to-r from-emerald-500 to-emerald-400" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-300">3-Year CAGR</span>
                    <span className="text-sm font-bold text-blue-400">+14.7%</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full w-[59%] bg-gradient-to-r from-blue-500 to-blue-400" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-300">5-Year CAGR</span>
                    <span className="text-sm font-bold text-cyan-400">+12.3%</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full w-[49%] bg-gradient-to-r from-cyan-500 to-cyan-400" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-300">10-Year CAGR</span>
                    <span className="text-sm font-bold text-amber-400">+9.8%</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full w-[39%] bg-gradient-to-r from-amber-500 to-amber-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Statistical Insights */}
            <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-xl">
              <div className="flex items-center gap-2 mb-6">
                <Zap className="w-6 h-6 text-yellow-400" />
                <h3 className="text-xl font-semibold text-white">Statistical Insights</h3>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-slate-950/50 rounded-lg border border-slate-700">
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Average Volatility (5Y)</div>
                  <div className="text-2xl font-bold text-slate-200">18.5%</div>
                  <div className="text-xs text-slate-500 mt-1">Annual price fluctuation</div>
                </div>
                <div className="p-4 bg-slate-950/50 rounded-lg border border-slate-700">
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Worst Drawdown (5Y)</div>
                  <div className="text-2xl font-bold text-red-400">-34.2%</div>
                  <div className="text-xs text-slate-500 mt-1">Peak to trough decline</div>
                </div>
                <div className="p-4 bg-slate-950/50 rounded-lg border border-slate-700">
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Positive Years Ratio</div>
                  <div className="text-2xl font-bold text-emerald-400">80%</div>
                  <div className="text-xs text-slate-500 mt-1">Years with positive returns</div>
                </div>
                <div className="p-4 bg-slate-950/50 rounded-lg border border-slate-700">
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Recovery Time (Avg)</div>
                  <div className="text-2xl font-bold text-cyan-400">4.2 months</div>
                  <div className="text-xs text-slate-500 mt-1">From drawdown to recovery</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Outperformance vs Underperformance */}
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-4xl lg:text-5xl font-bold text-white">
              Identify What <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">Works & What Doesn't</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl">
              Conviction Pays reveals which assets consistently beat their benchmarks and which ones drag down your portfolio returns.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Outperforming Assets */}
            <div className="p-8 bg-gradient-to-br from-emerald-950/20 to-emerald-900/10 border border-emerald-900/50 rounded-xl">
              <div className="flex items-center gap-2 mb-8">
                <TrendingUp className="w-6 h-6 text-emerald-400" />
                <h3 className="text-xl font-semibold text-white">Outperforming Assets</h3>
              </div>
              <div className="space-y-4">
                {[
                  { name: 'AAPL', benchmark: 'S&P 500', outperformance: '+8.3%', years: '7/10' },
                  { name: 'BTC', benchmark: 'Crypto Index', outperformance: '+12.5%', years: '6/10' },
                  { name: 'TCS', benchmark: 'KSE-100', outperformance: '+4.2%', years: '8/10' },
                  { name: 'MSFT', benchmark: 'NASDAQ', outperformance: '+6.1%', years: '7/10' }
                ].map((item, idx) => (
                  <div key={idx} className="p-4 bg-slate-900/50 border border-emerald-900/30 rounded-lg hover:border-emerald-700/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-semibold text-white">{item.name}</div>
                        <div className="text-xs text-slate-400">vs {item.benchmark}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-emerald-400">{item.outperformance}</div>
                        <div className="text-xs text-slate-400">{item.years} years</div>
                      </div>
                    </div>
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full w-[70%] bg-emerald-500" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Underperforming Assets */}
            <div className="p-8 bg-gradient-to-br from-red-950/20 to-red-900/10 border border-red-900/50 rounded-xl">
              <div className="flex items-center gap-2 mb-8">
                <TrendingDown className="w-6 h-6 text-red-400" />
                <h3 className="text-xl font-semibold text-white">Underperforming Assets</h3>
              </div>
              <div className="space-y-4">
                {[
                  { name: 'GLD', benchmark: 'Gold Spot', underperformance: '-2.3%', years: '3/10' },
                  { name: 'HBL', benchmark: 'KSE-100', underperformance: '-5.8%', years: '4/10' },
                  { name: 'TLT', benchmark: 'Bond Index', underperformance: '-3.1%', years: '5/10' },
                  { name: 'TSLA', benchmark: 'NASDAQ', underperformance: '-1.5%', years: '6/10' }
                ].map((item, idx) => (
                  <div key={idx} className="p-4 bg-slate-900/50 border border-red-900/30 rounded-lg hover:border-red-700/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-semibold text-white">{item.name}</div>
                        <div className="text-xs text-slate-400">vs {item.benchmark}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-red-400">{item.underperformance}</div>
                        <div className="text-xs text-slate-400">{item.years} years</div>
                      </div>
                    </div>
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full w-[30%] bg-red-500" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

