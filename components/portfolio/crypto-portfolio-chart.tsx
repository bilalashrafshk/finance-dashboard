"use client"

import { PortfolioHistoryChart } from "./portfolio-history-chart"
import { Holding } from "@/lib/portfolio/types"

interface CryptoPortfolioChartProps {
  holdings: Holding[]
  currency: string
}

export function CryptoPortfolioChart({ holdings, currency }: CryptoPortfolioChartProps) {
  // We don't need the holdings prop anymore as data is fetched via API using assetType
  // But we keep the prop for compatibility with parent usage (if any logic depends on empty check, we can check holdings.length)

  if (!holdings || holdings.filter(h => h.assetType === 'crypto').length === 0) {
    return null
  }

  return (
    <PortfolioHistoryChart
      currency={currency}
      assetType="crypto"
      title="Crypto Portfolio Value"
    />
  )
}
