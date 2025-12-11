import { NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const queryParam = searchParams.get('query')

  // Lazy loading: if no query, return empty or default list (optional, but requested "lazy-loading" usually implies search-as-you-type)
  // The user asked for "lazy-loading of all assets", implying we shouldn't fetch EVERYTHING at once.
  // We'll require a query of at least 1 character to search, or maybe return trending?
  // Let's implement search logic. If no query, return empty list to avoid payload size.

  if (!queryParam || queryParam.length < 1) {
    return NextResponse.json({
      success: true,
      assets: []
    })
  }

  const client = await pool.connect()
  try {
    const searchQuery = `%${queryParam}%`

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
        (hpd.symbol ILIKE $1 OR COALESCE(cp.name, hpd.symbol) ILIKE $1)
      ORDER BY 
        CASE 
          WHEN hpd.symbol ILIKE $2 THEN 1 
          ELSE 2 
        END,
        hpd.symbol
      LIMIT 20
    `

    // $1 is %query%, $2 is query% for better sorting (starts with match first)
    const { rows } = await client.query(dbQuery, [searchQuery, `${queryParam}%`])

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
