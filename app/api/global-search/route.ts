import { NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const queryParam = searchParams.get('query')

  // Lazy loading: if no query, we can return a default list or trending items.
  // User feedback suggests "no stock is listed", implying they expect a default list.
  // We will allow empty query to proceed to SQL with a wildcard or separate query.

  const client = await pool.connect()
  try {
    // If queryParam is null or empty, `%${queryParam}%` becomes `%%`, which acts as a wildcard matching everything.
    const searchQuery = queryParam ? `%${queryParam}%` : '%'
    const sortQuery = queryParam ? `${queryParam}%` : ''

    // Fetch unique assets across multiple types
    // We prioritize joining with company_profiles for names
    const dbQuery = `
      SELECT DISTINCT 
        hpd.symbol,
        hpd.asset_type,
        COALESCE(cp.name, hpd.symbol) as name,
        COALESCE(cp.sector, 
          CASE 
            WHEN hpd.asset_type = 'crypto' THEN 'Cryptocurrency'
            WHEN hpd.asset_type = 'index' OR hpd.asset_type = 'kse100' OR hpd.asset_type = 'spx500' THEN 'Index'
            WHEN hpd.asset_type LIKE '%commodity%' OR hpd.asset_type = 'metals' THEN 'Commodities'
            ELSE 'Unknown'
          END
        ) as sector,
        CASE
            WHEN hpd.asset_type = 'pk-equity' OR hpd.asset_type = 'kse100' THEN 'PKR'
            ELSE 'USD'
        END as currency
      FROM historical_price_data hpd
      LEFT JOIN company_profiles cp 
        ON cp.symbol = hpd.symbol 
        AND (cp.asset_type = hpd.asset_type OR (cp.asset_type = 'equity' AND hpd.asset_type = 'pk-equity'))
      WHERE 
        ($1 = '%' OR hpd.symbol ILIKE $1 OR COALESCE(cp.name, hpd.symbol) ILIKE $1)
      ORDER BY 
        CASE 
          WHEN $2 != '' AND hpd.symbol ILIKE $2 THEN 1 
          ELSE 2 
        END,
        hpd.asset_type,
        hpd.symbol
      LIMIT 20
    `

    // $1 is %query% (or %), $2 is query% (or empty)
    const { rows } = await client.query(dbQuery, [searchQuery, sortQuery])

    return NextResponse.json({
      success: true,
      assets: rows.map(row => ({
        symbol: row.symbol,
        name: row.name,
        sector: row.sector,
        asset_type: row.asset_type,
        currency: row.currency
      }))
    })
  } catch (error: any) {
    console.error('[Global Search] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch assets',
      details: error.message
    }, { status: 500 })
  } finally {
    client.release()
  }
}
