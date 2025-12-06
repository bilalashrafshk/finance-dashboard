
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Pool } from 'pg'
import { calculateHoldingsFromTransactions, getCurrentPrice } from '@/lib/portfolio/transaction-utils'
import { Trade } from '@/lib/portfolio/transaction-utils'
import { Holding } from '@/lib/portfolio/types'
import { parseSymbolToBinance } from '@/lib/portfolio/binance-api'

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL or POSTGRES_URL environment variable is required')
  }

  return new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  })
}

interface HistoricalValue {
  date: string
  totalValue: number
  invested: number
  pnl: number
  currency: string
  cashFlow?: number // Net cash flow on this date (deposits - withdrawals)
}

// GET - Get historical portfolio value
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const pool = getPool()
    const client = await pool.connect()

    try {
      const url = new URL(request.url)
      const currency = url.searchParams.get('currency') || 'USD'
      const unified = url.searchParams.get('unified') === 'true'
      const daysParam = url.searchParams.get('days')
      const isAllTime = daysParam === 'ALL'
      const days = daysParam && !isAllTime ? parseInt(daysParam) : 30

      // Get historical exchange rates for PKR if unified mode
      // Create a month-based map (YYYY-MM -> rate) for historical lookups
      // Also store the latest rate as a fallback
      const exchangeRateMap = new Map<string, number>() // YYYY-MM -> rate
      let latestExchangeRate: number | null = null

      if (unified) {
        try {
          const { getSBPEconomicData } = await import('@/lib/portfolio/db-client')
          // Get all available exchange rate data (no date restriction) for historical lookups
          const exchangeResult = await getSBPEconomicData('TS_GP_ER_FAERPKR_M.E00220')
          if (exchangeResult && exchangeResult.data && exchangeResult.data.length > 0) {
            // Sort by date ascending
            const sorted = [...exchangeResult.data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

            // Create a month-based map (YYYY-MM -> rate)
            // Store the latest rate for each month (in case there are multiple entries per month)
            for (const item of sorted) {
              const date = new Date(item.date)
              const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
              // Always use the latest value for each month (overwrite if multiple entries exist)
              exchangeRateMap.set(monthKey, item.value)
            }

            // Store the latest rate as fallback
            latestExchangeRate = sorted[sorted.length - 1].value
          }
        } catch (error) {
          // Error fetching exchange rate data
        }
      }

      // Helper function to find the exchange rate for a given date
      // Uses month-based lookup (YYYY-MM) and falls back to latest past rate from that date
      const getExchangeRateForDate = (dateStr: string): number | null => {
        if (exchangeRateMap.size === 0) {
          return latestExchangeRate // Fallback to latest if map is empty
        }

        // Convert date to month key (YYYY-MM)
        const date = new Date(dateStr)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

        // Try exact month match first
        if (exchangeRateMap.has(monthKey)) {
          return exchangeRateMap.get(monthKey)!
        }

        // Look back up to 12 months for the nearest available rate
        for (let i = 1; i <= 12; i++) {
          const checkDate = new Date(date)
          checkDate.setMonth(checkDate.getMonth() - i)
          const checkKey = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}`
          if (exchangeRateMap.has(checkKey)) {
            return exchangeRateMap.get(checkKey)!
          }
        }

        // If no rate found in last 12 months, find the latest past rate from all available rates
        // Sort all month keys and find the most recent one that is <= target date
        const allMonthKeys = Array.from(exchangeRateMap.keys())
          .filter(key => {
            // Compare month keys (YYYY-MM format)
            return key <= monthKey
          })
          .sort()
          .reverse() // Most recent first

        if (allMonthKeys.length > 0) {
          // Return the most recent past rate
          return exchangeRateMap.get(allMonthKeys[0])!
        }

        // If no past rate found at all (shouldn't happen if we have data), use latest as last resort
        return latestExchangeRate
      }

      // 1. Get all trades
      const tradesResult = await client.query(
        `SELECT id, user_id, holding_id, trade_type, asset_type, symbol, name, quantity,
                price, total_amount, currency, trade_date, notes, created_at
         FROM user_trades
         WHERE user_id = $1
         ORDER BY trade_date ASC, created_at ASC`,
        [user.id]
      )

      const trades: Trade[] = tradesResult.rows.map(row => {
        // Ensure trade_date is properly formatted
        let tradeDate: string
        if (row.trade_date instanceof Date) {
          tradeDate = row.trade_date.toISOString().split('T')[0]
        } else if (typeof row.trade_date === 'string') {
          tradeDate = row.trade_date.split('T')[0]
        } else {
          // Fallback: use current date if invalid
          tradeDate = new Date().toISOString().split('T')[0]
        }

        return {
          id: row.id,
          userId: row.user_id,
          holdingId: row.holding_id,
          tradeType: row.trade_type,
          assetType: row.asset_type,
          symbol: row.symbol || '',
          name: row.name || '',
          quantity: parseFloat(row.quantity) || 0,
          price: parseFloat(row.price) || 0,
          totalAmount: parseFloat(row.total_amount) || 0,
          currency: row.currency || 'USD',
          tradeDate: tradeDate,
          notes: row.notes,
          createdAt: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
        }
      }).filter(t => t.tradeDate) // Filter out any trades with invalid dates

      if (trades.length === 0) {
        return NextResponse.json(
          { success: true, history: [] },
          {
            headers: {
              'Cache-Control': 'private, max-age=60, must-revalidate',
            },
          }
        )
      }

      // 2. Generate date range
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - days)

      // Identify all unique assets to fetch history for
      const uniqueAssets = new Map<string, { assetType: string; symbol: string; currency: string }>()
      trades.forEach(t => {
        if (t.assetType !== 'cash') {
          const key = `${t.assetType}:${t.symbol.toUpperCase()}:${t.currency}`
          if (!uniqueAssets.has(key)) {
            uniqueAssets.set(key, {
              assetType: t.assetType,
              symbol: t.symbol.toUpperCase(),
              currency: t.currency || 'USD'
            })
          }
        }
      })

      // 3. Pre-fetch historical prices for all assets in the date range using centralized route
      // This creates a map: assetKey -> date -> price for quick lookups
      const historicalPriceMap = new Map<string, Map<string, number>>()
      const todayStr = new Date().toISOString().split('T')[0]
      const baseUrl = request.nextUrl.origin

      // Fetch historical prices for each unique asset using centralized /api/historical-data route
      // Optimize: Fetch in parallel to avoid waterfall
      // Skip commodities - they don't have market prices (e.g., "cloth lawn" is just what you paid)
      const priceFetchPromises = Array.from(uniqueAssets.entries())
        .filter(([assetKey, asset]) => asset.assetType !== 'commodities')
        .map(async ([assetKey, asset]) => {
          try {
            const priceMap = new Map<string, number>()

            // Convert crypto symbols to Binance format (e.g., ETH -> ETHUSDT)
            let symbolToFetch = asset.symbol
            if (asset.assetType === 'crypto') {
              symbolToFetch = parseSymbolToBinance(asset.symbol)
            }

            // Use centralized historical data route (same as crypto portfolio chart)
            // Note: We could add date range for optimization, but keeping it simple like crypto chart
            const historicalDataUrl = `${baseUrl}/api/historical-data?assetType=${asset.assetType}&symbol=${encodeURIComponent(symbolToFetch)}`

            const response = await fetch(historicalDataUrl)
            if (!response.ok) {
              return { assetKey, priceMap }
            }

            const apiData = await response.json()
            const dbRecords = apiData.data || []

            // Build a map of date -> price
            dbRecords.forEach((record: any) => {
              const price = record.adjusted_close || record.close
              if (price && price > 0) {
                priceMap.set(record.date, price)
              }
            })

            // If today's price is not in historical data, try to fetch current price
            // If we fail to get current price, fallback to last known price
            if (!priceMap.has(todayStr)) {
              try {
                const currentPrice = await getCurrentPrice(asset.assetType, asset.symbol, asset.currency)
                if (currentPrice && currentPrice > 0) {
                  priceMap.set(todayStr, currentPrice)
                } else {
                  // Try to find the latest available price in priceMap
                  let latestDate = '';
                  let latestPrice = 0;
                  for (const [date, price] of priceMap.entries()) {
                    if (date > latestDate) {
                      latestDate = date;
                      latestPrice = price;
                    }
                  }
                  if (latestPrice > 0) {
                    priceMap.set(todayStr, latestPrice);
                  }
                }
              } catch (error) {
                // Error fetching current price

                // Fallback to latest historical price if current price fetch fails
                let latestDate = '';
                let latestPrice = 0;
                for (const [date, price] of priceMap.entries()) {
                  if (date > latestDate) {
                    latestDate = date;
                    latestPrice = price;
                  }
                }
                if (latestPrice > 0) {
                  priceMap.set(todayStr, latestPrice);
                }
              }
            }

            return { assetKey, priceMap }
          } catch (error) {
            return { assetKey, priceMap: new Map<string, number>() }
          }
        })

      const results = await Promise.all(priceFetchPromises)
      results.forEach(result => {
        if (result.priceMap.size > 0) {
          historicalPriceMap.set(result.assetKey, result.priceMap)
        }
      })

      // Helper function to check if we have valid historical price data for a date
      // Returns true if we have actual historical data (not fallback)
      const hasValidPriceForDate = (assetKey: string, dateStr: string): boolean => {
        const priceMap = historicalPriceMap.get(assetKey)
        if (!priceMap || priceMap.size === 0) {
          return false
        }

        // Check if we have exact date match
        if (priceMap.has(dateStr)) {
          return true
        }

        // Check if we have a date on or before this date (valid historical data)
        const dates = Array.from(priceMap.keys()).sort().reverse()
        for (const date of dates) {
          if (date <= dateStr) {
            return true
          }
        }

        return false
      }

      // Helper function to get price for a specific date
      // Falls back to closest earlier date, then purchase price, then 0
      const getPriceForDate = (assetKey: string, dateStr: string, fallbackPrice: number): number => {
        const priceMap = historicalPriceMap.get(assetKey)
        if (!priceMap) {
          // No historical data, use fallback (purchase price)
          return fallbackPrice
        }

        // Try exact date first
        if (priceMap.has(dateStr)) {
          return priceMap.get(dateStr)!
        }

        // Find closest earlier date
        const dates = Array.from(priceMap.keys()).sort().reverse()
        for (const date of dates) {
          if (date <= dateStr) {
            return priceMap.get(date)!
          }
        }

        // No historical price found, use fallback
        return fallbackPrice
      }

      const dailyHoldings: Record<string, {
        date: string,
        cash: number,
        invested: number,
        cashFlow: number,
        exchangeRate?: number | null,
        marketValue: number
      }> = {}

      // Track cash flows by date (deposits/withdrawals)
      // In unified mode, convert all cash flows to USD
      // In currency-specific mode, only include cashflows for that currency
      const cashFlowsByDate = new Map<string, number>()
      for (const trade of trades) {
        if (trade.tradeType === 'add' || trade.tradeType === 'remove') {
          // Filter by currency when NOT in unified mode
          if (!unified && trade.currency.toUpperCase() !== currency.toUpperCase()) {
            continue // Skip cashflows from other currencies
          }

          const dateStr = trade.tradeDate
          const currentFlow = cashFlowsByDate.get(dateStr) || 0
          // 'add' is positive cash flow (deposit), 'remove' is negative (withdrawal)
          let flowAmount = trade.tradeType === 'add' ? trade.totalAmount : -trade.totalAmount

          // Convert to USD if unified mode and trade is in PKR
          // Use historical exchange rate for the trade date
          if (unified && trade.currency === 'PKR') {
            const rateForDate = getExchangeRateForDate(dateStr)
            if (rateForDate) {
              flowAmount = flowAmount / rateForDate
            }
          }

          cashFlowsByDate.set(dateStr, currentFlow + flowAmount)
        }
      }

      // Filter trades by currency to determine the correct start date for this specific currency view
      // This prevents the graph from showing a long flat line if the user has older trades in a different currency
      // In unified mode, include all trades (don't filter by currency)
      const relevantTrades = unified
        ? trades // In unified mode, use all trades
        : trades.filter(t => t.currency.toUpperCase() === currency.toUpperCase())

      if (relevantTrades.length === 0) {
        return NextResponse.json(
          { success: true, history: [] },
          {
            headers: {
              'Cache-Control': 'private, max-age=60, must-revalidate',
            },
          }
        )
      }

      // Generate daily points
      // Start from the first RELEVANT trade date or requested start date
      const firstTradeDate = new Date(relevantTrades[0].tradeDate)

      let actualStartDate: Date
      if (isAllTime) {
        actualStartDate = firstTradeDate
      } else {
        // If filtering by days, start at startDate, unless first trade was later
        actualStartDate = firstTradeDate > startDate ? firstTradeDate : startDate
      }

      // Ensure we don't go beyond today
      const today = new Date()
      today.setHours(23, 59, 59, 999)
      const finalEndDate = endDate > today ? today : endDate

      // OPTIMIZED ALGORITHM: Incremental Updates
      // Instead of recalculating holdings from scratch for every day (O(D*T)),
      // we maintain the current state and apply trades incrementally as we move forward in time (O(D+T)).

      // 1. Sort trades by date for efficient processing
      // already sorted by query, but ensure it
      const sortedTrades = [...trades].sort((a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime())

      // 2. State variables for the incremental loop
      // Map of "assetType:symbol:currency" -> Token quantity
      const currentHoldingsQuantities = new Map<string, number>()
      // Map of "assetType:symbol:currency" -> Total Invested Amount (Cost Basis)
      const currentHoldingsInvested = new Map<string, number>()
      // Map of "assetType:symbol:currency" -> Average Buy Price (for commodities)
      const currentHoldingsAvgPrice = new Map<string, number>()
      // Map of "currency" -> Cash Balance
      const currentCashBalances = new Map<string, number>()

      let currentTotalInvested = 0 // Total cost basis of current holdings

      // 3. Initialize loop variables
      let currentDate = new Date(actualStartDate)
      currentDate.setHours(0, 0, 0, 0)

      const maxIterations = 20000 // increased limit to support ~54 years of data
      let iterationCount = 0
      let tradeIndex = 0

      // Advance tradeIndex to the start date
      // We need to apply all trades BEFORE actualStartDate to establish the initial state
      const startDateStr = actualStartDate.toISOString().split('T')[0]

      // Process trades strictly BEFORE the start date to build initial state
      while (tradeIndex < sortedTrades.length) {
        const trade = sortedTrades[tradeIndex]
        if (trade.tradeDate >= startDateStr) break;

        // Apply trade to state
        processTrade(trade, currentHoldingsQuantities, currentHoldingsInvested, currentHoldingsAvgPrice, currentCashBalances)
        tradeIndex++
      }

      // Helper function to process a single trade and update state
      function processTrade(
        trade: Trade,
        quantities: Map<string, number>,
        invested: Map<string, number>,
        avgPrices: Map<string, number>,
        cashBalances: Map<string, number>
      ) {
        // Handle Cash
        if (trade.assetType === 'cash') {
          const currency = trade.currency || 'USD'
          const currentCash = cashBalances.get(currency) || 0
          if (trade.tradeType === 'add') {
            cashBalances.set(currency, currentCash + trade.totalAmount)
          } else {
            cashBalances.set(currency, currentCash - trade.totalAmount)
          }
          return
        }

        const assetKey = `${trade.assetType}:${trade.symbol.toUpperCase()}:${trade.currency || 'USD'}`
        const currentQty = quantities.get(assetKey) || 0
        const currentInvested = invested.get(assetKey) || 0

        const tradeCurrency = trade.currency || 'USD'
        const currentCash = cashBalances.get(tradeCurrency) || 0

        if (trade.tradeType === 'buy') {
          // Update Quantity
          const newQty = currentQty + trade.quantity
          quantities.set(assetKey, newQty)

          // Update Invested Amount
          const newInvested = currentInvested + trade.totalAmount
          invested.set(assetKey, newInvested)

          // Update Average Price (Cost Basis per unit)
          if (newQty > 0) {
            avgPrices.set(assetKey, newInvested / newQty)
          }

          // Deduct Cash (Buying reduces cash in that currency)
          cashBalances.set(tradeCurrency, currentCash - trade.totalAmount)

        } else if (trade.tradeType === 'sell') {
          // Update Quantity
          const newQty = Math.max(0, currentQty - trade.quantity)
          quantities.set(assetKey, newQty)

          // Update Invested Amount (Proportional reduction)
          // If we sell 50% of holdings, we reduce invested amount by 50%
          let costBasisRemoved = 0
          if (currentQty > 0) {
            const ratio = trade.quantity / currentQty
            costBasisRemoved = currentInvested * ratio
          }
          const newInvested = Math.max(0, currentInvested - costBasisRemoved)
          invested.set(assetKey, newInvested)

          // Add Cash (Selling increases cash in that currency)
          // totalAmount is the PROCEEDS from sale
          cashBalances.set(tradeCurrency, currentCash + trade.totalAmount)
        }
      }

      // 4. Main Loop: Iterate day by day
      while (currentDate <= finalEndDate && iterationCount < maxIterations) {
        iterationCount++
        const dateStr = currentDate.toISOString().split('T')[0]

        // 4a. Apply all trades that happened ON this date
        while (tradeIndex < sortedTrades.length) {
          const trade = sortedTrades[tradeIndex]
          if (trade.tradeDate > dateStr) break; // Future trade

          if (trade.tradeDate === dateStr) {
            processTrade(trade, currentHoldingsQuantities, currentHoldingsInvested, currentHoldingsAvgPrice, currentCashBalances)
          }
          tradeIndex++
        }

        // 4b. Calculate Total Portfolio Value for this date
        let dailyMarketValue = 0 // Value of assets (current Holdings * Price on this date)
        let processedInvested = 0 // Total cost basis of current holdings

        // Iterate through all currently held assets
        for (const [assetKey, qty] of currentHoldingsQuantities.entries()) {
          if (qty <= 0.000001) continue; // Skip empty holdings

          const investedAmount = currentHoldingsInvested.get(assetKey) || 0
          processedInvested += investedAmount

          const [type, symbol, currencyCode] = assetKey.split(':')

          // Determine Price for this date
          let assetValue = 0

          // Commodities case: always use purchase price/avg price (no market data)
          if (type === 'commodities') {
            const avgPrice = currentHoldingsAvgPrice.get(assetKey) || 0
            assetValue = qty * avgPrice
          } else {
            // Market assets: use historical price
            if (hasValidPriceForDate(assetKey, dateStr)) {
              const price = getPriceForDate(assetKey, dateStr, 0)
              if (price > 0) {
                assetValue = qty * price
              } else {
                // Fallback to cost basis if price is missing but valid date
                assetValue = investedAmount
              }
            } else {
              // Check if purchased recently (today/yesterday)
              // If so, use cost basis. If old holding with no price, might be 0 or cost basis.
              // To avoid drops, fallback to cost basis if no price found
              assetValue = investedAmount
            }
          }

          // Handle Currency Conversion for Unified Mode
          if (unified && currencyCode !== 'USD') {
            if (currencyCode === 'PKR') {
              const rateForDate = getExchangeRateForDate(dateStr)
              if (rateForDate) {
                assetValue = assetValue / rateForDate
                // Note: investedAmount is in original currency, so if we wanted totalInvested in USD we'd convert it too
                // But for now we just track market value
              }
            }
          } else if (!unified && currencyCode.toUpperCase() !== currency.toUpperCase()) {
            // In currency specific mode, skip assets of other currencies
            continue;
          }

          dailyMarketValue += assetValue
        }

        // Calculate Cash Value
        let dailyCashValue = 0
        if (unified) {
          // Sum all cash balances converted to USD
          for (const [cashCurrency, amount] of currentCashBalances.entries()) {
            let amountInUSD = amount
            if (cashCurrency === 'PKR') {
              const rateForDate = getExchangeRateForDate(dateStr)
              if (rateForDate) {
                amountInUSD = amount / rateForDate
              }
            }
            dailyCashValue += amountInUSD
          }
        } else {
          // Only include cash for the strict currency requested
          dailyCashValue = currentCashBalances.get(currency) || 0
        }

        const cashFlow = cashFlowsByDate.get(dateStr) || 0

        let exchangeRateUsed: number | null = null
        if (unified && exchangeRateMap.size > 0) {
          exchangeRateUsed = getExchangeRateForDate(dateStr)
        }

        dailyHoldings[dateStr] = {
          date: dateStr,
          cash: dailyCashValue,
          invested: dailyMarketValue + dailyCashValue, // Keeping 'invested' as Total Value for backward compat
          cashFlow: cashFlow,
          exchangeRate: exchangeRateUsed,
          marketValue: dailyMarketValue + dailyCashValue // Explicit field
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1)
      }

      if (iterationCount >= maxIterations) {
        // Date loop reached max iterations, possible infinite loop prevented
      }

      // Sort by date to ensure chronological order
      const sortedHistory = Object.values(dailyHoldings).sort((a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      )

      // Cache for 1 minute (portfolio history changes frequently with transactions)
      return NextResponse.json(
        {
          success: true, history: sortedHistory.map((h: any) => ({
            ...h,
            value: h.marketValue, // Map marketValue to value for frontend
          }))
        },
        {
          headers: {
            'Cache-Control': 'private, max-age=60, must-revalidate', // 1 minute cache
            'X-History-Count': sortedHistory.length.toString(),
          },
        }
      )

    } finally {
      client.release()
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get portfolio history',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

