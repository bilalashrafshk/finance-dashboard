
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
      
      const trades: Trade[] = tradesResult.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        holdingId: row.holding_id,
        tradeType: row.trade_type,
        assetType: row.asset_type,
        symbol: row.symbol,
        name: row.name,
        quantity: parseFloat(row.quantity),
        price: parseFloat(row.price),
        totalAmount: parseFloat(row.total_amount),
        currency: row.currency,
        tradeDate: row.trade_date.toISOString().split('T')[0],
        notes: row.notes,
        createdAt: row.created_at.toISOString(),
      }))

      if (trades.length === 0) {
        return NextResponse.json({ success: true, history: [] })
      }

      // 2. Generate date range
      const history: HistoricalValue[] = []
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - days)
      
      // Find first trade date to not show empty graph before start
      const firstTradeDate = new Date(trades[0].tradeDate)
      const effectiveStartDate = firstTradeDate > startDate ? startDate : firstTradeDate // Actually we want to show from requested start date, or if trades started later? usually graph shows requested range.
      // Let's just use the requested range for now, but handle empty data.
      
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
      
      const dailyHoldings: Record<string, { date: string, cash: number, assets: Record<string, number> }> = {}
      
      // Generate daily points
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0]
        // Filter trades up to this date
        const tradesUntilDate = trades.filter(t => t.tradeDate <= dateStr)
        const holdings = calculateHoldingsFromTransactions(tradesUntilDate)
        
        let cashBalance = 0
        let investedBalance = 0
        
        holdings.forEach(h => {
          if (h.assetType === 'cash') {
             // For cash, quantity is the value
             if (h.currency === currency) {
               cashBalance += h.quantity
               investedBalance += h.quantity
             }
          } else {
             // For assets, we calculate the Cost Basis (Invested Amount)
             // This represents "Book Value"
             // We only sum up if currency matches, or we'd need conversion
             if (h.currency === currency) {
                investedBalance += (h.purchasePrice * h.quantity)
             }
          }
        })
        
        dailyHoldings[dateStr] = {
          date: dateStr,
          cash: cashBalance,
          invested: investedBalance, // This is effectively (Cash + Cost Basis of Assets)
          assets: {} // We can omit detailed asset breakdown for now to save bandwidth
        }
      }
      
      return NextResponse.json({ success: true, history: Object.values(dailyHoldings) })
      
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error('Get portfolio history error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get portfolio history' },
      { status: 500 }
    )
  }
}

