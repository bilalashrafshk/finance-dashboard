"use client"

import React, { useState, useMemo, useEffect } from 'react'
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts'
import { 
  TrendingUp, 
  TrendingDown, 
  Info, 
  Settings2, 
  BarChart3, 
  Scale,
  Loader2,
  Percent
} from 'lucide-react'
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import type { TrackedAsset } from './add-asset-dialog'
import type { PriceDataPoint } from '@/lib/asset-screener/metrics-calculations'
import { formatCurrency, formatPercentage } from '@/lib/asset-screener/metrics-calculations'

interface DCASimulatorProps {
  asset: TrackedAsset
  historicalData: PriceDataPoint[]
}

interface FinancialPeriod {
  period_end_date: string
  eps_diluted: string
}

interface DividendRecord {
  date: string
  dividend_amount: number
}

export function DCASimulator({ asset, historicalData }: DCASimulatorProps) {
  const [amount, setAmount] = useState(1000)
  const [frequency, setFrequency] = useState('monthly') 
  const [timeframe, setTimeframe] = useState('5y') 
  const [strategy, setStrategy] = useState('standard') 
  const [dynamicAggression, setDynamicAggression] = useState(2) 

  const [accountForDividends, setAccountForDividends] = useState(false)
  const [reinvestDividends, setReinvestDividends] = useState(false)
  
  const [financials, setFinancials] = useState<FinancialPeriod[]>([])
  const [loadingFinancials, setLoadingFinancials] = useState(false)
  const [financialsError, setFinancialsError] = useState<string | null>(null)

  const [dividends, setDividends] = useState<DividendRecord[]>([])

  // Fetch dividends on mount for PK Equities
  useEffect(() => {
    if (asset.assetType === 'pk-equity') {
      fetch(`/api/pk-equity/dividend?ticker=${encodeURIComponent(asset.symbol)}`)
        .then(res => res.json())
        .then(data => {
            if (data && data.dividends) {
                setDividends(data.dividends)
            }
        })
        .catch(err => console.error("Failed to fetch dividends", err))
    }
  }, [asset])

  // Handle toggle logic
  const handleAccountForDividendsChange = (checked: boolean) => {
    setAccountForDividends(checked)
    if (!checked) {
        setReinvestDividends(false)
    }
  }

  // Fetch financials when dynamic strategy is selected for the first time
  useEffect(() => {
    if (strategy === 'dynamic' && financials.length === 0 && !loadingFinancials && !financialsError) {
      const fetchFinancials = async () => {
        setLoadingFinancials(true)
        try {
          const res = await fetch(`/api/financials?symbol=${asset.symbol}&period=quarterly`)
          if (res.ok) {
            const data = await res.json()
            if (data.financials && data.financials.length > 0) {
              setFinancials(data.financials)
            } else {
              setFinancialsError("No historical financial data available for this asset to calculate P/E ratios.")
              setStrategy('standard')
            }
          } else {
            setFinancialsError("Failed to fetch financial data.")
            setStrategy('standard')
          }
        } catch (e) {
          setFinancialsError("Error fetching financial data.")
          setStrategy('standard')
        } finally {
          setLoadingFinancials(false)
        }
      }
      fetchFinancials()
    }
  }, [strategy, asset.symbol, financials.length, loadingFinancials, financialsError])

  // Process historical data and merge with PE if dynamic
  const dataWithPE = useMemo(() => {
    if (!historicalData.length) return []
    
    if (strategy === 'standard' || financials.length === 0) {
      return historicalData.map(d => ({
        date: d.date,
        price: d.close,
        pe: null
      }))
    }

    const sortedFinancials = [...financials].sort((a, b) => 
      new Date(a.period_end_date).getTime() - new Date(b.period_end_date).getTime()
    )

    return historicalData.map(d => {
      const pointDate = new Date(d.date)
      let ttmEps = 0
      
      const availableQuarters = sortedFinancials.filter(f => new Date(f.period_end_date) <= pointDate)
      
      if (availableQuarters.length >= 4) {
        const last4 = availableQuarters.slice(-4)
        ttmEps = last4.reduce((sum, q) => sum + (parseFloat(q.eps_diluted) || 0), 0)
      }

      let pe: number | null = null
      if (ttmEps > 0 && d.close > 0) {
        pe = d.close / ttmEps
        if (pe > 200 || pe < 0) pe = null; 
      }

      return {
        date: d.date,
        price: d.close,
        pe
      }
    })
  }, [historicalData, financials, strategy])

  const filteredData = useMemo(() => {
    if (!dataWithPE.length) return []
    const lastDate = new Date(dataWithPE[dataWithPE.length - 1].date)
    let startDate = new Date(lastDate)

    if (timeframe === '1y') startDate.setFullYear(lastDate.getFullYear() - 1)
    else if (timeframe === '3y') startDate.setFullYear(lastDate.getFullYear() - 3)
    else if (timeframe === '5y') startDate.setFullYear(lastDate.getFullYear() - 5)
    else if (timeframe === 'ytd') {
      startDate = new Date(lastDate.getFullYear(), 0, 1)
    }
    else if (timeframe === 'max') startDate = new Date(dataWithPE[0].date)

    return dataWithPE.filter(d => new Date(d.date) >= startDate)
  }, [timeframe, dataWithPE])

  const results = useMemo(() => {
    if (!filteredData.length) return null

    let totalInvested = 0
    let totalShares = 0
    let cashBalance = 0
    let totalDividendsCollected = 0
    const history: { date: string, invested: number, value: number, price: number, shares: number }[] = []
    const purchases: { date: string, amount: number, price: number, sharesBought: number, pe: number | null, type: string }[] = []
    
    // Only consider rows that have valid PE for avg calculation
    const pointsWithPE = filteredData.filter(d => d.pe !== null)
    let avgPE = 0
    let stdDevPE = 0

    if (pointsWithPE.length > 0) {
      avgPE = pointsWithPE.reduce((acc, curr) => acc + (curr.pe as number), 0) / pointsWithPE.length
      const variance = pointsWithPE.reduce((acc, curr) => acc + Math.pow((curr.pe as number) - avgPE, 2), 0) / pointsWithPE.length
      stdDevPE = Math.sqrt(variance)
    }

    let step = 1
    if (frequency === 'weekly') step = 5
    if (frequency === 'monthly') step = 21

    const dividendMap = new Map<string, number>()
    if (accountForDividends) {
      dividends.forEach(d => dividendMap.set(d.date.substring(0, 10), d.dividend_amount))
    }

    filteredData.forEach((point, i) => {
      // 1. Execute DCA Investment on scheduled days
      if (i % step === 0) {
          let currentInvestAmount = amount

          if (strategy === 'dynamic' && point.pe !== null && avgPE > 0 && stdDevPE > 0) {
            const pe = point.pe
            const zScore = (pe - avgPE) / stdDevPE
            if (zScore <= -2) {
              currentInvestAmount = amount * Math.min(4, dynamicAggression * 2)
            } else if (zScore <= -1) {
              currentInvestAmount = amount * dynamicAggression
            } else if (zScore >= 2) {
              currentInvestAmount = amount * 0.25
            } else if (zScore >= 1) {
              currentInvestAmount = amount * 0.5
            } else {
              const undervaluationFactor = avgPE / pe
              const multiplier = Math.min(Math.max(undervaluationFactor, 0.5), dynamicAggression)
              currentInvestAmount = amount * multiplier
            }
          }

          totalInvested += currentInvestAmount
          const sharesBought = currentInvestAmount / point.price
          totalShares += sharesBought

          purchases.push({
            date: point.date,
            amount: currentInvestAmount,
            price: point.price,
            sharesBought,
            pe: point.pe,
            type: 'Fiat'
          })
      }

      // 2. Process Dividends
      const dateKey = point.date.substring(0, 10)
      if (accountForDividends && dividendMap.has(dateKey)) {
          const divAmount = dividendMap.get(dateKey)!
          const payout = totalShares * divAmount
          totalDividendsCollected += payout

          if (reinvestDividends) {
              // Buy more shares immediately at current price
              const sharesBought = payout / point.price
              totalShares += sharesBought
              
              purchases.push({
                date: point.date,
                amount: payout,
                price: point.price,
                sharesBought,
                pe: point.pe,
                type: 'Dividend'
              })
          } else {
              // Cash sits in the account
              cashBalance += payout
          }
      }

      const portfolioValue = (totalShares * point.price) + cashBalance

      history.push({
        date: point.date,
        invested: parseFloat(totalInvested.toFixed(2)),
        value: parseFloat(portfolioValue.toFixed(2)),
        price: point.price,
        shares: totalShares
      })
    })

    const finalPrice = filteredData[filteredData.length - 1].price
    const finalValue = (totalShares * finalPrice) + cashBalance
    const totalReturn = finalValue - totalInvested
    const percentageReturn = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0
    const avgCost = totalShares > 0 ? (totalInvested - cashBalance) / totalShares : 0

    // Calculate Approximate CAGR
    // Using (Final / Invested) ^ (365 / DurationDays) - 1
    const startDate = new Date(filteredData[0].date)
    const endDate = new Date(filteredData[filteredData.length - 1].date)
    const daysInvested = (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)
    const yearsInvested = daysInvested / 365.25
    
    let cagr = 0
    if (yearsInvested > 0 && totalInvested > 0) {
        cagr = (Math.pow(finalValue / totalInvested, 1 / yearsInvested) - 1) * 100
    }

    return {
      history,
      totalInvested,
      finalValue,
      totalReturn,
      percentageReturn,
      avgCost,
      totalShares,
      avgPE,
      stdDevPE,
      cagr,
      totalDividendsCollected,
      cashBalance,
      purchases
    }
  }, [filteredData, amount, frequency, strategy, dynamicAggression, accountForDividends, reinvestDividends, dividends])

  if (!results) {
    return (
      <div className="p-12 text-center flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Processing historical data...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 py-4">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="text-primary" />
            DCA Simulator
          </h2>
          <p className="text-muted-foreground text-sm">
            Backtest your {asset.symbol} investment strategy.
          </p>
        </div>
        <div className="flex bg-muted p-1 rounded-lg border shadow-sm">
          <button 
            onClick={() => setStrategy('standard')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${strategy === 'standard' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground'}`}
          >
            Standard DCA
          </button>
          <button 
            onClick={() => setStrategy('dynamic')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${strategy === 'dynamic' ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground'}`}
          >
            Dynamic DCA
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        <div className="lg:col-span-1 flex flex-col gap-4">
          <div className="bg-card p-5 rounded-xl border shadow-sm">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
              <Settings2 size={16} /> Parameters
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Investment Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {asset.currency === 'PKR' ? 'Rs' : '$'}
                  </span>
                  <input 
                    type="number" 
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full pl-8 pr-3 py-2 rounded-lg border bg-background focus:ring-2 focus:ring-primary outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Frequency</label>
                <select 
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border bg-background focus:ring-2 focus:ring-primary outline-none transition-all"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Timeframe</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {['1y', '3y', '5y', 'ytd', 'max'].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`py-1.5 rounded-md text-xs font-medium uppercase border ${timeframe === tf ? 'bg-primary text-primary-foreground border-transparent' : 'border-border hover:border-primary'}`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              {asset.assetType === 'pk-equity' && dividends.length > 0 && (
                <div className="pt-4 border-t space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="account-dividends" className="text-xs font-medium cursor-pointer">Account for Dividends</Label>
                    <Switch id="account-dividends" checked={accountForDividends} onCheckedChange={handleAccountForDividendsChange} />
                  </div>
                  {accountForDividends && (
                    <div className="flex items-center justify-between">
                      <Label htmlFor="reinvest-dividends" className="text-xs font-medium cursor-pointer text-primary">Reinvest Dividends</Label>
                      <Switch id="reinvest-dividends" checked={reinvestDividends} onCheckedChange={setReinvestDividends} />
                    </div>
                  )}
                </div>
              )}

              {strategy === 'dynamic' && (
                <div className="pt-4 border-t">
                  {loadingFinancials ? (
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin"/> Loading financials...
                    </div>
                  ) : financialsError ? (
                    <div className="text-xs text-destructive">{financialsError}</div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-xs font-medium text-primary">Aggression Factor</label>
                        <span className="text-xs font-bold">{dynamicAggression}x</span>
                      </div>
                      <input 
                        type="range" min="1" max="5" step="0.5"
                        value={dynamicAggression}
                        onChange={(e) => setDynamicAggression(Number(e.target.value))}
                        className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <p className="text-[10px] text-muted-foreground mt-2 italic">
                        Increases investment by up to {dynamicAggression}x when P/E is cheap relative to its historical mean, and reduces it when expensive.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="bg-primary/10 p-4 rounded-xl border border-primary/20">
            <h4 className="text-xs font-bold text-primary mb-2 flex items-center gap-1.5 uppercase">
              <Info size={14} /> 
              {strategy === 'standard' ? 'Standard DCA' : 'Valuation DCA'}
            </h4>
            <p className="text-xs leading-relaxed text-primary/80">
              {strategy === 'standard' 
                ? "Investing a fixed amount regularly. Lowers average cost by buying more when prices are low."
                : "Uses historical P/E Ratios to adjust volume. Invests more when the asset is 'cheap' relative to its history and builds a cash buffer when expensive."}
            </p>
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col gap-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-card p-4 rounded-xl border shadow-sm col-span-2 md:col-span-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total Invested</span>
              <div className="text-lg font-bold mt-1">{formatCurrency(results.totalInvested, asset.currency, 2)}</div>
            </div>
            <div className="bg-card p-4 rounded-xl border shadow-sm">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Portfolio Value</span>
              <div className="text-lg font-bold mt-1 text-primary">{formatCurrency(results.finalValue, asset.currency, 2)}</div>
            </div>
            <div className="bg-card p-4 rounded-xl border shadow-sm">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total Return</span>
              <div className={`text-lg font-bold mt-1 flex items-center gap-1 ${results.totalReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {results.totalReturn >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                {results.percentageReturn.toFixed(1)}%
              </div>
            </div>
            <div className="bg-card p-4 rounded-xl border shadow-sm">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Est. CAGR</span>
              <div className={`text-lg font-bold mt-1 flex items-center gap-1 ${results.cagr >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {results.cagr >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                {results.cagr.toFixed(1)}%
              </div>
            </div>
            <div className="bg-card p-4 rounded-xl border shadow-sm">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Avg. Cost</span>
              <div className="text-lg font-bold mt-1">{formatCurrency(results.avgCost, asset.currency, asset.assetType === 'crypto' ? 4 : 2)}</div>
            </div>
          </div>

          <div className="bg-card p-6 rounded-2xl border shadow-sm flex-1">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold flex items-center gap-2">
                <BarChart3 size={18} /> Growth Performance
              </h3>
              <div className="flex items-center gap-4 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-border"></div>
                  <span className="text-muted-foreground">Invested</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-primary"></div>
                  <span className="text-muted-foreground">Value</span>
                </div>
              </div>
            </div>

            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={results.history} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                  <XAxis 
                    dataKey="date" 
                    tick={{fontSize: 10}} 
                    tickFormatter={(str) => {
                      try {
                        const d = new Date(str);
                        return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                      } catch (e) {
                        return str;
                      }
                    }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={30}
                    stroke="#64748b"
                  />
                  <YAxis 
                    tick={{fontSize: 10}} 
                    axisLine={false} 
                    tickLine={false} 
                    tickFormatter={(val) => val >= 1000 ? (val/1000).toFixed(1) + 'k' : val.toString()}
                    stroke="#64748b"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '12px', 
                      border: '1px solid #e2e8f0', 
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      backgroundColor: '#ffffff',
                      color: '#0f172a'
                    }}
                    labelFormatter={(label) => {
                      try {
                        return new Date(label).toLocaleDateString();
                      } catch (e) {
                        return String(label);
                      }
                    }}
                    formatter={(value: number, name: string) => {
                      return [formatCurrency(value, asset.currency, 2), name === 'investing' ? 'Total Invested' : name]
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    name="Portfolio Value"
                    stroke="#2563eb" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorValue)" 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="invested" 
                    name="Total Invested"
                    stroke="#94a3b8" 
                    strokeWidth={1.5}
                    fill="transparent"
                    strokeDasharray="5 5"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <div className="mt-6 flex flex-wrap gap-4 items-center justify-between p-4 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-[10px] text-muted-foreground font-bold uppercase">End Price</div>
                  <div className="text-sm font-semibold">{formatCurrency(filteredData[filteredData.length - 1]?.price || 0, asset.currency, asset.assetType === 'crypto' ? 4 : 2)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground font-bold uppercase">Total Shares/Coins</div>
                  <div className="text-sm font-semibold">{results.totalShares.toFixed(4)}</div>
                </div>
                {accountForDividends && (
                  <div>
                    <div className="text-[10px] text-green-600 font-bold uppercase">Dividends Collected</div>
                    <div className="text-sm font-semibold text-green-600">{formatCurrency(results.totalDividendsCollected, asset.currency, 2)}</div>
                  </div>
                )}
                {strategy === 'dynamic' && (
                  <>
                    <div>
                      <div className="text-[10px] text-primary font-bold uppercase">Avg Hist P/E</div>
                      <div className="text-sm font-semibold">
                        {results.avgPE > 0 ? `${results.avgPE.toFixed(1)}x` : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-primary font-bold uppercase">Std Dev P/E</div>
                      <div className="text-sm font-semibold">
                        {results.stdDevPE > 0 ? results.stdDevPE.toFixed(2) : 'N/A'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-card p-6 rounded-2xl border shadow-sm flex-1">
            <h3 className="font-semibold mb-4">Transaction History</h3>
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2 text-right">Price</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-right">Shares</th>
                    {strategy === 'dynamic' && <th className="px-4 py-2 text-right">P/E</th>}
                  </tr>
                </thead>
                <tbody>
                  {results.purchases.slice().reverse().map((p, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3">{new Date(p.date).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-[10px] font-medium border ${p.type === 'Dividend' ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 'bg-primary/10 text-primary border-primary/20'}`}>
                          {p.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(p.price, asset.currency, asset.assetType === 'crypto' ? 4 : 2)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(p.amount, asset.currency, 2)}</td>
                      <td className="px-4 py-3 text-right">{p.sharesBought.toFixed(4)}</td>
                      {strategy === 'dynamic' && (
                        <td className="px-4 py-3 text-right">{p.pe !== null ? p.pe.toFixed(2) : '-'}</td>
                      )}
                    </tr>
                  ))}
                  {results.purchases.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No transactions recorded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  )
}
