import { NextResponse } from 'next/server'
import { Pool } from 'pg'
import { ensureSBPEconomicData, MACRO_KEYS } from '@/lib/portfolio/sbp-service'

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

export const maxDuration = 60 // Max 60s for Vercel

/**
 * CRON JOB: Dedicated Macro Economic Data Update
 * 
 * Frequency: Every 6 hours (Macro data changes slowly)
 * 
 * Logic:
 * 1. Prioritize staleness: Update keys that haven't been updated in 3+ days.
 * 2. Time-budgeted: Process keys in small batches until ~55s limit to avoid timeout.
 */
export async function GET(request: Request) {
    const startTime = Date.now()
    const TIME_LIMIT_MS = 55000 // 55 seconds safety limit
    const CONCURRENCY = 2 // Small batch parallelism to stay safe with SBP API
    const client = await pool.connect()

    try {
        // 1. Fetch metadata to determine staleness
        const metaRes = await client.query(
            `SELECT series_key, last_updated FROM sbp_economic_metadata WHERE series_key = ANY($1)`,
            [MACRO_KEYS]
        )

        const lastUpdatedMap = new Map<string, number>()
        metaRes.rows.forEach((row: any) => {
            const dateVal = row.last_updated instanceof Date ? row.last_updated : new Date(row.last_updated)
            lastUpdatedMap.set(row.series_key, dateVal.getTime())
        })

        // 2. Sort keys by staleness (oldest/missing first)
        const sortedKeys = [...MACRO_KEYS].sort((a, b) => {
            const timeA = lastUpdatedMap.get(a) || 0
            const timeB = lastUpdatedMap.get(b) || 0
            return timeA - timeB
        })

        console.log(`[Macro Update] Starting prioritized update. Total keys: ${sortedKeys.length}. Concurrency: ${CONCURRENCY}`)

        const updatedKeys: string[] = []
        const failedKeys: string[] = []

        // 3. Process keys in chunks until time limit
        for (let i = 0; i < sortedKeys.length; i += CONCURRENCY) {
            if (Date.now() - startTime > TIME_LIMIT_MS) {
                console.log(`[Macro Update] Time limit reached at index ${i}. Stopping.`)
                break
            }

            const chunk = sortedKeys.slice(i, i + CONCURRENCY)
            console.log(`[Macro Update] Processing chunk: ${chunk.join(', ')}`)

            await Promise.all(chunk.map(async (key) => {
                try {
                    await ensureSBPEconomicData(key)
                    updatedKeys.push(key)
                } catch (err) {
                    console.error(`[Macro Update] Failed to update ${key}:`, err)
                    failedKeys.push(key)
                }
            }))
        }

        return NextResponse.json({
            success: true,
            updated_count: updatedKeys.length,
            updated_keys: updatedKeys,
            failed_count: failedKeys.length,
            failed_keys: failedKeys,
            duration_ms: Date.now() - startTime,
            remaining_keys: sortedKeys.length - updatedKeys.length - failedKeys.length
        })

    } catch (error: any) {
        console.error('[Macro Update] Critical Failure:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    } finally {
        client.release()
    }
}
