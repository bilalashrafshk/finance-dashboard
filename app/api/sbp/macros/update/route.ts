import { NextResponse } from 'next/server'
import { Pool } from 'pg'
import { ensureSBPEconomicData, MACRO_KEYS } from '@/lib/portfolio/sbp-service'
import { SBPMacroSyncService, BOP_SERIES_KEYS } from '@/lib/portfolio/sbp-macro-sync'

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

export const maxDuration = 60 // Max 60s for Vercel

/**
 * CRON JOB: Dedicated Macro Economic Data Update
 * 
 * Frequency: Every 5-10 minutes (to power BoP "Watcher")
 * 
 * Logic:
 * 1. Checks SBP "Release Date" sensor for BoP.
 * 2. Prioritizes BoP keys if a new release is detected.
 * 3. Processes all macros (CPI, KIBOR, etc.) by staleness.
 * 4. Respects Vercel's 60s limit by processing in chunks and stopping early.
 */
export async function GET(request: Request) {
    const startTime = Date.now()
    const TIME_LIMIT_MS = 52000 // 52 seconds safety limit to allow for db commit/release
    const CONCURRENCY = 3 // Parallel fetches to stay under timeout

    // 1. Gather all unique keys from both services
    const ALL_KEYS = Array.from(new Set([...MACRO_KEYS, ...BOP_SERIES_KEYS]))

    // 2. BoP Sensor Check
    let sbpReleaseDate: Date | null = null
    try {
        const sbpReleaseStr = await SBPMacroSyncService.checkBoPUpdateNeeded()
        if (sbpReleaseStr) {
            // SBP Date parsing (e.g. 19-Jan-2026)
            const parts = sbpReleaseStr.split('-')
            const months: Record<string, number> = {
                Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
                Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
            }
            sbpReleaseDate = new Date(parseInt(parts[2]), months[parts[1]] || 0, parseInt(parts[0]))
            console.log(`[Macro Update] BoP Release Detected: ${sbpReleaseStr}. Priority sync triggered.`)
        }
    } catch (err) {
        console.error('[Macro Update] BoP Sensor failed:', err)
    }

    const client = await pool.connect()

    try {
        // 3. Fetch current staleness from both metadata tables
        const macroMeta = await client.query(
            `SELECT series_key, last_updated FROM sbp_economic_metadata WHERE series_key = ANY($1)`,
            [ALL_KEYS]
        )
        const bopMeta = await client.query(
            `SELECT series_key, last_updated FROM bop_metadata WHERE series_key = ANY($1)`,
            [ALL_KEYS]
        )

        const lastUpdatedMap = new Map<string, number>()
        const processMeta = (rows: any[]) => {
            rows.forEach((row: any) => {
                const dateVal = row.last_updated instanceof Date ? row.last_updated : new Date(row.last_updated)
                lastUpdatedMap.set(row.series_key, dateVal.getTime())
            })
        }
        processMeta(macroMeta.rows)
        processMeta(bopMeta.rows)

        // 4. Calculate "Effective Age" and Sort
        // Logic: 
        // - If BoP key AND (last_updated < sbpReleaseDate), priority = Infinity (extremely stale)
        // - Else, priority = NOW() - last_updated
        const sortedKeys = ALL_KEYS.sort((a, b) => {
            const lastUpdateA = lastUpdatedMap.get(a) || 0
            const lastUpdateB = lastUpdatedMap.get(b) || 0

            let priorityA = Date.now() - lastUpdateA
            let priorityB = Date.now() - lastUpdateB

            const isBopA = a.startsWith('TS_GP_BOP_BPM6SUM_M')
            const isBopB = b.startsWith('TS_GP_BOP_BPM6SUM_M')

            // Apply priority bump for BoP releases
            if (sbpReleaseDate) {
                const releaseTime = sbpReleaseDate.getTime()
                if (isBopA && lastUpdateA < releaseTime) priorityA = Infinity
                if (isBopB && lastUpdateB < releaseTime) priorityB = Infinity
            }

            return priorityB - priorityA // Descending priority (highest first)
        })

        // 5. Filter for "Stale" keys only (to avoid redundant API calls every 5 mins)
        const staleKeys = sortedKeys.filter(key => {
            const lastUpdate = lastUpdatedMap.get(key) || 0
            const isBop = key.startsWith('TS_GP_BOP_BPM6SUM_M')

            if (isBop) {
                // Priority: If SBP updated, definitely sync
                if (sbpReleaseDate && lastUpdate < sbpReleaseDate.getTime()) return true
                // Fallback: Sync if not updated for 24h
                if (Date.now() - lastUpdate > 1000 * 60 * 60 * 24) return true
                return false
            }

            // Standard Macro: Sync if older than 3 days
            return Date.now() - lastUpdate > 1000 * 60 * 60 * 24 * 3
        })

        console.log(`[Macro Update] Loop starting. Keys to process: ${staleKeys.length}/${ALL_KEYS.length}. Priority sync: ${sbpReleaseDate !== null}`)

        const updatedKeys: string[] = []
        const failedKeys: string[] = []

        // 6. Unified Processing Loop
        for (let i = 0; i < staleKeys.length; i += CONCURRENCY) {
            if (Date.now() - startTime > TIME_LIMIT_MS) {
                console.log(`[Macro Update] Soft time limit reached at idx ${i}. Halting.`)
                break
            }

            const chunk = staleKeys.slice(i, i + CONCURRENCY)
            await Promise.all(chunk.map(async (key) => {
                try {
                    // Route to appropriate sync service
                    if (key.startsWith('TS_GP_BOP_BPM6SUM_M')) {
                        await SBPMacroSyncService.syncSingleSeries(key)
                    } else {
                        await ensureSBPEconomicData(key, undefined, undefined, true) // Force true since we pre-filtered
                    }
                    updatedKeys.push(key)
                } catch (err) {
                    console.error(`[Macro Update] Error syncing ${key}:`, err)
                    failedKeys.push(key)
                }
            }))
        }

        return NextResponse.json({
            success: true,
            status: updatedKeys.length > 0 ? 'partial_or_full_sync' : 'idle',
            results: {
                total_stale: staleKeys.length,
                updated: updatedKeys.length,
                failed: failedKeys.length,
                remaining_in_stale_queue: staleKeys.length - updatedKeys.length - failedKeys.length
            },
            priority_sync: sbpReleaseDate !== null,
            duration_ms: Date.now() - startTime
        })

    } catch (error: any) {
        console.error('[Macro Update] Critical Failure:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    } finally {
        client.release()
    }
}
