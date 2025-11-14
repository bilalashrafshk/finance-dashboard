import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Pool } from 'pg'

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

export interface Trade {
  id: number
  userId: number
  holdingId: number | null
  tradeType: 'buy' | 'sell' | 'add' | 'remove'
  assetType: string
  symbol: string
  name: string
  quantity: number
  price: number
  totalAmount: number
  currency: string
  tradeDate: string
  notes: string | null
  createdAt: string
}

// GET - Get all trades for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const pool = getPool()
    const client = await pool.connect()
    
    try {
      const url = new URL(request.url)
      const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 100
      const offset = url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : 0
      
      const result = await client.query(
        `SELECT id, user_id, holding_id, trade_type, asset_type, symbol, name, quantity,
                price, total_amount, currency, trade_date, notes, created_at
         FROM user_trades
         WHERE user_id = $1
         ORDER BY trade_date DESC, created_at DESC
         LIMIT $2 OFFSET $3`,
        [user.id, limit, offset]
      )
      
      const trades: Trade[] = result.rows.map(row => ({
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
      
      return NextResponse.json({ success: true, trades })
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
    
    console.error('Get trades error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get trades' },
      { status: 500 }
    )
  }
}

// POST - Create a new trade
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const body = await request.json()
    
    const { holdingId, tradeType, assetType, symbol, name, quantity, price, totalAmount, currency, tradeDate, notes } = body
    
    if (!tradeType || !assetType || !symbol || !name || quantity === undefined || !price || totalAmount === undefined || !tradeDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    const client = await pool.connect()
    
    try {
      const result = await client.query(
        `INSERT INTO user_trades 
         (user_id, holding_id, trade_type, asset_type, symbol, name, quantity, price, total_amount, currency, trade_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, user_id, holding_id, trade_type, asset_type, symbol, name, quantity,
                   price, total_amount, currency, trade_date, notes, created_at`,
        [user.id, holdingId || null, tradeType, assetType, symbol, name, quantity, price, totalAmount, currency || 'USD', tradeDate, notes || null]
      )
      
      const row = result.rows[0]
      const trade: Trade = {
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
      }
      
      return NextResponse.json({ success: true, trade }, { status: 201 })
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
    
    console.error('Create trade error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create trade' },
      { status: 500 }
    )
  }
}

