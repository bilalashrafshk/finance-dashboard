
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Pool } from 'pg'
import { calculateHoldingsFromTransactions, getCurrentPrice } from '@/lib/portfolio/transaction-utils'
import { Trade } from '@/lib/portfolio/transaction-utils'
import { Holding } from '@/lib/portfolio/types'

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
      const days = url.searchParams.get('days') ? parseInt(url.searchParams.get('days')!) : 30
      
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
      const history: HistoricalValue[] = []
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - days)
      
      // Identify all unique assets to fetch history for
      const uniqueAssets = new Set<string>()
      trades.forEach(t => {
        if (t.assetType !== 'cash') {
          uniqueAssets.add(`${t.assetType}:${t.symbol}`)
        }
      })
      
      // 3. Fetch historical prices (Optimization: Client-side should handle this or we do a big batch fetch here?)
      // Doing it here is better for "Lazy Load".
      // But fetching history for ALL assets for ALL days is heavy.
      // We can rely on the API to give us ranges.
      
      // For now, to keep it simple and fast enough:
      // We will calculate holdings for each day.
      // For prices, we will use a simplified approach:
      // - Use current price for today.
      // - For past dates, we strictly need historical data.
      // - If we don't have historical data easily, we might fallback to purchase price (inaccurate but fast) or fail.
      // - BETTER: The frontend graph usually queries a separate endpoint for ASSET history.
      // - Here we want PORTFOLIO history.
      
      // Let's implement a "Transaction-based" history first (Value based on Cost Basis + Realized PnL) 
      // + Unrealized PnL (approximate if we can't fetch all history).
      
      // ACTUALLY: The user wants "accounting for realised pnl".
      // If we just plot "Net Liquid Value" (Cash + Asset Market Value), it accounts for everything.
      
      // To do this accurately, we need historical prices for every asset for every day in the range.
      // That is too heavy for a synchronous API call if there are many assets.
      // Strategy:
      // Return the "Holdings History" (Quantity of each asset per day).
      // Frontend fetches Historical Prices for assets separately (cached).
      // Frontend combines Holdings * Price + Cash to draw the chart.
      // This distributes the load.
      
      const dailyHoldings: Record<string, { date: string, cash: number, invested: number }> = {}
      
      // Generate daily points
      // Start from the first trade date or requested start date, whichever is earlier
      const firstTradeDate = new Date(trades[0].tradeDate)
      const actualStartDate = firstTradeDate < startDate ? firstTradeDate : startDate
      
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
            let investedBalance = 0
            
            holdings.forEach(h => {
              try {
                if (h.assetType === 'cash') {
                  // For cash, quantity is the value
                  // Normalize currency comparison (PKR vs PKR, USD vs USD)
                  if (h.currency && h.currency.toUpperCase() === currency.toUpperCase()) {
                    cashBalance += h.quantity || 0
                    investedBalance += h.quantity || 0
                  }
                } else {
                  // For assets, we calculate the Cost Basis (Invested Amount)
                  // This represents "Book Value"
                  // We only sum up if currency matches
                  if (h.currency && h.currency.toUpperCase() === currency.toUpperCase()) {
                    const costBasis = (h.purchasePrice || 0) * (h.quantity || 0)
                    investedBalance += costBasis
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
              invested: investedBalance // This is effectively (Cash + Cost Basis of Assets)
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

