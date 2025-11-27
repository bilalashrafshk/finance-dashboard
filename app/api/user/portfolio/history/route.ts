
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
      const daysParam = url.searchParams.get('days')
      const isAllTime = daysParam === 'ALL'
      const days = daysParam && !isAllTime ? parseInt(daysParam) : 30

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
        return NextResponse.json({ success: true, history: [] })
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
      for (const [assetKey, asset] of uniqueAssets.entries()) {
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
            // Continue with other assets
            continue
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
          if (!priceMap.has(todayStr)) {
            try {
              const currentPrice = await getCurrentPrice(asset.assetType, asset.symbol, asset.currency)
              if (currentPrice && currentPrice > 0) {
                priceMap.set(todayStr, currentPrice)
              }
            } catch (error) {
              console.error(`Error fetching current price for ${assetKey}:`, error)
              // Continue without today's price
            }
          }

          historicalPriceMap.set(assetKey, priceMap)
        } catch (error) {
          console.error(`Error fetching historical prices for ${assetKey}:`, error)
          // Continue with other assets
        }
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

      const dailyHoldings: Record<string, { date: string, cash: number, invested: number }> = {}

      // Filter trades by currency to determine the correct start date for this specific currency view
      // This prevents the graph from showing a long flat line if the user has older trades in a different currency
      const relevantTrades = trades.filter(t => t.currency.toUpperCase() === currency.toUpperCase())

      if (relevantTrades.length === 0) {
        return NextResponse.json({ success: true, history: [] })
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
              invested: 0
            }
          } else {
            // Calculate holdings for this date
            const holdings = calculateHoldingsFromTransactions(tradesUntilDate)

            let cashBalance = 0
            let bookValue = 0 // Book Value = Cash + Current Market Value (includes unrealized P&L)

            holdings.forEach(h => {
              try {
                if (h.assetType === 'cash') {
                  // For cash, quantity is the value
                  // Normalize currency comparison (PKR vs PKR, USD vs USD)
                  if (h.currency && h.currency.toUpperCase() === currency.toUpperCase()) {
                    cashBalance += h.quantity || 0
                    bookValue += h.quantity || 0
                  }
                } else {
                  // For assets, calculate current market value using historical price
                  // This includes unrealized P&L
                  if (h.currency && h.currency.toUpperCase() === currency.toUpperCase()) {
                    const assetKey = `${h.assetType}:${h.symbol.toUpperCase()}:${h.currency}`
                    const historicalPrice = getPriceForDate(assetKey, dateStr, h.purchasePrice || 0)
                    const marketValue = (h.quantity || 0) * historicalPrice
                    bookValue += marketValue
                  }
                }
              } catch (holdingError) {
                console.error(`Error processing holding ${h.symbol}:`, holdingError)
                // Continue with other holdings
              }
            })

            dailyHoldings[dateStr] = {
              date: dateStr,
              cash: cashBalance,
              invested: bookValue // Book Value = Cash + Market Value of Assets (includes unrealized P&L)
            }
          }
        } catch (dateError) {
          console.error(`Error processing date ${dateStr}:`, dateError)
          // Set default values for this date
          dailyHoldings[dateStr] = {
            date: dateStr,
            cash: 0,
            invested: 0
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

      return NextResponse.json({ success: true, history: sortedHistory })

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

