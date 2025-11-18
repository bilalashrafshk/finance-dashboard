"use client"

import { useState, useEffect } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Edit2, Trash2, ArrowUpDown, Search, Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Holding, AssetType } from "@/lib/portfolio/types"
import { ASSET_TYPE_LABELS } from "@/lib/portfolio/types"
import {
  calculateInvested,
  calculateCurrentValue,
  calculateGainLoss,
  calculateGainLossPercent,
  formatCurrency,
  formatPercent,
} from "@/lib/portfolio/portfolio-utils"
import { calculatePKEquityGain, getGainPeriodLabel, type GainPeriod } from "@/lib/portfolio/pk-equity-gains"
import { calculateCryptoGain, getGainPeriodLabel as getCryptoGainPeriodLabel } from "@/lib/portfolio/crypto-gains"
import Link from "next/link"
import { generateAssetSlug } from "@/lib/asset-screener/url-utils"

interface HoldingsTableProps {
  holdings: Holding[]
  onEdit: (holding: Holding) => void
  onDelete: (id: string) => void
}

type SortField = 'symbol' | 'assetType' | 'currentValue' | 'gainLoss' | 'gainLossPercent'
type SortDirection = 'asc' | 'desc'

export function HoldingsTable({ holdings, onEdit, onDelete }: HoldingsTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetType | 'all'>('all')
  const [sortField, setSortField] = useState<SortField>('symbol')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  
  // PK Equity gain period selector
  const [pkEquityGainPeriod, setPkEquityGainPeriod] = useState<GainPeriod>('purchase')
  const [pkEquityGains, setPkEquityGains] = useState<Map<string, { gain: number; gainPercent: number; loading: boolean }>>(new Map())
  
  // Crypto gain period selector
  const [cryptoGainPeriod, setCryptoGainPeriod] = useState<GainPeriod>('purchase')
  const [cryptoGains, setCryptoGains] = useState<Map<string, { gain: number; gainPercent: number; loading: boolean }>>(new Map())
  
  // Check if there are any PK equities or crypto
  const hasPKEquities = holdings.some(h => h.assetType === 'pk-equity')
  const hasCrypto = holdings.some(h => h.assetType === 'crypto')
  
  // Load gains for PK equities when period changes
  useEffect(() => {
    if (!hasPKEquities) return
    
    const pkEquityHoldings = holdings.filter(h => h.assetType === 'pk-equity')
    
    const loadGains = async () => {
      // Set all to loading
      const loadingMap = new Map<string, { gain: number; gainPercent: number; loading: boolean }>()
      pkEquityHoldings.forEach(h => {
        loadingMap.set(h.id, { gain: 0, gainPercent: 0, loading: true })
      })
      setPkEquityGains(loadingMap)
      
      // Calculate gains
      for (const holding of pkEquityHoldings) {
        try {
          const gainCalc = await calculatePKEquityGain(holding, pkEquityGainPeriod)
          if (gainCalc) {
            setPkEquityGains(prev => {
              const newMap = new Map(prev)
              newMap.set(holding.id, {
                gain: gainCalc.gain * holding.quantity, // Total gain (quantity * price gain)
                gainPercent: gainCalc.gainPercent,
                loading: false,
              })
              return newMap
            })
          } else {
            // Fallback to purchase gain if historical data not available
            const fallbackGain = calculateGainLoss(holding)
            const fallbackGainPercent = calculateGainLossPercent(holding)
            setPkEquityGains(prev => {
              const newMap = new Map(prev)
              newMap.set(holding.id, {
                gain: fallbackGain,
                gainPercent: fallbackGainPercent,
                loading: false,
              })
              return newMap
            })
          }
        } catch (error) {
          console.error(`Error calculating gain for ${holding.symbol}:`, error)
          // Fallback to purchase gain
          const fallbackGain = calculateGainLoss(holding)
          const fallbackGainPercent = calculateGainLossPercent(holding)
          setPkEquityGains(prev => {
            const newMap = new Map(prev)
            newMap.set(holding.id, {
              gain: fallbackGain,
              gainPercent: fallbackGainPercent,
              loading: false,
            })
            return newMap
          })
        }
      }
    }
    
    loadGains()
  }, [pkEquityGainPeriod, holdings, hasPKEquities])

  // Load gains for crypto when period changes
  useEffect(() => {
    if (!hasCrypto) return
    
    const cryptoHoldings = holdings.filter(h => h.assetType === 'crypto')
    
    const loadGains = async () => {
      // Set all to loading
      const loadingMap = new Map<string, { gain: number; gainPercent: number; loading: boolean }>()
      cryptoHoldings.forEach(h => {
        loadingMap.set(h.id, { gain: 0, gainPercent: 0, loading: true })
      })
      setCryptoGains(loadingMap)
      
      // Calculate gains
      for (const holding of cryptoHoldings) {
        try {
          const gainCalc = await calculateCryptoGain(holding, cryptoGainPeriod)
          if (gainCalc) {
            setCryptoGains(prev => {
              const newMap = new Map(prev)
              newMap.set(holding.id, {
                gain: gainCalc.gain * holding.quantity, // Total gain (quantity * price gain)
                gainPercent: gainCalc.gainPercent,
                loading: false,
              })
              return newMap
            })
          } else {
            // Fallback to purchase gain if historical data not available
            const fallbackGain = calculateGainLoss(holding)
            const fallbackGainPercent = calculateGainLossPercent(holding)
            setCryptoGains(prev => {
              const newMap = new Map(prev)
              newMap.set(holding.id, {
                gain: fallbackGain,
                gainPercent: fallbackGainPercent,
                loading: false,
              })
              return newMap
            })
          }
        } catch (error) {
          console.error(`Error calculating gain for ${holding.symbol}:`, error)
          // Fallback to purchase gain
          const fallbackGain = calculateGainLoss(holding)
          const fallbackGainPercent = calculateGainLossPercent(holding)
          setCryptoGains(prev => {
            const newMap = new Map(prev)
            newMap.set(holding.id, {
              gain: fallbackGain,
              gainPercent: fallbackGainPercent,
              loading: false,
            })
            return newMap
          })
        }
      }
    }
    
    loadGains()
  }, [cryptoGainPeriod, holdings, hasCrypto])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const filteredAndSorted = holdings
    .filter((holding) => {
      const matchesSearch =
        holding.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        holding.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesFilter = assetTypeFilter === 'all' || holding.assetType === assetTypeFilter
      return matchesSearch && matchesFilter
    })
    .sort((a, b) => {
      let aValue: string | number
      let bValue: string | number

      switch (sortField) {
        case 'symbol':
          aValue = a.symbol
          bValue = b.symbol
          break
        case 'assetType':
          aValue = a.assetType
          bValue = b.assetType
          break
        case 'currentValue':
          aValue = calculateCurrentValue(a)
          bValue = calculateCurrentValue(b)
          break
        case 'gainLoss':
          aValue = calculateGainLoss(a)
          bValue = calculateGainLoss(b)
          break
        case 'gainLossPercent':
          aValue = calculateGainLossPercent(a)
          bValue = calculateGainLossPercent(b)
          break
        default:
          return 0
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
      } else {
        return sortDirection === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number)
      }
    })

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button variant="ghost" size="sm" className="-ml-3 h-8 data-[state=open]:bg-accent" onClick={() => handleSort(field)}>
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  )

  return (
    <>
      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by symbol or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={assetTypeFilter} onValueChange={(value) => setAssetTypeFilter(value as AssetType | 'all')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(ASSET_TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasPKEquities && (
          <Select value={pkEquityGainPeriod} onValueChange={(value) => setPkEquityGainPeriod(value as GainPeriod)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="PK Equity Gain Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="purchase">Since Purchase</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="ytd">YTD</SelectItem>
              <SelectItem value="365d">365 Days</SelectItem>
            </SelectContent>
          </Select>
        )}
        {hasCrypto && (
          <Select value={cryptoGainPeriod} onValueChange={(value) => setCryptoGainPeriod(value as GainPeriod)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Crypto Gain Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="purchase">Since Purchase</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="ytd">YTD</SelectItem>
              <SelectItem value="365d">365 Days</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortButton field="symbol">Symbol</SortButton>
              </TableHead>
              <TableHead>
                <SortButton field="assetType">Type</SortButton>
              </TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Purchase Price</TableHead>
              <TableHead className="text-right">Current Price</TableHead>
              <TableHead className="text-right">Invested</TableHead>
              <TableHead className="text-right">Current Value</TableHead>
              <TableHead className="text-right">
                <SortButton field="gainLoss">Gain/Loss</SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton field="gainLossPercent">Gain/Loss %</SortButton>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  No holdings found. Add your first holding to get started!
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSorted.map((holding) => {
                const invested = calculateInvested(holding)
                const currentValue = calculateCurrentValue(holding)
                
                // Use period-specific gain for PK equities or crypto, otherwise use purchase gain
                const isPKEquity = holding.assetType === 'pk-equity'
                const isCrypto = holding.assetType === 'crypto'
                const gainData = isPKEquity 
                  ? pkEquityGains.get(holding.id) 
                  : isCrypto 
                    ? cryptoGains.get(holding.id)
                    : null
                const gainLoss = (isPKEquity || isCrypto) && gainData && !gainData.loading 
                  ? gainData.gain 
                  : calculateGainLoss(holding)
                const gainLossPercent = (isPKEquity || isCrypto) && gainData && !gainData.loading
                  ? gainData.gainPercent
                  : calculateGainLossPercent(holding)
                const isPositive = gainLoss >= 0
                const isLoadingGain = (isPKEquity || isCrypto) && gainData?.loading
                const gainPeriod = isPKEquity ? pkEquityGainPeriod : isCrypto ? cryptoGainPeriod : 'purchase'
                const gainPeriodLabel = isPKEquity 
                  ? getGainPeriodLabel(gainPeriod)
                  : isCrypto 
                    ? getCryptoGainPeriodLabel(gainPeriod)
                    : ''

                // Check if asset type is supported in asset screener
                const supportedTypes: AssetType[] = ['us-equity', 'pk-equity', 'crypto', 'metals', 'kse100', 'spx500']
                const isSupportedInScreener = supportedTypes.includes(holding.assetType)
                const assetSlug = isSupportedInScreener ? generateAssetSlug(holding.assetType, holding.symbol) : null

                return (
                  <TableRow key={holding.id}>
                    <TableCell className="font-medium">
                      <div>
                        {assetSlug ? (
                          <Link 
                            href={`/asset-screener/${assetSlug}`}
                            className="hover:underline hover:text-primary transition-colors"
                          >
                            <div>{holding.symbol}</div>
                            {holding.name !== holding.symbol && (
                              <div className="text-xs text-muted-foreground">{holding.name}</div>
                            )}
                          </Link>
                        ) : (
                          <>
                            <div>{holding.symbol}</div>
                            {holding.name !== holding.symbol && (
                              <div className="text-xs text-muted-foreground">{holding.name}</div>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{ASSET_TYPE_LABELS[holding.assetType]}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{holding.quantity.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatCurrency(holding.purchasePrice, holding.currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(holding.currentPrice, holding.currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(invested, holding.currency)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(currentValue, holding.currency)}</TableCell>
                    <TableCell className={`text-right ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {isLoadingGain ? (
                        <Loader2 className="h-4 w-4 animate-spin inline-block" />
                      ) : (
                        formatCurrency(gainLoss, holding.currency)
                      )}
                      {(isPKEquity || isCrypto) && !isLoadingGain && gainPeriod !== 'purchase' && (
                        <div className="text-xs text-muted-foreground">
                          {gainPeriodLabel}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={`text-right ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {isLoadingGain ? (
                        <Loader2 className="h-4 w-4 animate-spin inline-block" />
                      ) : (
                        formatPercent(gainLossPercent)
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => onEdit(holding)}
                          title="Edit holding"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setDeleteConfirmId(holding.id)}
                          title="Delete holding"
                          className="hover:bg-red-50 dark:hover:bg-red-950/20"
                        >
                          <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this holding from your portfolio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirmId) {
                  onDelete(deleteConfirmId)
                  setDeleteConfirmId(null)
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

