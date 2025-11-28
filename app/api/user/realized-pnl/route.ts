import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/middleware'
import { Pool } from 'pg'
import { cacheManager } from '@/lib/cache/cache-manager'

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

/**
 * GET /api/user/realized-pnl
 * 
 * Returns the total realized PnL for the authenticated user.
 * Cached for 1 minute to reduce database load.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    // Check cache first (1 minute TTL)
    const cacheKey = `realized-pnl-${user.id}`
    const cached = cacheManager.get<number>(cacheKey)
    if (cached !== null) {
      return NextResponse.json(
        { success: true, realizedPnL: cached },
        {
          headers: {
            'Cache-Control': 'private, max-age=60', // 1 minute
            'X-Cache': 'HIT',
          },
        }
      )
    }

    const pool = getPool()
    const client = await pool.connect()

    try {
      // Query all sell transactions and extract realized PnL from notes
      // Using index on user_id and trade_type for better performance
      const result = await client.query(
        `SELECT notes
         FROM user_trades
         WHERE user_id = $1 AND trade_type = 'sell' AND notes IS NOT NULL
         ORDER BY trade_date DESC`,
        [user.id]
      )

      let totalRealizedPnL = 0
      result.rows.forEach((row) => {
        if (row.notes) {
          // Extract realized PnL from notes: "Realized P&L: 123.45 USD"
          const match = row.notes.match(/Realized P&L: ([\d.-]+)/)
          if (match) {
            const pnl = parseFloat(match[1])
            if (!isNaN(pnl)) {
              totalRealizedPnL += pnl
            }
          }
        }
      })

      // Cache the result for 1 minute
      cacheManager.setWithCustomTTL(cacheKey, totalRealizedPnL, 60 * 1000)

      return NextResponse.json(
        { success: true, realizedPnL: totalRealizedPnL },
        {
          headers: {
            'Cache-Control': 'private, max-age=60', // 1 minute
            'X-Cache': 'MISS',
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

    console.error('Get realized PnL error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get realized PnL' },
      { status: 500 }
    )
  }
}

