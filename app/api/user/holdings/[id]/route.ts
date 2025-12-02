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

// PUT - Update a holding
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { id } = await params
    const body = await request.json()

    const { assetType, symbol, name, quantity, purchasePrice, purchaseDate, currentPrice, currency, notes } = body

    const pool = getPool()
    const client = await pool.connect()

    try {
      // Verify ownership
      const ownershipCheck = await client.query(
        'SELECT id FROM user_holdings WHERE id = $1 AND user_id = $2',
        [id, user.id]
      )

      if (ownershipCheck.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Holding not found' },
          { status: 404 }
        )
      }

      const result = await client.query(
        `UPDATE user_holdings
         SET asset_type = COALESCE($1, asset_type),
             symbol = COALESCE($2, symbol),
             name = COALESCE($3, name),
             quantity = COALESCE($4, quantity),
             purchase_price = COALESCE($5, purchase_price),
             purchase_date = COALESCE($6, purchase_date),
             current_price = COALESCE($7, current_price),
             currency = COALESCE($8, currency),
             notes = COALESCE($9, notes),
             updated_at = NOW()
         WHERE id = $10 AND user_id = $11
         RETURNING id, asset_type, symbol, name, quantity, purchase_price, purchase_date,
                   current_price, currency, notes, created_at, updated_at`,
        [assetType, symbol, name, quantity, purchasePrice, purchaseDate, currentPrice, currency, notes, id, user.id]
      )

      if (result.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Failed to update holding' },
          { status: 500 }
        )
      }

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

      return NextResponse.json({ success: true, holding })
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

    console.error('Update holding error:', error)
    return NextResponse.json(
      { success: false, error: `Failed to update holding: ${error.message}` },
      { status: 500 }
    )
  }
}

// DELETE - Delete a holding
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { id } = await params

    const pool = getPool()
    const client = await pool.connect()

    try {
      const result = await client.query(
        'DELETE FROM user_holdings WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, user.id]
      )

      if (result.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Holding not found' },
          { status: 404 }
        )
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

    console.error('Delete holding error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete holding' },
      { status: 500 }
    )
  }
}

