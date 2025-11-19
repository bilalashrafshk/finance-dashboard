import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

/**
 * Batch Financials API
 * 
 * POST /api/financials/batch
 * Body: { symbols: ['PTC', 'LUCK', 'HBL', ...], assetType: 'pk-equity' }
 * 
 * Fetches financial data for multiple symbols:
 * - Company profiles (sector, industry, face_value, market_cap)
 * - Financials (last 4 quarters for EPS calculation)
 * 
 * If data is missing, triggers fetch via /api/financials/update for each symbol.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { symbols, assetType = 'pk-equity' } = body

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'Symbols array is required' }, { status: 400 })
    }

    const client = await pool.connect()
    const baseUrl = request.nextUrl.origin

    try {
      const symbolsUpper = symbols.map(s => s.toUpperCase())

      // 1. Fetch Company Profiles from DB
      const profilesQuery = `
        SELECT 
          symbol,
          sector,
          industry,
          face_value,
          market_cap
        FROM company_profiles
        WHERE asset_type = $1 AND symbol = ANY($2)
      `
      const { rows: profileRows } = await client.query(profilesQuery, [assetType, symbolsUpper])
      const profileMap = new Map(profileRows.map(r => [r.symbol, {
        sector: r.sector || 'Unknown',
        industry: r.industry || 'Unknown',
        face_value: r.face_value ? parseFloat(r.face_value) : 10,
        market_cap: r.market_cap ? parseFloat(r.market_cap) : null
      }]))

      // 2. Fetch Financials from DB
      const financialsQuery = `
        SELECT 
          symbol,
          period_end_date,
          eps_basic,
          eps_diluted
        FROM financial_statements
        WHERE asset_type = $1 
          AND symbol = ANY($2)
          AND period_type = 'quarterly'
        ORDER BY symbol, period_end_date DESC
      `
      const { rows: financialRows } = await client.query(financialsQuery, [assetType, symbolsUpper])
      
      // Group financials by symbol and take last 4 quarters
      const financialsMap = new Map<string, Array<{ period_end_date: string; eps_basic: number | null; eps_diluted: number | null }>>()
      const symbolFinancials = new Map<string, typeof financialRows>()
      
      financialRows.forEach(row => {
        if (!symbolFinancials.has(row.symbol)) {
          symbolFinancials.set(row.symbol, [])
        }
        symbolFinancials.get(row.symbol)!.push(row)
      })
      
      symbolFinancials.forEach((rows, symbol) => {
        const last4 = rows.slice(0, 4).map(r => ({
          period_end_date: r.period_end_date,
          eps_basic: r.eps_basic ? parseFloat(r.eps_basic) : null,
          eps_diluted: r.eps_diluted ? parseFloat(r.eps_diluted) : null
        }))
        if (last4.length === 4) {
          financialsMap.set(symbol, last4)
        }
      })

      // 3. Identify missing data and fetch if needed
      const missingProfiles: string[] = []
      const missingFinancials: string[] = []

      symbolsUpper.forEach(symbol => {
        if (!profileMap.has(symbol)) {
          missingProfiles.push(symbol)
        }
        if (!financialsMap.has(symbol)) {
          missingFinancials.push(symbol)
        }
      })

      // 4. Fetch missing profiles/financials via centralized route
      // We'll fetch in parallel but limit concurrency to avoid overwhelming the system
      const fetchPromises: Promise<void>[] = []

      // Fetch missing financials (which also creates profiles)
      const symbolsToFetch = Array.from(new Set([...missingProfiles, ...missingFinancials]))
      
      // Limit concurrent fetches to 5 at a time
      const BATCH_SIZE = 5
      for (let i = 0; i < symbolsToFetch.length; i += BATCH_SIZE) {
        const batch = symbolsToFetch.slice(i, i + BATCH_SIZE)
        await Promise.all(batch.map(async (symbol) => {
          try {
            const response = await fetch(`${baseUrl}/api/financials/update?symbol=${encodeURIComponent(symbol)}`, {
              method: 'GET',
            })
            if (response.ok) {
              // Re-fetch from DB after update
              const profileRes = await client.query(
                `SELECT symbol, sector, industry, face_value, market_cap 
                 FROM company_profiles 
                 WHERE asset_type = $1 AND symbol = $2`,
                [assetType, symbol]
              )
              if (profileRes.rows.length > 0) {
                const r = profileRes.rows[0]
                profileMap.set(symbol, {
                  sector: r.sector || 'Unknown',
                  industry: r.industry || 'Unknown',
                  face_value: r.face_value ? parseFloat(r.face_value) : 10,
                  market_cap: r.market_cap ? parseFloat(r.market_cap) : null
                })
              }

              const financialRes = await client.query(
                `SELECT period_end_date, eps_basic, eps_diluted
                 FROM financial_statements
                 WHERE asset_type = $1 AND symbol = $2 AND period_type = 'quarterly'
                 ORDER BY period_end_date DESC
                 LIMIT 4`,
                [assetType, symbol]
              )
              if (financialRes.rows.length === 4) {
                financialsMap.set(symbol, financialRes.rows.map(r => ({
                  period_end_date: r.period_end_date,
                  eps_basic: r.eps_basic ? parseFloat(r.eps_basic) : null,
                  eps_diluted: r.eps_diluted ? parseFloat(r.eps_diluted) : null
                })))
              }
            }
          } catch (error) {
            console.error(`[Financials Batch] Failed to fetch ${symbol}:`, error)
          }
        }))
      }

      // 5. Combine results
      const results: Record<string, any> = {}

      symbolsUpper.forEach(symbol => {
        const profile = profileMap.get(symbol)
        const financials = financialsMap.get(symbol) || []

        if (profile) {
          results[symbol] = {
            profile: {
              sector: profile.sector,
              industry: profile.industry,
              face_value: profile.face_value,
              market_cap: profile.market_cap
            },
            financials: financials
          }
        }
      })

      return NextResponse.json({
        results,
        count: Object.keys(results).length,
        requested: symbolsUpper.length
      })

    } finally {
      client.release()
    }
  } catch (error: any) {
    console.error('[Financials Batch] Error:', error)
    return NextResponse.json({
      error: 'Failed to fetch financials data',
      details: error.message
    }, { status: 500 })
  }
}

