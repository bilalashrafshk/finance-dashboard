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

// POST - Sell a holding
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const body = await request.json()
    
    const { holdingId, quantity, price, date, fees, notes } = body
    
    if (!holdingId || !quantity || !price || !date) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    const pool = getPool()
    const client = await pool.connect()
    
    try {
      // Start transaction
      await client.query('BEGIN')
      
      // Get the holding
      const holdingResult = await client.query(
        `SELECT id, asset_type, symbol, name, quantity, purchase_price, currency
         FROM user_holdings
         WHERE id = $1 AND user_id = $2`,
        [holdingId, user.id]
      )
      
      if (holdingResult.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: 'Holding not found' },
          { status: 404 }
        )
      }
      
      const holding = holdingResult.rows[0]
      const currentQuantity = parseFloat(holding.quantity)
      
      if (quantity > currentQuantity) {
        await client.query('ROLLBACK')
        return NextResponse.json(
          { success: false, error: `Cannot sell more than ${currentQuantity} shares` },
          { status: 400 }
        )
      }
      
      const sellQuantity = parseFloat(quantity)
      const sellPrice = parseFloat(price)
      const feesAmount = fees ? parseFloat(fees) : 0
      const proceeds = sellQuantity * sellPrice - feesAmount
      const currency = holding.currency
      
      // Calculate realized P&L
      const purchasePrice = parseFloat(holding.purchase_price)
      const realizedPnL = (sellPrice - purchasePrice) * sellQuantity - feesAmount
      
      // Update or delete holding
      if (sellQuantity >= currentQuantity) {
        // Fully sold - delete holding
        await client.query(
          `DELETE FROM user_holdings WHERE id = $1 AND user_id = $2`,
          [holdingId, user.id]
        )
      } else {
        // Partially sold - reduce quantity
        await client.query(
          `UPDATE user_holdings 
           SET quantity = quantity - $1, updated_at = NOW()
           WHERE id = $2 AND user_id = $3`,
          [sellQuantity, holdingId, user.id]
        )
      }
      
      // Create sell transaction
      await client.query(
        `INSERT INTO user_trades 
         (user_id, holding_id, trade_type, asset_type, symbol, name, quantity, price, total_amount, currency, trade_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          user.id,
          sellQuantity >= currentQuantity ? null : holdingId, // null if fully sold
          'sell',
          holding.asset_type,
          holding.symbol,
          holding.name,
          sellQuantity,
          sellPrice,
          sellQuantity * sellPrice,
          currency,
          date,
          notes || `Sold ${sellQuantity} shares. Realized P&L: ${realizedPnL.toFixed(2)} ${currency}`
        ]
      )
      
      // Find or create cash holding for this currency
      const cashResult = await client.query(
        `SELECT id, quantity FROM user_holdings
         WHERE user_id = $1 AND asset_type = 'cash' AND symbol = 'CASH' AND currency = $2`,
        [user.id, currency]
      )
      
      if (cashResult.rows.length > 0) {
        // Update existing cash holding
        const cashHolding = cashResult.rows[0]
        await client.query(
          `UPDATE user_holdings 
           SET quantity = quantity + $1, updated_at = NOW()
           WHERE id = $2`,
          [proceeds, cashHolding.id]
        )
        
        // Record cash addition transaction
        await client.query(
          `INSERT INTO user_trades 
           (user_id, holding_id, trade_type, asset_type, symbol, name, quantity, price, total_amount, currency, trade_date, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            user.id,
            cashHolding.id,
            'add',
            'cash',
            'CASH',
            `Cash (${currency})`,
            proceeds,
            1, // Cash price is always 1
            proceeds,
            currency,
            date,
            `Proceeds from selling ${holding.symbol}`
          ]
        )
      } else {
        // Create new cash holding
        const newCashResult = await client.query(
          `INSERT INTO user_holdings 
           (user_id, asset_type, symbol, name, quantity, purchase_price, purchase_date, current_price, currency)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            user.id,
            'cash',
            'CASH',
            `Cash (${currency})`,
            proceeds,
            1, // Cash purchase price is always 1
            date,
            1, // Cash current price is always 1
            currency
          ]
        )
        
        const newCashId = newCashResult.rows[0].id
        
        // Record cash addition transaction
        await client.query(
          `INSERT INTO user_trades 
           (user_id, holding_id, trade_type, asset_type, symbol, name, quantity, price, total_amount, currency, trade_date, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            user.id,
            newCashId,
            'add',
            'cash',
            'CASH',
            `Cash (${currency})`,
            proceeds,
            1,
            proceeds,
            currency,
            date,
            `Proceeds from selling ${holding.symbol}`
          ]
        )
      }
      
      // Commit transaction
      await client.query('COMMIT')
      
      return NextResponse.json({
        success: true,
        realizedPnL,
        proceeds,
        message: `Sold ${sellQuantity} shares. ${proceeds.toFixed(2)} ${currency} added to Cash (${currency})`
      })
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
    
    console.error('Sell holding error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sell holding' },
      { status: 500 }
    )
  }
}

