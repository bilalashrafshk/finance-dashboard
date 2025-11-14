import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Pool } from 'pg'
import type { Holding } from '@/lib/portfolio/types'

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

// GET - Get all holdings for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const pool = getPool()
    const client = await pool.connect()
    
    try {
      const result = await client.query(
        `SELECT id, asset_type, symbol, name, quantity, purchase_price, purchase_date,
                current_price, currency, notes, created_at, updated_at
         FROM user_holdings
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [user.id]
      )
      
      const holdings: Holding[] = result.rows.map(row => ({
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
      }))
      
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

