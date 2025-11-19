"use client"

import { useState, useEffect } from "react"
import { Loader2, RefreshCw, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCurrency, formatCompactNumber } from "@/lib/asset-screener/metrics-calculations"

interface AssetFinancialsViewProps {
  symbol: string
  assetType: string
}

interface Profile {
  sector: string
  industry: string
  market_cap: number
  shares_outstanding: number
  float_shares: number
  face_value: number
  last_updated: string
}

interface FinancialStatement {
  period_end_date: string
  period_type: string
  // ... all the fields we defined in schema
  [key: string]: any
}

/**
 * Format date as fiscal quarter (e.g., "Q3 2025")
 * Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec
 */
function formatFiscalQuarter(dateStr: string): string {
  const date = new Date(dateStr)
  const month = date.getMonth() + 1 // 1-12
  const year = date.getFullYear()
  
  let quarter: number
  if (month >= 1 && month <= 3) quarter = 1
  else if (month >= 4 && month <= 6) quarter = 2
  else if (month >= 7 && month <= 9) quarter = 3
  else quarter = 4
  
  return `Q${quarter} ${year}`
}

export function AssetFinancialsView({ symbol, assetType }: AssetFinancialsViewProps) {
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [financials, setFinancials] = useState<FinancialStatement[]>([])
  const [period, setPeriod] = useState<'quarterly' | 'annual'>('quarterly')
  const [viewMode, setViewMode] = useState<'overview' | 'ratios' | 'statements'>('overview')
  const [visibleCount, setVisibleCount] = useState(5)

  const fetchFinancials = async () => {
    setLoading(true)
    // Reset visible count when fetching new data (likely period change)
    setVisibleCount(5)
    try {
      const res = await fetch(`/api/financials?symbol=${symbol}&period=${period}`)
      if (!res.ok) throw new Error('Failed to fetch data')
      const data = await res.json()
      setProfile(data.profile)
      setFinancials(data.financials)
      
      // Check if data is stale (> 10 days)
      if (data.profile?.last_updated && !updating) {
          const lastUpdated = new Date(data.profile.last_updated);
          const now = new Date();
          const diffDays = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
          
          if (diffDays > 10) {
              console.log(`[Financials] Data stale (${Math.round(diffDays)} days), triggering update...`);
              triggerUpdate(false);
          }
      }
      
      // If no data found, try to trigger an update automatically once
      if (data.count === 0 && !updating) {
          triggerUpdate(false);
      }
      
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  
  const triggerUpdate = async (force: boolean = false) => {
      setUpdating(true);
      try {
          const res = await fetch(`/api/financials/update?symbol=${symbol}${force ? '&force=true' : ''}`);
          if (res.ok) {
              const data = await res.json();
              if (data.status === 'fresh') {
                  // Data is fresh, no need to refetch everything if we just loaded it
                  console.log('[Financials] Data is already up to date.');
              } else {
                  // Data updated, refresh
                  fetchFinancials();
              }
          } else {
              setError("Failed to update data from source");
          }
      } catch (e) {
          setError("Update failed");
      } finally {
          setUpdating(false);
      }
  }

  useEffect(() => {
    fetchFinancials()
  }, [symbol, period])

  if (loading && !financials.length) {
    return <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  if (error && !financials.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-destructive gap-2">
        <AlertCircle className="h-6 w-6" />
        <p>{error}</p>
        <Button variant="outline" onClick={triggerUpdate} disabled={updating}>
            {updating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Retry Update
        </Button>
      </div>
    )
  }
  
  // Helper to get safe value
  const val = (row: any, key: string) => row[key] ? parseFloat(row[key]) : 0;

  // Ratios Calculation
  const calculateRatios = (f: any) => {
      const revenue = val(f, 'revenue');
      const netIncome = val(f, 'net_income');
      const equity = val(f, 'total_equity');
      const assets = val(f, 'total_assets');
      const debt = val(f, 'total_debt');
      const currentAssets = val(f, 'total_current_assets');
      const currentLiabilities = val(f, 'total_current_liabilities');
      const inventory = val(f, 'inventory');
      
      return {
          grossMargin: revenue ? (val(f, 'gross_profit') / revenue) * 100 : null,
          operatingMargin: revenue ? (val(f, 'operating_income') / revenue) * 100 : null,
          netMargin: revenue ? (netIncome / revenue) * 100 : null,
          roe: equity ? (netIncome / equity) * 100 : null,
          roa: assets ? (netIncome / assets) * 100 : null,
          debtToEquity: equity ? debt / equity : null,
          currentRatio: currentLiabilities ? currentAssets / currentLiabilities : null,
          quickRatio: currentLiabilities ? (currentAssets - inventory) / currentLiabilities : null,
      };
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
            <Button 
                variant={viewMode === 'overview' ? "default" : "outline"} 
                onClick={() => setViewMode('overview')}
                size="sm"
            >
                Overview
            </Button>
            <Button 
                variant={viewMode === 'ratios' ? "default" : "outline"} 
                onClick={() => setViewMode('ratios')}
                size="sm"
            >
                Ratios
            </Button>
            <Button 
                variant={viewMode === 'statements' ? "default" : "outline"} 
                onClick={() => setViewMode('statements')}
                size="sm"
            >
                Detailed Statements
            </Button>
        </div>
        
        <div className="flex items-center gap-2">
            <select 
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={period}
                onChange={(e) => setPeriod(e.target.value as any)}
            >
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
            </select>
            
            <Button variant="ghost" size="icon" onClick={triggerUpdate} disabled={updating} title="Refresh Data from Source">
                <RefreshCw className={`h-4 w-4 ${updating ? 'animate-spin' : ''}`} />
            </Button>
        </div>
      </div>

      {/* OVERVIEW VIEW */}
      {viewMode === 'overview' && profile && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           <Card>
             <CardHeader className="pb-2"><CardDescription>Sector</CardDescription></CardHeader>
             <CardContent><div className="text-lg font-medium">{profile.sector}</div></CardContent>
           </Card>
           <Card>
             <CardHeader className="pb-2"><CardDescription>Industry</CardDescription></CardHeader>
             <CardContent><div className="text-lg font-medium">{profile.industry}</div></CardContent>
           </Card>
           <Card>
             <CardHeader className="pb-2"><CardDescription>Market Cap</CardDescription></CardHeader>
             <CardContent><div className="text-lg font-medium">{formatCompactNumber(profile.market_cap)}</div></CardContent>
           </Card>
           <Card>
             <CardHeader className="pb-2"><CardDescription>Shares Outstanding</CardDescription></CardHeader>
             <CardContent><div className="text-lg font-medium">{formatCompactNumber(profile.shares_outstanding)}</div></CardContent>
           </Card>
           <Card>
             <CardHeader className="pb-2"><CardDescription>Face Value</CardDescription></CardHeader>
             <CardContent><div className="text-lg font-medium">{profile.face_value ? parseFloat(profile.face_value).toFixed(2) : 'N/A'}</div></CardContent>
           </Card>
           
           {/* Latest Quarter Metrics */}
           {financials.length > 0 && (
             <>
               <Card>
                 <CardHeader className="pb-2"><CardDescription>Latest Revenue</CardDescription></CardHeader>
                 <CardContent><div className="text-lg font-medium">{formatCompactNumber(financials[0].revenue)}</div></CardContent>
               </Card>
               <Card>
                 <CardHeader className="pb-2"><CardDescription>Latest Net Income</CardDescription></CardHeader>
                 <CardContent><div className="text-lg font-medium">{formatCompactNumber(financials[0].net_income)}</div></CardContent>
               </Card>
               <Card>
                 <CardHeader className="pb-2"><CardDescription>EPS (Diluted)</CardDescription></CardHeader>
                 <CardContent><div className="text-lg font-medium">{financials[0].eps_diluted}</div></CardContent>
               </Card>
               <Card>
                 <CardHeader className="pb-2"><CardDescription>Free Cash Flow</CardDescription></CardHeader>
                 <CardContent><div className={`text-lg font-medium ${val(financials[0], 'free_cash_flow') < 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {formatCompactNumber(financials[0].free_cash_flow)}
                 </div></CardContent>
               </Card>
             </>
           )}
        </div>
      )}

      {/* RATIOS VIEW */}
      {viewMode === 'ratios' && financials.length > 0 && (
        <div className="border rounded-md">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Metric</TableHead>
                        {financials.slice(0, visibleCount).map((f, i) => (
                            <TableHead key={i}>{formatFiscalQuarter(f.period_end_date)}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {[
                        { label: 'Gross Margin %', key: 'grossMargin', format: (v: number) => v.toFixed(2) + '%' },
                        { label: 'Operating Margin %', key: 'operatingMargin', format: (v: number) => v.toFixed(2) + '%' },
                        { label: 'Net Profit Margin %', key: 'netMargin', format: (v: number) => v.toFixed(2) + '%' },
                        { label: 'Return on Equity (ROE) %', key: 'roe', format: (v: number) => v.toFixed(2) + '%' },
                        { label: 'Return on Assets (ROA) %', key: 'roa', format: (v: number) => v.toFixed(2) + '%' },
                        { label: 'Debt / Equity', key: 'debtToEquity', format: (v: number) => v.toFixed(2) },
                        { label: 'Current Ratio', key: 'currentRatio', format: (v: number) => v.toFixed(2) },
                        { label: 'Quick Ratio', key: 'quickRatio', format: (v: number) => v.toFixed(2) },
                    ].map((row) => (
                        <TableRow key={row.key}>
                            <TableCell className="font-medium">{row.label}</TableCell>
                            {financials.slice(0, visibleCount).map((f, i) => {
                                const ratios = calculateRatios(f);
                                // @ts-ignore
                                const val = ratios[row.key];
                                return <TableCell key={i}>{val !== null ? row.format(val) : '-'}</TableCell>
                            })}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            
            {financials.length > visibleCount && (
              <div className="flex justify-center my-4">
                <Button 
                  variant="outline" 
                  onClick={() => setVisibleCount(prev => Math.min(prev + 5, financials.length))}
                >
                  Load More ({financials.length - visibleCount} remaining)
                </Button>
              </div>
            )}
        </div>
      )}

      {/* STATEMENTS VIEW */}
      {viewMode === 'statements' && financials.length > 0 && (
        <Tabs defaultValue="income" className="w-full">
            <TabsList>
                <TabsTrigger value="income">Income Statement</TabsTrigger>
                <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
                <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
            </TabsList>
            
            {['income', 'balance', 'cashflow'].map(statementType => (
                <TabsContent key={statementType} value={statementType} className="border rounded-md mt-4">
                    <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[200px]">Item ({period})</TableHead>
                                {financials.slice(0, visibleCount).map((f, i) => (
                                    <TableHead key={i}>{formatFiscalQuarter(f.period_end_date)}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {/* Define rows based on statement type */}
                            {(statementType === 'income' ? [
                                { k: 'revenue', l: 'Total Revenue' },
                                { k: 'cost_of_revenue', l: 'Cost of Revenue' },
                                { k: 'gross_profit', l: 'Gross Profit', bold: true },
                                { k: 'operating_expenses', l: 'Operating Expenses' },
                                { k: 'operating_income', l: 'Operating Income (EBIT)', bold: true },
                                { k: 'interest_expense', l: 'Interest Expense' },
                                { k: 'interest_income', l: 'Interest Income' },
                                { k: 'currency_gain_loss', l: 'Currency Gain/Loss' },
                                { k: 'pretax_income', l: 'Pretax Income' },
                                { k: 'income_tax_expense', l: 'Tax Expense' },
                                { k: 'net_income', l: 'Net Income', bold: true },
                                { k: 'eps_diluted', l: 'EPS (Diluted)' },
                            ] : statementType === 'balance' ? [
                                // Assets
                                { k: 'cash_and_equivalents', l: 'Cash & Equivalents' },
                                { k: 'short_term_investments', l: 'Short Term Investments' },
                                { k: 'accounts_receivable', l: 'Accounts Receivable' },
                                { k: 'accrued_interest_receivable', l: 'Accrued Interest Receivable' },
                                { k: 'other_receivables', l: 'Other Receivables' },
                                { k: 'restricted_cash', l: 'Restricted Cash' },
                                { k: 'other_current_assets', l: 'Other Current Assets' },
                                { k: 'inventory', l: 'Inventory' },
                                { k: 'total_current_assets', l: 'Total Current Assets', bold: true },
                                { k: 'property_plant_equipment', l: 'Property, Plant & Equipment' },
                                { k: 'goodwill', l: 'Goodwill' },
                                { k: 'other_intangible_assets', l: 'Other Intangible Assets' },
                                { k: 'long_term_deferred_tax_assets', l: 'Long-Term Deferred Tax Assets' },
                                { k: 'other_long_term_assets', l: 'Other Long-Term Assets' },
                                { k: 'total_assets', l: 'Total Assets', bold: true },
                                // Liabilities
                                { k: 'accounts_payable', l: 'Accounts Payable' },
                                { k: 'accrued_expenses', l: 'Accrued Expenses' },
                                { k: 'accrued_interest_payable', l: 'Accrued Interest Payable' },
                                { k: 'interest_bearing_deposits', l: 'Interest Bearing Deposits' },
                                { k: 'non_interest_bearing_deposits', l: 'Non-Interest Bearing Deposits' },
                                { k: 'total_deposits', l: 'Total Deposits', bold: true },
                                { k: 'short_term_borrowings', l: 'Short-Term Borrowings' },
                                { k: 'current_portion_long_term_debt', l: 'Current Portion of Long-Term Debt' },
                                { k: 'current_portion_leases', l: 'Current Portion of Leases' },
                                { k: 'current_income_taxes_payable', l: 'Current Income Taxes Payable' },
                                { k: 'other_current_liabilities', l: 'Other Current Liabilities' },
                                { k: 'total_current_liabilities', l: 'Total Current Liabilities', bold: true },
                                { k: 'long_term_debt', l: 'Long-Term Debt' },
                                { k: 'long_term_leases', l: 'Long-Term Leases' },
                                { k: 'long_term_unearned_revenue', l: 'Long-Term Unearned Revenue' },
                                { k: 'pension_post_retirement_benefits', l: 'Pension & Post-Retirement Benefits' },
                                { k: 'long_term_deferred_tax_liabilities', l: 'Long-Term Deferred Tax Liabilities' },
                                { k: 'other_long_term_liabilities', l: 'Other Long-Term Liabilities' },
                                { k: 'total_liabilities', l: 'Total Liabilities', bold: true },
                                // Equity
                                { k: 'retained_earnings', l: 'Retained Earnings' },
                                { k: 'total_equity', l: 'Total Equity', bold: true },
                            ] : [
                                { k: 'net_income', l: 'Net Income' },
                                { k: 'operating_cash_flow', l: 'Operating Cash Flow', bold: true },
                                { k: 'capital_expenditures', l: 'Capital Expenditures' },
                                { k: 'free_cash_flow', l: 'Free Cash Flow', bold: true },
                                { k: 'dividends_paid', l: 'Dividends Paid' },
                                { k: 'change_in_working_capital', l: 'Change in Working Capital' },
                            ]).map((row) => (
                                <TableRow key={row.k} className={row.bold ? "bg-muted/30 font-medium" : ""}>
                                    <TableCell>{row.l}</TableCell>
                                    {financials.slice(0, visibleCount).map((f, i) => (
                                        <TableCell key={i}>
                                            {row.k.includes('eps') 
                                                ? f[row.k] 
                                                : formatCompactNumber(f[row.k])}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    </div>
                    
                    {financials.length > visibleCount && (
                      <div className="flex justify-center mt-4">
                        <Button 
                          variant="outline" 
                          onClick={() => setVisibleCount(prev => Math.min(prev + 5, financials.length))}
                        >
                          Load More ({financials.length - visibleCount} remaining)
                        </Button>
                      </div>
                    )}
                </TabsContent>
            ))}
        </Tabs>
      )}

      {financials.length === 0 && !loading && (
        <div className="text-center py-10 text-muted-foreground">
            No financial data available for {symbol}.
            {viewMode !== 'overview' && " Try switching to Overview to see if profile data exists."}
        </div>
      )}
    </div>
  )
}

