import { NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

/**
 * Get All PK Equities with Price Data
 * 
 * GET /api/screener/stocks
 * 
 * Returns all PK equity symbols that have price data in the database.
 * This matches what the screener update route processes.
 */
export async function GET() {
  const client = await pool.connect()
  try {
    // Get all PK Equity symbols that have price data (same query as screener update)
    const { rows } = await client.query(`
      SELECT DISTINCT 
        hpd.symbol,
        COALESCE(cp.name, hpd.symbol) as name,
        COALESCE(cp.sector, 'Unknown') as sector,
        COALESCE(cp.industry, 'Unknown') as industry
      FROM historical_price_data hpd
      LEFT JOIN company_profiles cp ON cp.symbol = hpd.symbol AND cp.asset_type = 'pk-equity'
      WHERE hpd.asset_type = 'pk-equity'
      ORDER BY hpd.symbol
    `)
    
    return NextResponse.json({ 
      success: true,
      stocks: rows.map(row => ({
        symbol: row.symbol,
        name: row.name,
        sector: row.sector,
        industry: row.industry
      }))
    })
  } catch (error: any) {
    console.error('[Screener Stocks] Error:', error)
    return NextResponse.json({ 
      success: false,
      error: 'Failed to fetch stocks',
      details: error.message 
    }, { status: 500 })
  } finally {
    client.release()
  }
}

