import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Pool } from 'pg'
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

// POST - Sync user_holdings from user_trades
// Can be triggered manually or via cron
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const pool = getPool()
    const client = await pool.connect()
    
    try {
      await client.query('BEGIN')
      
      // 1. Fetch all trades
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
      
      // 2. Calculate correct holdings state
      const calculatedHoldings = calculateHoldingsFromTransactions(trades)
      
      // 3. Update user_holdings table
      
      // First, get existing holdings to compare/update
      const existingHoldingsResult = await client.query(
        `SELECT id, asset_type, symbol, currency FROM user_holdings WHERE user_id = $1`,
        [user.id]
      )
      
      const existingMap = new Map<string, string>() // key -> id
      existingHoldingsResult.rows.forEach(row => {
        const key = `${row.asset_type}:${row.symbol}:${row.currency}`
        existingMap.set(key, row.id)
      })
      
      const processedIds = new Set<string>()
      
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
                user.id, 
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
      
      // 4. Delete holdings that no longer exist (quantity 0 and not in calculated list)
      // Note: calculateHoldingsFromTransactions filters out 0 quantity except cash
      // So anything in existingMap but not in processedIds should be deleted or set to 0
      
      for (const [key, id] of existingMap.entries()) {
        if (!processedIds.has(id)) {
           // Check if it's cash - we might want to keep cash even if 0? 
           // But calculateHoldingsFromTransactions keeps cash even if 0 if it was created
           // If it's not in calculatedHoldings, it means it's effectively gone.
           await client.query(`DELETE FROM user_holdings WHERE id = $1`, [id])
        }
      }
      
      await client.query('COMMIT')
      
      return NextResponse.json({ success: true, message: 'Holdings synced successfully' })
      
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error('Sync holdings error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to sync holdings' },
      { status: 500 }
    )
  }
}

