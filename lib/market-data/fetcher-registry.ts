import { fetchBinancePrice } from '@/lib/portfolio/binance-api'
import { fetchPKEquityPriceService } from '@/lib/prices/pk-equity-service'
import { getLatestPriceFromStockAnalysis } from '@/lib/portfolio/stockanalysis-api'

/**
 * Registry of fetcher functions for different asset types.
 * Used by the unified /api/market/price route.
 */
export const FETCHER_REGISTRY = {
  'crypto': fetchBinancePrice,
  'pk-equity': fetchPKEquityPriceService,
  'us-equity': getLatestPriceFromStockAnalysis,
} as const

export type MarketFetcherType = keyof typeof FETCHER_REGISTRY
