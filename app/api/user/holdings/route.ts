import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Pool } from 'pg'
import type { Holding } from '@/lib/portfolio/types'
import { calculateHoldingsFromTransactions, getCurrentPrice } from '@/lib/portfolio/transaction-utils'

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

// GET - Get all holdings for the authenticated user (calculated from transactions)
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const pool = getPool()
    const client = await pool.connect()
    
    try {
      // Get all transactions for the user
      const tradesResult = await client.query(
        `SELECT id, user_id, holding_id, trade_type, asset_type, symbol, name, quantity,
                price, total_amount, currency, trade_date, notes, created_at
         FROM user_trades
         WHERE user_id = $1
         ORDER BY trade_date ASC, created_at ASC`,
        [user.id]
      )
      
      const trades = tradesResult.rows.map(row => ({
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
      
      // Calculate holdings from transactions
      const calculatedHoldings = calculateHoldingsFromTransactions(trades)
      
      // Fetch current prices for all holdings
      const currentPrices = new Map<string, number>()
      const pricePromises = calculatedHoldings.map(async (holding) => {
        const priceKey = `${holding.assetType}:${holding.symbol.toUpperCase()}:${holding.currency}`
        try {
          const price = await getCurrentPrice(holding.assetType, holding.symbol, holding.currency)
          currentPrices.set(priceKey, price)
        } catch (error) {
          console.error(`Error fetching price for ${priceKey}:`, error)
          // Use average purchase price as fallback
          currentPrices.set(priceKey, holding.purchasePrice)
        }
      })
      
      await Promise.all(pricePromises)
      
      // Update holdings with current prices
      const holdings: Holding[] = calculatedHoldings.map(holding => {
        const priceKey = `${holding.assetType}:${holding.symbol.toUpperCase()}:${holding.currency}`
        return {
          ...holding,
          currentPrice: currentPrices.get(priceKey) || holding.purchasePrice,
        }
      })
      
      return NextResponse.json({ success: true, holdings })
    } finally {
      client.release()
    }
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }
    
    console.error('Get holdings error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get holdings' },
      { status: 500 }
    )
  }
}

// POST - Create a new holding
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const body = await request.json()
    
    const { assetType, symbol, name, quantity, purchasePrice, purchaseDate, currentPrice, currency, notes } = body
    
    if (!assetType || !symbol || !name || quantity === undefined || !purchasePrice || !purchaseDate || currentPrice === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    const client = await pool.connect()
    
    try {
      const result = await client.query(
        `INSERT INTO user_holdings 
         (user_id, asset_type, symbol, name, quantity, purchase_price, purchase_date, current_price, currency, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, asset_type, symbol, name, quantity, purchase_price, purchase_date,
                   current_price, currency, notes, created_at, updated_at`,
        [user.id, assetType, symbol, name, quantity, purchasePrice, purchaseDate, currentPrice, currency || 'USD', notes || null]
      )
      
      const row = result.rows[0]
      const holding: Holding = {
        id: row.id.toString(),
        assetType: row.asset_type,
        symbol: row.symbol,
        name: row.name,
        quantity: parseFloat(row.quantity),
        purchasePrice: parseFloat(row.purchase_price),
        purchaseDate: row.purchase_date.toISOString().split('T')[0],
        currentPrice: parseFloat(row.current_price),
        currency: row.currency,
        notes: row.notes || undefined,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      }

      // Record buy transaction (unless it's cash, which uses 'add' type)
      const tradeType = assetType === 'cash' ? 'add' : 'buy'
      const totalAmount = quantity * purchasePrice
      
      try {
        await client.query(
          `INSERT INTO user_trades 
           (user_id, holding_id, trade_type, asset_type, symbol, name, quantity, price, total_amount, currency, trade_date, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [user.id, row.id, tradeType, assetType, symbol, name, quantity, purchasePrice, totalAmount, currency || 'USD', purchaseDate, notes || null]
        )
      } catch (tradeError) {
        // Log but don't fail - transaction recording is optional
        console.error('Failed to record buy transaction:', tradeError)
      }
      
      return NextResponse.json({ success: true, holding }, { status: 201 })
    } finally {
      client.release()
    }
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }
    
    console.error('Create holding error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create holding' },
      { status: 500 }
    )
  }
}

