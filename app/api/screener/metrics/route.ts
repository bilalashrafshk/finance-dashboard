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
    const res = await client.query(`
      SELECT 
        symbol, 
        sector, 
        price, 
        pe_ratio, 
        sector_pe, 
        relative_pe, 
        dividend_yield,
        market_cap
      FROM screener_metrics
      WHERE pe_ratio IS NOT NULL
      ORDER BY relative_pe ASC
    `)
    
    return NextResponse.json({ data: res.rows })
  } catch (error) {
    console.error('Failed to fetch screener metrics', error)
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  } finally {
    client.release()
  }
}

