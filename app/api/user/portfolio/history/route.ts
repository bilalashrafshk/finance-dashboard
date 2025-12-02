
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

      // Get exchange rate for PKR if unified mode
      let exchangeRate: number | null = null
      if (unified) {
        try {
          // Use the SBP economic data API to get exchange rate
          const { getSBPEconomicData } = await import('@/lib/portfolio/db-client')
          const oneMonthAgo = new Date()
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
          const exchangeResult = await getSBPEconomicData(
            'TS_GP_ER_FAERPKR_M.E00220',
            oneMonthAgo.toISOString().split('T')[0],
            new Date().toISOString().split('T')[0]
          )
          if (exchangeResult && exchangeResult.data && exchangeResult.data.length > 0) {
            // Sort by date descending to get the most recent exchange rate
            const sorted = [...exchangeResult.data].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            exchangeRate = sorted[0].value
            console.log(`[Portfolio History] Using exchange rate: ${exchangeRate} PKR/USD`)
          } else {
            console.warn('[Portfolio History] No exchange rate data available, PKR holdings will not be converted')
          }
        } catch (error) {
          console.error('[Portfolio History] Error fetching exchange rate:', error)
        }
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
      const priceFetchPromises = Array.from(uniqueAssets.entries()).map(async ([assetKey, asset]) => {
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
            console.error(`Failed to fetch historical data for ${assetKey}: ${response.status}`)
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
              console.error(`Error fetching current price for ${assetKey}:`, error)
              
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
          console.error(`Error fetching historical prices for ${assetKey}:`, error)
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

      const dailyHoldings: Record<string, { date: string, cash: number, invested: number, cashFlow: number }> = {}

      // Track cash flows by date (deposits/withdrawals)
      const cashFlowsByDate = new Map<string, number>()
      for (const trade of trades) {
        if (trade.tradeType === 'add' || trade.tradeType === 'remove') {
          const dateStr = trade.tradeDate
          const currentFlow = cashFlowsByDate.get(dateStr) || 0
          // 'add' is positive cash flow (deposit), 'remove' is negative (withdrawal)
          const flowAmount = trade.tradeType === 'add' ? trade.totalAmount : -trade.totalAmount
          cashFlowsByDate.set(dateStr, currentFlow + flowAmount)
        }
      }

      // Filter trades by currency to determine the correct start date for this specific currency view
      // This prevents the graph from showing a long flat line if the user has older trades in a different currency
      const relevantTrades = trades.filter(t => t.currency.toUpperCase() === currency.toUpperCase())

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

      // Generate date range safely
      let currentDate = new Date(actualStartDate)
      currentDate.setHours(0, 0, 0, 0)

      const maxIterations = 1000 // Safety limit to prevent infinite loops
      let iterationCount = 0

      while (currentDate <= finalEndDate && iterationCount < maxIterations) {
        iterationCount++
        const dateStr = currentDate.toISOString().split('T')[0]

        try {
          // Filter trades up to this date (inclusive)
          const tradesUntilDate = trades.filter(t => t.tradeDate <= dateStr)

          if (tradesUntilDate.length === 0) {
            // No trades yet, set to zero
            dailyHoldings[dateStr] = {
              date: dateStr,
              cash: 0,
              invested: 0,
              cashFlow: 0
            }
          } else {
            // Calculate holdings for this date
            const holdings = calculateHoldingsFromTransactions(tradesUntilDate)

            let cashBalance = 0
            let bookValue = 0 // Book Value = Cash + Current Market Value (includes unrealized P&L)

            // Get today's date string for comparison
            const todayStr = new Date().toISOString().split('T')[0]
            const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]

            holdings.forEach(h => {
              try {
                const holdingCurrency = h.currency || 'USD'
                let shouldInclude = false
                let valueToAdd = 0

                // Check if this asset should be excluded from calculation
                // If purchased today or yesterday and no price data available for the current date, exclude it
                const isToday = dateStr === todayStr
                const isYesterday = dateStr === yesterdayStr
                const purchaseDateStr = h.purchaseDate ? new Date(h.purchaseDate).toISOString().split('T')[0] : null
                const wasPurchasedToday = purchaseDateStr === todayStr
                const wasPurchasedYesterday = purchaseDateStr === yesterdayStr

                if (unified) {
                  // In unified mode, include all currencies and convert to USD
                  shouldInclude = true
                  if (h.assetType === 'cash') {
                    valueToAdd = h.quantity || 0
                  } else {
                    const assetKey = `${h.assetType}:${h.symbol.toUpperCase()}:${holdingCurrency}`
                    
                    // Exclude assets purchased today/yesterday if they don't have price data for the current date
                    if ((isToday && wasPurchasedToday) || (isToday && wasPurchasedYesterday) || 
                        (isYesterday && wasPurchasedYesterday)) {
                      if (!hasValidPriceForDate(assetKey, dateStr)) {
                        // Purchased recently and no price data for this date - exclude from calculation
                        shouldInclude = false
                      } else {
                        const historicalPrice = getPriceForDate(assetKey, dateStr, h.purchasePrice || 0)
                        valueToAdd = (h.quantity || 0) * historicalPrice
                      }
                    } else {
                      // For past dates or assets purchased earlier, use normal logic
                      const historicalPrice = getPriceForDate(assetKey, dateStr, h.purchasePrice || 0)
                      valueToAdd = (h.quantity || 0) * historicalPrice
                    }
                  }

                  // Convert to USD if not already USD
                  if (holdingCurrency !== 'USD') {
                    if (holdingCurrency === 'PKR' && exchangeRate) {
                      // Exchange rate is PKR per USD (e.g., 277.78 means 1 USD = 277.78 PKR)
                      // To convert PKR to USD: divide by exchange rate
                      valueToAdd = valueToAdd / exchangeRate
                    } else if (holdingCurrency === 'PKR' && !exchangeRate) {
                      // If no exchange rate available, skip PKR holdings in unified mode
                      console.warn(`[Portfolio History] Skipping PKR holding ${h.symbol} - no exchange rate available`)
                      shouldInclude = false
                    }
                    // For other currencies, assume 1:1 if no exchange rate (shouldn't happen for PKR)
                  }
                } else {
                  // In currency-specific mode, only include matching currency
                  if (holdingCurrency.toUpperCase() === currency.toUpperCase()) {
                    shouldInclude = true
                    if (h.assetType === 'cash') {
                      valueToAdd = h.quantity || 0
                    } else {
                      const assetKey = `${h.assetType}:${h.symbol.toUpperCase()}:${holdingCurrency}`
                      
                      // Exclude assets purchased today/yesterday if they don't have price data for the current date
                      if ((isToday && wasPurchasedToday) || (isToday && wasPurchasedYesterday) || 
                          (isYesterday && wasPurchasedYesterday)) {
                        if (!hasValidPriceForDate(assetKey, dateStr)) {
                          // Purchased recently and no price data for this date - exclude from calculation
                          shouldInclude = false
                        } else {
                          const historicalPrice = getPriceForDate(assetKey, dateStr, h.purchasePrice || 0)
                          valueToAdd = (h.quantity || 0) * historicalPrice
                        }
                      } else {
                        // For past dates or assets purchased earlier, use normal logic
                        const historicalPrice = getPriceForDate(assetKey, dateStr, h.purchasePrice || 0)
                        valueToAdd = (h.quantity || 0) * historicalPrice
                      }
                    }
                  }
                }

                if (shouldInclude) {
                  if (h.assetType === 'cash') {
                    cashBalance += valueToAdd
                  }
                  bookValue += valueToAdd
                }
              } catch (holdingError) {
                console.error(`Error processing holding ${h.symbol}:`, holdingError)
                // Continue with other holdings
              }
            })

            const cashFlow = cashFlowsByDate.get(dateStr) || 0
            dailyHoldings[dateStr] = {
              date: dateStr,
              cash: cashBalance,
              invested: bookValue, // Book Value = Cash + Market Value of Assets (includes unrealized P&L)
              cashFlow: cashFlow
            }
          }
        } catch (dateError) {
          console.error(`Error processing date ${dateStr}:`, dateError)
          // Set default values for this date
          const cashFlow = cashFlowsByDate.get(dateStr) || 0
          dailyHoldings[dateStr] = {
            date: dateStr,
            cash: 0,
            invested: 0,
            cashFlow: cashFlow
          }
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1)
      }

      if (iterationCount >= maxIterations) {
        console.warn('Date loop reached max iterations, possible infinite loop prevented')
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
            value: h.invested, // Map invested to value for frontend compatibility, but clarify it's Market Value
            marketValue: h.invested // Explicit field
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
    console.error('Get portfolio history error:', error)
    console.error('Error stack:', error.stack)
    console.error('Error message:', error.message)
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

