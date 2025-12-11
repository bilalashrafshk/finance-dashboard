import { NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

export async function GET() {
  const client = await pool.connect()
  try {
    // Fetch unique assets across multiple types
    // We prioritize joining with company_profiles for names
    const query = `
      SELECT DISTINCT 
        hpd.symbol,
        hpd.asset_type,
        COALESCE(cp.name, hpd.symbol) as name,
        COALESCE(cp.sector, 
          CASE 
            WHEN hpd.asset_type = 'crypto' THEN 'Cryptocurrency'
            WHEN hpd.asset_type = 'index' THEN 'Index'
            WHEN hpd.asset_type LIKE '%commodity%' OR hpd.asset_type = 'metals' THEN 'Commodities'
            ELSE 'Unknown'
          END
        ) as sector
      FROM historical_price_data hpd
      LEFT JOIN company_profiles cp 
        ON cp.symbol = hpd.symbol 
        AND (cp.asset_type = hpd.asset_type OR (cp.asset_type = 'equity' AND hpd.asset_type = 'pk-equity'))
      WHERE hpd.asset_type IN ('pk-equity', 'us-equity')
      ORDER BY hpd.asset_type, hpd.symbol
    `

    const { rows } = await client.query(query)

    return NextResponse.json({
      success: true,
      assets: rows.map(row => ({
        symbol: row.symbol,
        name: row.name,
        sector: row.sector,
        asset_type: row.asset_type
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
