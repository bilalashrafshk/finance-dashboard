import { NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

export const revalidate = 3600 // Cache for 1 hour

export async function GET() {
  const client = await pool.connect()
  try {
    // Return ALL entries from screener_metrics, not just those with P/E ratios
    // This ensures stocks with price but no P/E still appear in the screener
    const res = await client.query(`
      SELECT 
        symbol, 
        sector,
        industry,
        price, 
        pe_ratio, 
        sector_pe, 
        relative_pe,
        industry_pe,
        relative_pe_industry,
        dividend_yield,
        market_cap
      FROM screener_metrics
      WHERE asset_type = 'pk-equity'
      ORDER BY 
        CASE WHEN relative_pe IS NOT NULL THEN 0 ELSE 1 END,
        relative_pe ASC NULLS LAST,
        symbol ASC
    `)
    
    return NextResponse.json({ data: res.rows })
  } catch (error) {
    console.error('Failed to fetch screener metrics', error)
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  } finally {
    client.release()
  }
}

