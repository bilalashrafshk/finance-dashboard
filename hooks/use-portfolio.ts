import useSWR from 'swr'
import { useMemo } from 'react'
import type { Holding } from '@/lib/portfolio/types'
import { parseSymbolToBinance } from '@/lib/portfolio/binance-api'

// Fetcher function that handles auth
const fetcher = async (url: string) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
  const res = await fetch(url, {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
  })
  
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.')
    // @ts-ignore
    error.info = await res.json()
    // @ts-ignore
    error.status = res.status
    throw error
  }
  
  return res.json()
}

// POST fetcher for batch prices
const batchPriceFetcher = async ([url, assets]: [string, any[]]) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
  const res = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ assets })
  })

  if (!res.ok) {
    throw new Error('Failed to fetch prices')
  }

  return res.json()
}

export function usePortfolio() {
  // 1. Fetch Holdings Structure (ETag supported by browser automatically)
  // We use fast=true and fetchPrices=false to get just the structure quickly
  const { data: holdingsData, error: holdingsError, mutate: mutateHoldings, isLoading: holdingsLoading } = useSWR(
    '/api/user/holdings?fast=true&fetchPrices=false',
    fetcher,
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000, // 5 seconds
      keepPreviousData: true,
    }
  )

  // 2. Prepare assets list for price fetching
  // We need to stabilize this array to prevent SWR infinite loops
  const rawHoldings = holdingsData?.holdings || []
  const assetsKey = rawHoldings.length > 0 
    ? JSON.stringify(rawHoldings.map((h: any) => `${h.assetType}:${h.symbol}`)) 
    : null

  const assetsForPriceFetch = rawHoldings.map((h: any) => {
    if (h.assetType === 'crypto') {
      const binanceSymbol = parseSymbolToBinance(h.symbol)
      return { type: 'crypto', symbol: binanceSymbol }
    }
    return { type: h.assetType, symbol: h.symbol }
  })

  // 3. Fetch Prices (Poll every 60s)
  const { data: pricesData, isValidating: pricesValidating } = useSWR(
    assetsKey ? ['/api/prices/batch', assetsForPriceFetch] : null,
    batchPriceFetcher,
    {
      refreshInterval: 60000, // 1 minute
      dedupingInterval: 10000,
      keepPreviousData: true,
    }
  )

  // 4. Combine Holdings with Prices
  // Memoize to prevent reference changes on every render (DIAGNOSTIC: This fixes Issue #1)
  const holdings: Holding[] = useMemo(() => {
    return rawHoldings.map((h: any) => {
      const assetType = h.assetType
      let symbol = h.symbol
      if (assetType === 'crypto') {
        symbol = parseSymbolToBinance(h.symbol)
      }
      
      // For commodities, always use purchase price (no unrealized P&L until sold/realized)
      if (assetType === 'commodities') {
        return {
          ...h,
          currentPrice: h.purchasePrice
        }
      }
      
      // Key format from batch API: "type:SYMBOL"
      const priceKey = `${assetType}:${symbol.toUpperCase()}`
      
      let currentPrice = h.purchasePrice // Default fallback
      
      if (pricesData?.results?.[priceKey]) {
        const result = pricesData.results[priceKey]
        if (result.price !== null && !result.error) {
          currentPrice = result.price
        }
      } else if (h.currentPrice) {
          // Fallback to price from holdings API (if any, though we requested fetchPrices=false, 
          // fast load might return stored prices from DB)
          currentPrice = h.currentPrice
      }

      return {
        ...h,
        currentPrice
      }
    })
  }, [rawHoldings, pricesData?.results])

  // 5. Fetch Exchange Rate (PKR)
  const { data: exchangeRateData } = useSWR(
    '/api/sbp/economic-data?seriesKey=TS_GP_ER_FAERPKR_M.E00220&limit=1',
    fetcher,
    {
      dedupingInterval: 3600000, // 1 hour
      revalidateOnFocus: false
    }
  )

  const exchangeRate = exchangeRateData?.data?.[0]?.value || null

  return {
    holdings,
    netDeposits: holdingsData?.netDeposits || {},
    loading: holdingsLoading && !holdingsData,
    error: holdingsError,
    mutate: mutateHoldings,
    exchangeRate,
    pricesValidating
  }
}

