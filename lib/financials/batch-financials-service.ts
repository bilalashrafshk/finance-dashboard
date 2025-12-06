import { Pool } from 'pg'
import { updateFinancials } from './financials-update-service'

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

export interface BatchFinancialsResult {
    profile: {
        sector: string
        industry: string
        face_value: number
        market_cap: number | null
    }
    financials: Array<{
        period_end_date: string
        eps_basic: number | null
        eps_diluted: number | null
    }>
}

export async function fetchBatchFinancials(
    symbols: string[],
    assetType: string = 'pk-equity'
): Promise<{ results: Record<string, BatchFinancialsResult>; count: number; requested: number }> {
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return { results: {}, count: 0, requested: 0 }
    }

    const client = await pool.connect()

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

        // 4. Fetch missing profiles/financials via service
        // We'll fetch in parallel but limit concurrency to avoid overwhelming the system
        const symbolsToFetch = Array.from(new Set([...missingProfiles, ...missingFinancials]))

        // Limit concurrent fetches to 10 at a time (increased from 5)
        const BATCH_SIZE = 10
        for (let i = 0; i < symbolsToFetch.length; i += BATCH_SIZE) {
            const batch = symbolsToFetch.slice(i, i + BATCH_SIZE)
            await Promise.all(batch.map(async (symbol) => {
                try {
                    // Direct service call instead of fetch, wrapped in a timeout
                    // Create a promise that rejects after 20 seconds
                    const timeoutPromise = new Promise<any>((_, reject) => {
                        setTimeout(() => reject(new Error('Timeout')), 20000)
                    })

                    // Race the update against the timeout
                    const result = await Promise.race([
                        updateFinancials(symbol),
                        timeoutPromise
                    ])

                    if (result.success) {
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
        const results: Record<string, BatchFinancialsResult> = {}

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

        return {
            results,
            count: Object.keys(results).length,
            requested: symbolsUpper.length
        }

    } finally {
        client.release()
    }
}
