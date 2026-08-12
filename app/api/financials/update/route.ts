import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { updateFinancials } from '@/lib/financials/financials-update-service';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

export const maxDuration = 60; // Max 60s for Vercel

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const force = searchParams.get('force') === 'true';

  // 1. Single Symbol Mode (Direct User or API request)
  if (symbol) {
    try {
      const result = await updateFinancials(symbol, force);
      return NextResponse.json(result, { status: result.success !== false ? 200 : 500 });
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // 2. Cron / Batch Mode (Automated background update for oldest symbols)
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 3;

  const client = await pool.connect();
  try {
    const staleQuery = `
      SELECT h.symbol
      FROM historical_price_data h
      LEFT JOIN company_profiles p ON h.symbol = p.symbol AND p.asset_type = 'pk-equity'
      WHERE h.asset_type = 'pk-equity'
      GROUP BY h.symbol, p.last_updated
      ORDER BY p.last_updated ASC NULLS FIRST, h.symbol ASC
      LIMIT $1
    `;
    const { rows } = await client.query(staleQuery, [limit]);
    const symbolsToUpdate = rows.map((r: any) => r.symbol);

    const results: Record<string, any> = {};
    for (const sym of symbolsToUpdate) {
      try {
        results[sym] = await updateFinancials(sym, true);
      } catch (err: any) {
        results[sym] = { success: false, error: err.message };
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount: Object.keys(results).length,
      symbols: symbolsToUpdate,
      results
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
