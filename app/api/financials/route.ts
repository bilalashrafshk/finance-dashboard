import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// Initialize connection pool (reuse existing env vars)
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) throw new Error('DATABASE_URL required');
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const period = searchParams.get('period') || 'quarterly'; // 'quarterly' or 'annual'

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  try {
    const client = await getPool().connect();

    try {
      // 1. Get Profile
      const profileRes = await client.query(
        `SELECT * FROM company_profiles WHERE symbol = $1`,
        [symbol]
      );
      const profile = profileRes.rows[0] || null;

      // 2. Get Financials
      // Sort by date descending (newest first)
      const financialRes = await client.query(
        `SELECT * FROM financial_statements 
         WHERE symbol = $1 AND period_type = $2 
         ORDER BY period_end_date DESC`,
        [symbol, period]
      );
      
      const financials = financialRes.rows;

      return NextResponse.json({ 
        profile, 
        financials,
        count: financials.length 
      });

    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error fetching financials:', error);
    return NextResponse.json({ error: 'Failed to fetch financials' }, { status: 500 });
  }
}

