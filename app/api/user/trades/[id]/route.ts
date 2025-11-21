import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Pool } from 'pg'
import type { Trade } from '../route'
import { cacheManager } from '@/lib/cache/cache-manager'
import { revalidateTag } from 'next/cache'

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

// PUT - Update a trade
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request)
    const tradeId = parseInt(params.id)
    const body = await request.json()
    
    const { tradeType, assetType, symbol, name, quantity, price, totalAmount, currency, tradeDate, notes } = body
    
    if (!tradeType || !assetType || !symbol || !name || quantity === undefined || !price || totalAmount === undefined || !tradeDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    const client = await pool.connect()
    
    try {
      // First verify the trade belongs to the user
      const checkResult = await client.query(
        'SELECT id FROM user_trades WHERE id = $1 AND user_id = $2',
        [tradeId, user.id]
      )
      
      if (checkResult.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Trade not found' },
          { status: 404 }
        )
      }
      
      // Update the trade
      const result = await client.query(
        `UPDATE user_trades 
         SET trade_type = $1, asset_type = $2, symbol = $3, name = $4, quantity = $5, 
             price = $6, total_amount = $7, currency = $8, trade_date = $9, notes = $10
         WHERE id = $11 AND user_id = $12
         RETURNING id, user_id, holding_id, trade_type, asset_type, symbol, name, quantity,
                   price, total_amount, currency, trade_date, notes, created_at`,
        [tradeType, assetType, symbol, name, quantity, price, totalAmount, currency || 'USD', tradeDate, notes || null, tradeId, user.id]
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
      
      // Invalidate holdings cache for this user (transaction changed)
      const holdingsCacheKey = `holdings-${user.id}`
      cacheManager.delete(holdingsCacheKey)
      
      try {
        revalidateTag(`holdings-${user.id}`)
      } catch (error) {
        console.log('[Trade Update] Next.js cache revalidation skipped')
      }
      
      return NextResponse.json({ success: true, trade })
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
    
    console.error('Update trade error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update trade' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a trade
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request)
    const tradeId = parseInt(params.id)
    
    const pool = getPool()
    const client = await pool.connect()
    
    try {
      // First verify the trade belongs to the user
      const checkResult = await client.query(
        'SELECT id FROM user_trades WHERE id = $1 AND user_id = $2',
        [tradeId, user.id]
      )
      
      if (checkResult.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Trade not found' },
          { status: 404 }
        )
      }
      
      // Delete the trade
      await client.query(
        'DELETE FROM user_trades WHERE id = $1 AND user_id = $2',
        [tradeId, user.id]
      )
      
      // Invalidate holdings cache for this user (transaction deleted)
      const holdingsCacheKey = `holdings-${user.id}`
      cacheManager.delete(holdingsCacheKey)
      
      try {
        revalidateTag(`holdings-${user.id}`)
      } catch (error) {
        console.log('[Trade Delete] Next.js cache revalidation skipped')
      }
      
      return NextResponse.json({ success: true })
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
    
    console.error('Delete trade error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete trade' },
      { status: 500 }
    )
  }
}

