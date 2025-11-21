/**
 * Batch Data Fetcher for Screener
 * 
 * Uses centralized routes to fetch all data needed for screener calculations:
 * - Latest prices (via /api/prices/batch)
 * - Company profiles and financials (via /api/financials/batch)
 * 
 * All data fetching goes through centralized routes, which handle:
 * - Database checks
 * - External API fetching if data is missing
 * - Automatic data storage
 */
export interface ScreenerBatchData {
  price: {
    price: number
    date: string
  }
  profile: {
    sector: string
    industry: string
    face_value: number
    market_cap: number | null
  }
  financials: Array<{
    period_end_date: string
    eps_basic: number | null
    eps_diluted: number | null
  }>
}

export async function fetchScreenerBatchData(
  symbols: string[],
  assetType: string = 'pk-equity',
  baseUrl?: string
): Promise<Record<string, ScreenerBatchData>> {
  if (!symbols || symbols.length === 0) {
    return {}
  }

  const apiBaseUrl = baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')

  try {
    const symbolsUpper = symbols.map(s => s.toUpperCase())

    // 1. Fetch prices via centralized batch API
    const priceResponse = await fetch(`${apiBaseUrl}/api/prices/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assets: symbolsUpper.map(symbol => ({
          type: assetType,
          symbol: symbol
        }))
      })
    })

    if (!priceResponse.ok) {
      throw new Error(`Price batch API failed: ${priceResponse.status}`)
    }

    const priceData = await priceResponse.json()
    const priceMap = new Map<string, { price: number; date: string }>()

    symbolsUpper.forEach(symbol => {
      const key = `${assetType}:${symbol}`
      const result = priceData.results?.[key]
      if (result && result.price !== null && !result.error) {
        priceMap.set(symbol, {
          price: result.price,
          date: result.date || new Date().toISOString().split('T')[0]
        })
      }
    })

    // 2. Fetch financials and profiles via centralized batch API
    const financialsResponse = await fetch(`${apiBaseUrl}/api/financials/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: symbolsUpper,
        assetType: assetType
      })
    })

    if (!financialsResponse.ok) {
      throw new Error(`Financials batch API failed: ${financialsResponse.status}`)
    }

    const financialsData = await financialsResponse.json()
    const financialsMap = financialsData.results || {}

    // 3. Combine all data by symbol
    // Return partial data - include stocks with price even if profile/financials are missing
    const results: Record<string, ScreenerBatchData> = {}

    symbolsUpper.forEach(symbol => {
      const price = priceMap.get(symbol)
      const financialData = financialsMap[symbol]

      // Require price (critical), but allow missing profile/financials
      if (!price) {
        return
      }

      // If we have financial data, use it; otherwise use defaults
      if (financialData) {
        results[symbol] = {
          price: {
            price: price.price,
            date: price.date
          },
          profile: {
            sector: financialData.profile.sector,
            industry: financialData.profile.industry,
            face_value: financialData.profile.face_value,
            market_cap: financialData.profile.market_cap
          },
          financials: financialData.financials || [] // Last 4 quarters (or empty if < 4)
        }
      } else {
        // Stock has price but no profile/financials - return partial data
        results[symbol] = {
          price: {
            price: price.price,
            date: price.date
          },
          profile: {
            sector: 'Unknown',
            industry: 'Unknown',
            face_value: 10, // Default face value
            market_cap: null
          },
          financials: [] // No financials available
        }
      }
    })

    return results
  } catch (error: any) {
    console.error('[Screener Batch Data] Error:', error)
    throw error
  }
}

