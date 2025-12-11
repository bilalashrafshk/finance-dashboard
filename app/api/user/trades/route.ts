import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Pool } from 'pg'
import { calculateHoldingsFromTransactions } from '@/lib/portfolio/transaction-utils'
import { revalidateTag } from 'next/cache'
import { cacheManager } from '@/lib/cache/cache-manager'

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

  const trades = tradesResult.rows.map((row: any) => ({
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
  existingHoldingsResult.rows.forEach((row: any) => {
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

import type { Trade } from '@/lib/portfolio/types'

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
      await client.query('BEGIN')

      // For cash withdrawals (remove), check cash balance
      if (tradeType === 'remove' && assetType === 'cash') {
        const assetCurrency = currency || 'USD'

        // Calculate cash balance from transactions
        const existingTradesResult = await client.query(
          `SELECT id, user_id, holding_id, trade_type, asset_type, symbol, name, quantity,
                  price, total_amount, currency, trade_date, notes, created_at
           FROM user_trades
           WHERE user_id = $1
           ORDER BY trade_date ASC, created_at ASC`,
          [user.id]
        )

        const existingTrades = existingTradesResult.rows.map(row => ({
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

        // Calculate holdings from transactions to get accurate cash balance
        const calculatedHoldings = calculateHoldingsFromTransactions(existingTrades)
        const cashHolding = calculatedHoldings.find(
          h => h.assetType === 'cash' && h.symbol === 'CASH' && h.currency === assetCurrency
        )
        const cashBalance = cashHolding ? cashHolding.quantity : 0

        // Use epsilon for float comparison
        const EPSILON = 0.0001
        if (totalAmount - cashBalance > EPSILON) {
          await client.query('ROLLBACK')
          return NextResponse.json(
            {
              success: false,
              error: 'Insufficient cash balance for withdrawal',
              cashBalance,
              requested: totalAmount,
              shortfall: totalAmount - cashBalance,
              currency: assetCurrency
            },
            { status: 400 }
          )
        }
      }

      // For buy transactions of non-cash assets, check cash balance
      if (tradeType === 'buy' && assetType !== 'cash') {
        const { autoDeposit } = body
        const assetCurrency = currency || 'USD'

        // Check if this is a past transaction
        const tradeDateObj = new Date(tradeDate)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        tradeDateObj.setHours(0, 0, 0, 0)
        const isPastTransaction = tradeDateObj < today

        if (isPastTransaction) {
          // For past transactions, always create auto-deposit regardless of balance
          // This ensures historical accuracy when inserting transactions into existing history
          // The cash on that date might have been used by later transactions

          // Find or create cash holding
          const cashHoldingResult = await client.query(
            `SELECT id FROM user_holdings
             WHERE user_id = $1 AND asset_type = 'cash' AND symbol = 'CASH' AND currency = $2
             ORDER BY quantity DESC
             LIMIT 1`,
            [user.id, assetCurrency]
          )

          let cashHoldingId = cashHoldingResult.rows[0]?.id

          if (!cashHoldingId) {
            const newCashResult = await client.query(
              `INSERT INTO user_holdings 
               (user_id, asset_type, symbol, name, quantity, purchase_price, purchase_date, current_price, currency)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               RETURNING id`,
              [user.id, 'cash', 'CASH', `Cash (${assetCurrency})`, totalAmount, 1, tradeDate, 1, assetCurrency]
            )
            cashHoldingId = newCashResult.rows[0].id
          } else {
            // Update cash holding (the sync will recalculate correctly)
            await client.query(
              `UPDATE user_holdings 
               SET quantity = quantity + $1, updated_at = NOW()
               WHERE id = $2`,
              [totalAmount, cashHoldingId]
            )
          }

          // Record auto-deposit transaction on the same date as the buy
          // This ensures the deposit appears before the buy when sorted by date
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
              `Cash (${assetCurrency})`,
              totalAmount,
              1,
              totalAmount,
              assetCurrency,
              tradeDate, // Same date as the buy transaction
              `Auto-deposit (past transaction): Required for ${symbol} purchase on ${tradeDate}`
            ]
          )
        } else {
          // For current/future transactions, check cash balance and prompt user if needed
          const existingTradesResult = await client.query(
            `SELECT id, user_id, holding_id, trade_type, asset_type, symbol, name, quantity,
                    price, total_amount, currency, trade_date, notes, created_at
             FROM user_trades
             WHERE user_id = $1
             ORDER BY trade_date ASC, created_at ASC`,
            [user.id]
          )

          const existingTrades = existingTradesResult.rows.map(row => ({
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

          // Calculate holdings from transactions to get accurate cash balance
          const calculatedHoldings = calculateHoldingsFromTransactions(existingTrades)
          const cashHolding = calculatedHoldings.find(
            h => h.assetType === 'cash' && h.symbol === 'CASH' && h.currency === assetCurrency
          )
          const cashBalance = cashHolding ? cashHolding.quantity : 0

          // Use epsilon for float comparison to match frontend
          const EPSILON = 0.0001
          if (totalAmount - cashBalance > EPSILON) {
            const shortfall = totalAmount - cashBalance

            if (!autoDeposit) {
              await client.query('ROLLBACK')
              return NextResponse.json(
                {
                  success: false,
                  error: 'Insufficient cash balance',
                  cashBalance,
                  required: totalAmount,
                  shortfall,
                  currency: assetCurrency
                },
                { status: 400 }
              )
            }

            // Auto-deposit: Create cash transaction
            const cashHoldingResult = await client.query(
              `SELECT id FROM user_holdings
               WHERE user_id = $1 AND asset_type = 'cash' AND symbol = 'CASH' AND currency = $2
               ORDER BY quantity DESC
               LIMIT 1`,
              [user.id, assetCurrency]
            )

            let cashHoldingId = cashHoldingResult.rows[0]?.id

            if (!cashHoldingId) {
              const newCashResult = await client.query(
                `INSERT INTO user_holdings 
                 (user_id, asset_type, symbol, name, quantity, purchase_price, purchase_date, current_price, currency)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING id`,
                [user.id, 'cash', 'CASH', `Cash (${assetCurrency})`, shortfall, 1, tradeDate, 1, assetCurrency]
              )
              cashHoldingId = newCashResult.rows[0].id
            } else {
              await client.query(
                `UPDATE user_holdings 
                 SET quantity = quantity + $1, updated_at = NOW()
                 WHERE id = $2`,
                [shortfall, cashHoldingId]
              )
            }

            // Record auto-deposit transaction
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
                `Cash (${assetCurrency})`,
                shortfall,
                1,
                shortfall,
                assetCurrency,
                tradeDate,
                `Auto-deposit: Insufficient cash for ${symbol} purchase`
              ]
            )
          }
        }
      }

      let realizedPnL: number | null = null

      // Calculate realized PnL for sell transactions
      if (tradeType === 'sell') {
        // Fetch all previous trades for this asset to calculate average purchase price
        // Note: We use <= tradeDate to get trades up to the current trade date
        // For same date trades, we should ideally order by ID, but we don't have the current ID yet.
        // Since this is a new trade, it will be "after" any existing trades on the same day in terms of logic usually.
        // We sort by date ASC, createdAt ASC
        const tradesResult = await client.query(
          `SELECT trade_type, quantity, price, total_amount
           FROM user_trades
           WHERE user_id = $1 AND asset_type = $2 AND symbol = $3 AND trade_date <= $4
           ORDER BY trade_date ASC, created_at ASC`,
          [user.id, assetType, symbol, tradeDate]
        )

        // Calculate average purchase price from previous trades
        let currentQuantity = 0
        let currentInvested = 0

        for (const t of tradesResult.rows) {
          const tQuantity = parseFloat(t.quantity)
          const tTotal = parseFloat(t.total_amount)
          const tType = t.trade_type

          if (tType === 'buy' || tType === 'add') {
            // Add to position
            currentQuantity += tQuantity
            currentInvested += tTotal
          } else if (tType === 'sell' || tType === 'remove') {
            // Reduce position - using average cost basis
            // Logic matches calculateHoldingsFromTransactions in transaction-utils.ts
            const quantityToRemove = Math.min(tQuantity, currentQuantity)
            const avgPrice = currentQuantity > 0 ? currentInvested / currentQuantity : 0
            const costBasis = avgPrice * quantityToRemove

            currentQuantity -= quantityToRemove
            currentInvested -= costBasis

            if (currentQuantity <= 0) {
              currentQuantity = 0
              currentInvested = 0
            }
          }
        }

        // Now calculate PnL for THIS trade
        if (currentQuantity > 0) {
          const avgPurchasePrice = currentInvested / currentQuantity
          const sellPrice = parseFloat(price)
          const sellQuantity = parseFloat(quantity)
          // Realized PnL = (Sell Price - Avg Buy Price) * Sell Quantity
          realizedPnL = (sellPrice - avgPurchasePrice) * sellQuantity
        }
      }

      // Check if realized_pnl column exists, if not, we'll add it via migration
      // For now, store it in notes if column doesn't exist
      let notesWithPnL = notes || null
      if (realizedPnL !== null) {
        const pnlText = `Realized P&L: ${realizedPnL.toFixed(2)} ${currency}`
        notesWithPnL = notes ? `${notes}. ${pnlText}` : pnlText
      }

      const result = await client.query(
        `INSERT INTO user_trades 
         (user_id, holding_id, trade_type, asset_type, symbol, name, quantity, price, total_amount, currency, trade_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, user_id, holding_id, trade_type, asset_type, symbol, name, quantity,
                   price, total_amount, currency, trade_date, notes, created_at`,
        [user.id, holdingId || null, tradeType, assetType, symbol, name, quantity, price, totalAmount, currency || 'USD', tradeDate, notesWithPnL]
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

      // Sync holdings table after trade is added
      // This ensures all holdings (including cash) are correctly updated
      await syncHoldingsFromTrades(client, user.id)

      await client.query('COMMIT')

      // Invalidate holdings cache for this user (transactions changed)
      const holdingsCacheKey = `holdings-${user.id}`
      cacheManager.delete(holdingsCacheKey)

      // Also try Next.js revalidation (if available)
      try {
        revalidateTag(`holdings-${user.id}`)
      } catch (error) {
        // revalidateTag might not be available in all contexts, ignore if it fails

      }

      return NextResponse.json({ success: true, trade, realizedPnL }, { status: 201 })
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

    console.error('Create trade error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create trade' },
      { status: 500 }
    )
  }
}

