import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { extractTokenFromHeader, verifyToken } from '@/lib/auth/auth-utils'

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

/**
 * Admin Historical Data API
 * 
 * Supports pagination, sorting, and date filtering for internal use.
 */
export async function GET(request: NextRequest) {
    // Auth Check
    const authHeader = request.headers.get('Authorization')
    const token = extractTokenFromHeader(authHeader)
    const user = token ? verifyToken(token) : null

    if (!user || user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const sortBy = searchParams.get('sortBy') || 'date'
    const sortOrder = searchParams.get('sortOrder') || 'DESC'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!symbol) {
        return NextResponse.json({ error: 'Symbol is required' }, { status: 400 })
    }

    const offset = (page - 1) * limit
    const client = await pool.connect()

    try {
        // 1. Build Query
        let query = `
      SELECT 
        date::text, 
        open, 
        high, 
        low, 
        close, 
        volume, 
        change_pct,
        source
      FROM historical_price_data
      WHERE asset_type = 'pk-equity' AND symbol = $1
    `
        const params: any[] = [symbol.toUpperCase()]
        let paramIdx = 2

        if (startDate) {
            query += ` AND date >= $${paramIdx++}`
            params.push(startDate)
        }
        if (endDate) {
            query += ` AND date <= $${paramIdx++}`
            params.push(endDate)
        }

        // 2. Add Sorting & Pagination
        const validSortFields = ['date', 'open', 'high', 'low', 'close', 'volume', 'change_pct']
        const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'date'
        const finalSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

        query += ` ORDER BY ${finalSortBy} ${finalSortOrder}`
        query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`
        params.push(limit, offset)

        // 3. Execute queries (Data + Total Count)
        const [dataRes, countRes] = await Promise.all([
            client.query(query, params),
            client.query(
                `SELECT COUNT(*) FROM historical_price_data WHERE asset_type = 'pk-equity' AND symbol = $1 ${startDate ? `AND date >= $2` : ''} ${endDate ? `AND date <= ${startDate ? '$3' : '$2'}` : ''}`,
                [symbol.toUpperCase(), ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : [])]
            )
        ])

        const total = parseInt(countRes.rows[0].count)

        return NextResponse.json({
            success: true,
            data: dataRes.rows,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        })

    } catch (error: any) {
        console.error('[Admin Price Viewer API] Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    } finally {
        client.release()
    }
}
