
import { getPostgresClient } from './db-client'

export interface LipiRecord {
    date: string // YYYY-MM-DD
    client_type: string
    sector_name: string
    buy_value: number
    sell_value: number
    net_value: number
    source: string
}

export interface LipiMetadata {
    date: string
    last_updated: string
    is_complete: boolean
}

/**
 * Insert Liquidity Map Data
 */
export async function insertLipiData(
    records: LipiRecord[]
): Promise<{ inserted: number; skipped: number }> {
    if (records.length === 0) return { inserted: 0, skipped: 0 }

    try {
        const client = await getPostgresClient()
        try {
            await client.query('BEGIN')

            let inserted = 0
            let skipped = 0

            for (const record of records) {
                try {
                    await client.query(
                        `INSERT INTO lipi_data 
             (date, client_type, sector_name, buy_value, sell_value, net_value, source, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (date, client_type, sector_name)
             DO UPDATE SET 
               buy_value = EXCLUDED.buy_value,
               sell_value = EXCLUDED.sell_value,
               net_value = EXCLUDED.net_value,
               source = EXCLUDED.source,
               updated_at = NOW()`,
                        [
                            record.date,
                            record.client_type,
                            record.sector_name,
                            record.buy_value,
                            record.sell_value,
                            record.net_value,
                            record.source
                        ]
                    )
                    inserted++
                } catch (e) {
                    skipped++
                }
            }

            // Update metadata for this date
            if (records.length > 0) {
                const date = records[0].date
                await client.query(
                    `INSERT INTO lipi_metadata (date, last_updated, is_complete)
               VALUES ($1, NOW(), TRUE)
               ON CONFLICT (date) DO UPDATE SET
                 last_updated = NOW(),
                 is_complete = TRUE`,
                    [date]
                )
            }

            await client.query('COMMIT')
            return { inserted, skipped }
        } catch (error) {
            await client.query('ROLLBACK')
            throw error
        } finally {
            client.release()
        }
    } catch (error: any) {
        console.error('[DB] Error inserting Lipi data:', error.message)
        return { inserted: 0, skipped: 0 }
    }
}

/**
 * Get Liquidity Map Data
 */
export async function getLipiData(
    startDate?: string,
    endDate?: string
): Promise<LipiRecord[]> {
    try {
        const client = await getPostgresClient()
        try {
            let query = `
        SELECT date, client_type, sector_name, buy_value, sell_value, net_value, source
        FROM lipi_data
        WHERE 1=1
      `
            const params: any[] = []

            if (startDate) {
                query += ` AND date >= $${params.length + 1}`
                params.push(startDate)
            }
            if (endDate) {
                query += ` AND date <= $${params.length + 1}`
                params.push(endDate)
            }

            query += ` ORDER BY date DESC, net_value DESC`

            const result = await client.query(query, params)

            return result.rows.map((row: any) => ({
                date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date,
                client_type: row.client_type,
                sector_name: row.sector_name,
                buy_value: parseFloat(row.buy_value),
                sell_value: parseFloat(row.sell_value),
                net_value: parseFloat(row.net_value),
                source: row.source
            }))

        } finally {
            client.release()
        }
    } catch (error: any) {
        console.error('[DB] Error getting Lipi data:', error.message)
        return []
    }
}

/**
 * Check if we should refresh data for a given date
 * Optimization: Historic data (past dates) never expires if present.
 */
export async function shouldRefreshLipiData(date: string): Promise<boolean> {
    try {
        const client = await getPostgresClient()
        try {
            const result = await client.query(
                `SELECT last_updated FROM lipi_metadata WHERE date = $1`,
                [date]
            )

            // If no data exists, we MUST fetch
            if (result.rows.length === 0) return true

            // If data exists, check if it is "historic"
            const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
            if (date < today) {
                // It is a past date and we have metadata (meaning we fetched it once)
                // Historic data does not change, so do NOT refresh
                return false
            }

            // If it is Today, we might want to refresh if it's stale (e.g. > 1 hour)
            const lastUpdated = new Date(result.rows[0].last_updated).getTime()
            const now = Date.now()

            // For 'Today', refresh if older than 1 hour to capture intraday updates if any
            return (now - lastUpdated) > (60 * 60 * 1000)
        } finally {
            client.release()
        }
    } catch (error) {
        return true
    }
}
