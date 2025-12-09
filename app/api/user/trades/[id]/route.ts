import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Pool } from 'pg'
import type { Trade } from '@/lib/portfolio/types'
import { cacheManager } from '@/lib/cache/cache-manager'
import { revalidateTag } from 'next/cache'
import { calculateHoldingsFromTransactions } from '@/lib/portfolio/transaction-utils'

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

// Helper function to sync user_holdings table from user_trades
async function syncHoldingsFromTrades(client: any, userId: number) {
  // Fetch all trades
  const tradesResult = await client.query(
    `SELECT id, user_id, holding_id, trade_type, asset_type, symbol, name, quantity,
            price, total_amount, currency, trade_date, notes, created_at
     FROM user_trades
     WHERE user_id = $1
     ORDER BY trade_date ASC, created_at ASC`,
    [userId]
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

  // Calculate correct holdings state
  const calculatedHoldings = calculateHoldingsFromTransactions(trades)

  // Get existing holdings to compare/update
  const existingHoldingsResult = await client.query(
    `SELECT id, asset_type, symbol, currency FROM user_holdings WHERE user_id = $1`,
    [userId]
  )

  const existingMap = new Map<string, string>() // key -> id
  existingHoldingsResult.rows.forEach(row => {
    const key = `${row.asset_type}:${row.symbol}:${row.currency}`
    existingMap.set(key, row.id)
  })

  const processedIds = new Set<string>()

  // Update or insert holdings
  for (const holding of calculatedHoldings) {
    const key = `${holding.assetType}:${holding.symbol}:${holding.currency}`
    const existingId = existingMap.get(key)

    if (existingId) {
      // Update
      await client.query(
        `UPDATE user_holdings 
         SET quantity = $1, purchase_price = $2, purchase_date = $3, updated_at = NOW()
         WHERE id = $4`,
        [holding.quantity, holding.purchasePrice, holding.purchaseDate, existingId]
      )
      processedIds.add(existingId)
    } else {
      // Insert (only if quantity > 0 or it's cash)
      if (holding.quantity > 0 || holding.assetType === 'cash') {
        await client.query(
          `INSERT INTO user_holdings 
           (user_id, asset_type, symbol, name, quantity, purchase_price, purchase_date, current_price, currency, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            userId,
            holding.assetType,
            holding.symbol,
            holding.name,
            holding.quantity,
            holding.purchasePrice,
            holding.purchaseDate,
            holding.currentPrice || holding.purchasePrice,
            holding.currency,
            holding.notes || null
          ]
        )
      }
    }
  }

  // Delete holdings that no longer exist
  for (const [key, id] of existingMap.entries()) {
    if (!processedIds.has(id)) {
      await client.query(`DELETE FROM user_holdings WHERE id = $1`, [id])
    }
  }
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
      // First verify the trade belongs to the user and fetch OLD data
      const checkResult = await client.query(
        `SELECT id, asset_type, symbol, total_amount, trade_date, trade_type 
         FROM user_trades 
         WHERE id = $1 AND user_id = $2`,
        [tradeId, user.id]
      )

      if (checkResult.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Trade not found' },
          { status: 404 }
        )
      }

      const oldTrade = checkResult.rows[0]

      await client.query('BEGIN')

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

      // --- CASH SYNC LOGIC (Gap Filler) ---
      // If this was a BUY/ADD transaction for a non-cash asset
      if (oldTrade.trade_type === 'buy' || oldTrade.trade_type === 'add') {
        if (oldTrade.asset_type !== 'cash') {
          // Calculate the difference in total amount
          const oldTotal = parseFloat(oldTrade.total_amount)
          const newTotal = totalAmount
          const delta = newTotal - oldTotal

          // If cost increased (delta > 0), we need to inject more cash (Adjustment Deposit)
          if (delta > 0.0001) {
            console.log(`[Trade Update] Cost increased by ${delta}. Injecting cash adjustment.`)

            // Find or create cash holding (reuse logic or just insert trade if holding exists)
            const cashHoldingResult = await client.query(
              `SELECT id FROM user_holdings
               WHERE user_id = $1 AND asset_type = 'cash' AND symbol = 'CASH'
               ORDER BY quantity DESC LIMIT 1`,
              [user.id]
            )

            let cashHoldingId = cashHoldingResult.rows[0]?.id

            // If no cash holding exists, create one
            if (!cashHoldingId) {
              const newCashResult = await client.query(
                `INSERT INTO user_holdings 
                 (user_id, asset_type, symbol, name, quantity, purchase_price, purchase_date, current_price, currency)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING id`,
                [user.id, 'cash', 'CASH', `Cash (${currency || 'USD'})`, delta, 1, tradeDate, 1, currency || 'USD']
              )
              cashHoldingId = newCashResult.rows[0].id
            } else {
              // We don't strictly need to update holding quantity here because syncHoldingsFromTrades will do it
              // based on the new trade we are about to insert.
            }

            // Insert "Adjustment" Cash Transaction
            await client.query(
              `INSERT INTO user_trades 
               (user_id, holding_id, trade_type, asset_type, symbol, name, quantity, price, total_amount, currency, trade_date, notes)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [
                user.id,
                cashHoldingId,
                'add',
                'cash',
                'CASH',
                `Cash (${currency || 'USD'})`,
                delta,
                1,
                delta,
                currency || 'USD',
                tradeDate,
                `Adjustment: Trade cost increased for ${symbol}`
              ]
            )
          }
          // If cost decreased (delta < 0) or didn't change:
          // We do NOTHING. The original cash outflow stands. The fact that the trade now costs LESS
          // means when we recalculate holdings, the 'cash remaining' will mathematically increase.
        }
      }
      // -----------------------

      // Sync holdings table after trade update
      await syncHoldingsFromTrades(client, user.id)

      await client.query('COMMIT')

      // Invalidate holdings cache for this user (transaction changed)
      const holdingsCacheKey = `holdings-${user.id}`
      cacheManager.delete(holdingsCacheKey)

      try {
        revalidateTag(`holdings-${user.id}`)
      } catch (error) {
        console.log('[Trade Update] Next.js cache revalidation skipped')
      }

      return NextResponse.json({ success: true, trade })
    } catch (error: any) {
      await client.query('ROLLBACK')
      console.error('Detailed Update Error:', error)
      // Return more specific error for debugging
      throw new Error(`Update failed at step: ${error.message}`)
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

    console.error('Update trade error (Outer):', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update trade',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
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

      await client.query('BEGIN')

      // Delete the trade
      await client.query(
        'DELETE FROM user_trades WHERE id = $1 AND user_id = $2',
        [tradeId, user.id]
      )

      // Sync holdings table after trade deletion
      await syncHoldingsFromTrades(client, user.id)

      await client.query('COMMIT')

      // Invalidate holdings cache for this user (transaction deleted)
      const holdingsCacheKey = `holdings-${user.id}`
      cacheManager.delete(holdingsCacheKey)

      try {
        revalidateTag(`holdings-${user.id}`)
      } catch (error) {
        console.log('[Trade Delete] Next.js cache revalidation skipped')
      }

      return NextResponse.json({ success: true })
    } catch (error: any) {
      await client.query('ROLLBACK')
      throw error
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

