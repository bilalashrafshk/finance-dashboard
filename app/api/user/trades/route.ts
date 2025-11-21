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
      await client.query('BEGIN')
      
      // For buy transactions of non-cash assets, check cash balance
      if (tradeType === 'buy' && assetType !== 'cash') {
        const { autoDeposit } = body
        const assetCurrency = currency || 'USD'
        
        // Get cash balance from holdings
        const cashResult = await client.query(
          `SELECT quantity FROM user_holdings
           WHERE user_id = $1 AND asset_type = 'cash' AND symbol = 'CASH' AND currency = $2`,
          [user.id, assetCurrency]
        )
        
        const cashBalance = cashResult.rows.length > 0 ? Math.max(0, parseFloat(cashResult.rows[0].quantity) || 0) : 0
        
        if (cashBalance < totalAmount) {
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
             WHERE user_id = $1 AND asset_type = 'cash' AND symbol = 'CASH' AND currency = $2`,
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
      
      // Deduct cash for buy transactions
      if (tradeType === 'buy' && assetType !== 'cash') {
        const assetCurrency = currency || 'USD'
        const cashHoldingResult = await client.query(
          `SELECT id, quantity FROM user_holdings
           WHERE user_id = $1 AND asset_type = 'cash' AND symbol = 'CASH' AND currency = $2`,
          [user.id, assetCurrency]
        )
        
        if (cashHoldingResult.rows.length > 0) {
          const cashHolding = cashHoldingResult.rows[0]
          const newCashQuantity = Math.max(0, parseFloat(cashHolding.quantity) - totalAmount)
          
          await client.query(
            `UPDATE user_holdings 
             SET quantity = $1, updated_at = NOW()
             WHERE id = $2`,
            [newCashQuantity, cashHolding.id]
          )
        }
      }
      
      await client.query('COMMIT')
      
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

