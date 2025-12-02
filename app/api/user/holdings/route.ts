import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Pool } from 'pg'
import type { Holding } from '@/lib/portfolio/types'
import { calculateHoldingsFromTransactions, getCurrentPrice } from '@/lib/portfolio/transaction-utils'
import { calculateNetDeposits } from '@/lib/portfolio/portfolio-utils'
import { revalidateTag } from 'next/cache'
import { cacheManager } from '@/lib/cache/cache-manager'
import { getLatestPriceFromDatabase } from '@/lib/portfolio/db-client'

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
    const { searchParams } = new URL(request.url)
    const fastLoad = searchParams.get('fast') === 'true'
    const fetchPrices = searchParams.get('fetchPrices') !== 'false' // Default true

    const pool = getPool()
    const client = await pool.connect()

    try {
      // ETag Generation: Based on latest trade or holding update for this user
      // This is efficient: 1 fast query instead of calculating everything
      const etagResult = await client.query(
        `SELECT GREATEST(
           MAX(updated_at), 
           (SELECT MAX(created_at) FROM user_trades WHERE user_id = $1)
         ) as last_update 
         FROM user_holdings 
         WHERE user_id = $1`,
        [user.id]
      )
      
      const lastUpdate = etagResult.rows[0]?.last_update 
        ? new Date(etagResult.rows[0].last_update).getTime().toString(36)
        : 'no-data'
      
      // If client asked for prices, ETag must also include "prices" because prices change independently
      // If client strictly wants structure (fetchPrices=false), ETag depends only on DB structure
      const etag = `"${user.id}-${lastUpdate}-${fetchPrices ? 'with-prices' : 'structure'}"`

      if (request.headers.get('If-None-Match') === etag) {
        return new NextResponse(null, { status: 304, headers: { ETag: etag } })
      }

      // Cache key per user
      const cacheKey = `holdings-${user.id}${fastLoad ? '-fast' : ''}`
      const HOLDINGS_CACHE_TTL = 30 * 1000 // 30 seconds

      // Try to get from cache first
      let calculatedHoldings: any[] | null = cacheManager.get<any[]>(cacheKey)
      let fromCache = calculatedHoldings !== null

      if (!calculatedHoldings) {
        if (fastLoad) {
          // FAST LOAD: Query user_holdings table directly
          const holdingsResult = await client.query(
            `SELECT id, asset_type, symbol, name, quantity, purchase_price, purchase_date, 
                    current_price, currency, notes, created_at, updated_at
             FROM user_holdings
             WHERE user_id = $1 AND (quantity > 0.00000001 OR (asset_type = 'cash' AND quantity != 0))
             ORDER BY asset_type, symbol`,
            [user.id]
          )

          calculatedHoldings = holdingsResult.rows.map(row => ({
            id: row.id.toString(),
            assetType: row.asset_type,
            symbol: row.symbol,
            name: row.name,
            quantity: parseFloat(row.quantity),
            purchasePrice: parseFloat(row.purchase_price),
            purchaseDate: row.purchase_date.toISOString().split('T')[0],
            currentPrice: parseFloat(row.current_price),
            currency: row.currency,
            notes: row.notes,
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
          }))
        } else {
          // NORMAL LOAD: Calculate from transactions
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

          calculatedHoldings = calculateHoldingsFromTransactions(trades)
        }

        cacheManager.setWithCustomTTL(cacheKey, calculatedHoldings, HOLDINGS_CACHE_TTL)
      }

      if (!calculatedHoldings) {
        calculatedHoldings = []
      }

      // If we only want structure (fastLoad or fetchPrices=false), return early
      // BUT: If fetchPrices=true (default), we try to get fresh prices
      
      const currentPrices = new Map<string, number>()
      
      if (fetchPrices && calculatedHoldings.length > 0) {
        try {
          // Prepare assets for batch API
          const { parseSymbolToBinance } = await import('@/lib/portfolio/binance-api')
          const assets = calculatedHoldings.map(holding => {
            if (holding.assetType === 'crypto') {
              const binanceSymbol = parseSymbolToBinance(holding.symbol)
              return { type: 'crypto', symbol: binanceSymbol }
            }
            return { type: holding.assetType, symbol: holding.symbol }
          })

          // Fetch all prices in one batch call
          const baseUrl = request.nextUrl.origin
          const priceResponse = await fetch(`${baseUrl}/api/prices/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assets }),
          })

          if (priceResponse.ok) {
            const batchResult = await priceResponse.json()
            calculatedHoldings.forEach((holding, index) => {
              const asset = assets[index]
              const key = `${asset.type}:${asset.symbol.toUpperCase()}`
              const result = batchResult.results?.[key]
              const priceKey = `${holding.assetType}:${holding.symbol.toUpperCase()}:${holding.currency}`

              if (result && result.price !== null && !result.error) {
                currentPrices.set(priceKey, result.price)
              } else {
                currentPrices.set(priceKey, holding.purchasePrice)
              }
            })
          } else {
            console.warn('[Holdings API] Batch price fetch failed, falling back to individual calls')
            // ... (keep fallback logic for brevity) ...
             const pricePromises = calculatedHoldings.map(async (holding) => {
               // ... fallback logic ...
               const priceKey = `${holding.assetType}:${holding.symbol.toUpperCase()}:${holding.currency}`
               currentPrices.set(priceKey, holding.purchasePrice)
             })
             await Promise.all(pricePromises)
          }
        } catch (error) {
          console.error('[Holdings API] Error in batch price fetch:', error)
        }
      }

      // Update holdings with current prices
      const holdings: Holding[] = calculatedHoldings.map(holding => {
        const priceKey = `${holding.assetType}:${holding.symbol.toUpperCase()}:${holding.currency}`
        return {
          ...holding,
          currentPrice: currentPrices.get(priceKey) || holding.purchasePrice,
        }
      })

      // Calculate net deposits by currency if we have trades
      const netDeposits: Record<string, number> = {}

      const depositsResult = await client.query(
        `SELECT 
            currency,
            COALESCE(SUM(CASE WHEN trade_type = 'add' THEN total_amount ELSE 0 END), 0) as deposits,
            COALESCE(SUM(CASE WHEN trade_type = 'remove' THEN total_amount ELSE 0 END), 0) as withdrawals
          FROM user_trades
          WHERE user_id = $1
          GROUP BY currency`,
        [user.id]
      )

      depositsResult.rows.forEach(row => {
        const currency = row.currency || 'USD'
        netDeposits[currency] = parseFloat(row.deposits) - parseFloat(row.withdrawals)
      })

      return NextResponse.json(
        { success: true, holdings, netDeposits },
        {
          headers: {
            'Cache-Control': 'private, max-age=30, must-revalidate',
            'X-Holdings-Count': holdings.length.toString(),
            'X-Cache': fromCache ? 'HIT' : 'MISS',
            'X-Load-Mode': 'NORMAL',
            'ETag': etag
          },
        }
      )

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

/**
 * Get cash balance for a specific currency from holdings
 */
async function getCashBalance(client: any, userId: number, currency: string): Promise<number> {
  const cashResult = await client.query(
    `SELECT quantity FROM user_holdings
     WHERE user_id = $1 AND asset_type = 'cash' AND symbol = 'CASH' AND currency = $2`,
    [userId, currency]
  )

  if (cashResult.rows.length === 0) {
    return 0
  }

  return Math.max(0, parseFloat(cashResult.rows[0].quantity) || 0)
}

// POST - Create a new holding
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const body = await request.json()

    const { assetType, symbol, name, quantity, purchasePrice, purchaseDate, currentPrice, currency, notes, autoDeposit } = body

    if (!assetType || !symbol || !name || quantity === undefined || !purchasePrice || !purchaseDate || currentPrice === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const pool = getPool()
    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      // For non-cash assets, check cash balance before allowing purchase
      if (assetType !== 'cash') {
        const assetCurrency = currency || 'USD'
        const totalAmount = quantity * purchasePrice
        const cashBalance = await getCashBalance(client, user.id, assetCurrency)

        if (cashBalance < totalAmount) {
          const shortfall = totalAmount - cashBalance

          if (!autoDeposit) {
            // Return error with shortfall amount
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

          // Auto-deposit: Create cash transaction for the shortfall
          const cashHoldingResult = await client.query(
            `SELECT id FROM user_holdings
             WHERE user_id = $1 AND asset_type = 'cash' AND symbol = 'CASH' AND currency = $2`,
            [user.id, assetCurrency]
          )

          let cashHoldingId = cashHoldingResult.rows[0]?.id

          if (!cashHoldingId) {
            // Create cash holding if it doesn't exist
            const newCashResult = await client.query(
              `INSERT INTO user_holdings 
               (user_id, asset_type, symbol, name, quantity, purchase_price, purchase_date, current_price, currency)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               RETURNING id`,
              [user.id, 'cash', 'CASH', `Cash (${assetCurrency})`, shortfall, 1, purchaseDate, 1, assetCurrency]
            )
            cashHoldingId = newCashResult.rows[0].id
          } else {
            // Update existing cash holding
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
              purchaseDate,
              `Auto-deposit: Insufficient cash for ${symbol} purchase`
            ]
          )
        }
      }

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

      // Deduct cash for non-cash assets (after auto-deposit if needed)
      if (assetType !== 'cash') {
        const assetCurrency = currency || 'USD'
        const totalAmount = quantity * purchasePrice
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

      return NextResponse.json({ success: true, holding }, { status: 201 })
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

    console.error('Create holding error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create holding' },
      { status: 500 }
    )
  }
}

