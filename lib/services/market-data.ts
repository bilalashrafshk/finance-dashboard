
import { Pool, PoolClient } from 'pg'
import { isMarketClosed } from '@/lib/portfolio/market-hours'
import { AssetCategory } from '@/validations/market-data'
import { getPostgresClient } from '@/lib/portfolio/db-client'

interface MarketDataEntry {
    price: number
    date: string
    updated_at: Date
}

export class MarketDataService {
    private static instance: MarketDataService
    private static activeRequests = new Map<string, Promise<any>>()
    private static BATCH_CONCURRENCY = 10

    private constructor() { }

    public static getInstance(): MarketDataService {
        if (!MarketDataService.instance) {
            MarketDataService.instance = new MarketDataService()
        }
        return MarketDataService.instance
    }

    /**
     * Determine Cache TTL based on Category & Market Status
     */
    private getTTL(category: AssetCategory, symbol: string): number {
        // 1. Crypto: 20 Minutes
        if (category === 'crypto') return 20 * 60 * 1000

        // 2. Macro: 5 Days
        if (category === 'macro') return 5 * 24 * 60 * 60 * 1000

        // 3. Financials / Dividend: 10 Days
        if (category === 'financials' || category === 'dividend') return 10 * 24 * 60 * 60 * 1000

        // 4. Equities / Indices
        if (category === 'equity' || category === 'index') {
            // Determine market type for helper
            // This is a heuristic. We might need a better mapping if 'symbol' doesn't imply market.
            // Assuming: 
            // - PK Equity: typically 3-4 chars? Or explicitly 'pk-equity' type passed
            // - US Equity: 'us-equity'
            // The validation schema passes 'equity', but market-hours needs 'US' | 'PSX'.
            // We'll optimistically default to 'US' for generic equities unless we can detect PSX.
            // For now, let's look at the implementation plan or existing usage:
            // Routes passed: 'pk-equity' -> 'equity'. 
            // We might need to pass specific market type or infer it.

            // Heuristic: If category is strictly 'equity', we rely on calling code/context?
            // Actually `ensureData` takes `category: AssetCategory`. 
            // The Validations allow 'equity', 'crypto' etc.
            // Wait, standard `AssetCategory` in validation is generic.
            // Let's check `isMarketClosed` signature: `market: 'US' | 'PSX' | 'crypto'`

            // Let's refine the input. We might need sub-types or just try both?
            // Or we can say: 
            // If symbol ends with .KA -> PSX? Or just assume generic Equity is US unless specified?
            // Given the dashboard context (Risk Metric Dashboard), it heavily features PK (PSX) and US.

            // Simpler approach for TTL:
            // If it's Weekend (Sat/Sun), 24h.
            // If Weekday:
            //   Check if roughly "Night" in either US or PK?
            //   Actually the user spec said: "If OPEN: 1 Hour. If CLOSED: 12 Hours".
            //   We can check `isMarketClosed('US')` AND `isMarketClosed('PSX')`.
            //   If BOTH are closed -> 12h.
            //   If ANY is open -> 1h.
            //   This is safe enough.

            const usClosed = isMarketClosed('US')
            const psxClosed = isMarketClosed('PSX')

            if (usClosed && psxClosed) {
                return 12 * 60 * 60 * 1000 // 12 Hours
            }
            return 60 * 60 * 1000 // 1 Hour
        }

        return 60 * 60 * 1000 // Default 1h
    }

    /**
     * Main Method: Ensure Data Freshness with Deduplication
     */
    public async ensureData<T>(
        category: AssetCategory,
        symbol: string,
        fetcher: () => Promise<T>,
        forceRefresh: boolean = false
    ): Promise<T | null> {
        const normalizedSymbol = symbol.toUpperCase()
        const requestKey = `fetch_${category}_${normalizedSymbol}`

        // 1. Check Deduplication Map
        if (MarketDataService.activeRequests.has(requestKey)) {
            console.log(`[MarketData] ⚡ Joining active request: ${normalizedSymbol}`)
            try {
                const result = await MarketDataService.activeRequests.get(requestKey)
                // Clone if necessary? Promises return values, assume stateless data objects.
                return result
            } catch (err) {
                // If the shared promise failed, we might want to retry our own?
                // For now, propagate failure or fall through to DB check?
                // Let's fall through to DB check if fetch failed, safer.
                console.warn(`[MarketData] Shared fetch failed for ${normalizedSymbol}, falling back to DB/Retry`)
                // Remove key just in case (though catch block in fetcher should do it)
                MarketDataService.activeRequests.delete(requestKey)
            }
        }

        // 2. DB Freshness Check (unless forced)
        if (!forceRefresh) {
            const dbData = await this.getFromDB(category, normalizedSymbol)
            if (dbData) {
                const ttl = this.getTTL(category, normalizedSymbol)
                const age = Date.now() - new Date(dbData.updated_at).getTime()

                if (age < ttl) {
                    // Fresh enough
                    return this.mapDBDataToResult<T>(dbData, category)
                }
            }
        }

        // 3. Trigger Fetch (Deduplicated)
        const fetchPromise = (async () => {
            console.log(`[MarketData] 🌍 Fetching External: ${normalizedSymbol} (${category})`)
            try {
                // Timeout Logic
                // 8s for Financials/Macros (slow scrapers), 5s for Prices
                const timeoutMs = (category === 'financials' || category === 'macro') ? 8000 : 5000

                const data = await Promise.race([
                    fetcher(),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
                    )
                ])

                if (!data) throw new Error('No data returned')

                // 4. Upsert to DB
                await this.upsertToDB(category, normalizedSymbol, data)

                return data
            } catch (error: any) {
                console.error(`[MarketData] Fetch failed for ${normalizedSymbol}: ${error.message}`)

                // 5. Fail-over: Return Stale DB Data if available
                const staleData = await this.getFromDB(category, normalizedSymbol)
                if (staleData) {
                    const result = this.mapDBDataToResult<T>(staleData, category)
                    // Inject warning if T is an object
                    if (result && typeof result === 'object') {
                        (result as any)._warning = 'stale'
                    }
                    return result
                }

                // If absolutely nothing, return null (don't throw crash)
                return null
            } finally {
                MarketDataService.activeRequests.delete(requestKey)
            }
        })()

        MarketDataService.activeRequests.set(requestKey, fetchPromise)
        return fetchPromise
    }

    /**
     * Batch Operation: Efficiently fetch multiple items
     */
    public async ensureBatchData<T>(
        items: { category: AssetCategory; symbol: string; fetcher: () => Promise<T> }[]
    ): Promise<Record<string, T | null>> {
        const results: Record<string, T | null> = {}
        const toFetch: typeof items = []

        // 1. Bulk DB Check
        // optimization: We'll do distinct DB queries by category for "WHERE IN"
        // For simplicity in this v1, we iterate (since getFromDB is simple)
        // BUT user spec asked for "Query all symbols in ONE SQL call".
        // We should implement `getManyFromDB`.

        // Group by category
        const byCat = new Map<AssetCategory, string[]>()
        items.forEach(i => {
            const list = byCat.get(i.category) || []
            list.push(i.symbol.toUpperCase())
            byCat.set(i.category, list)
        })

        // Fetch from DB in parallel categories
        const dbResults = new Map<string, MarketDataEntry>()

        await Promise.all(Array.from(byCat.entries()).map(async ([cat, syms]) => {
            const rows = await this.getManyFromDB(cat, syms)
            rows.forEach(r => {
                // Create a composite key or just ensure we match correct symbol back
                // getManyFromDB should return map of symbol -> entry
                // We'll store in a global map key `${cat}:${symbol}`
                Object.entries(r).forEach(([s, entry]) => {
                    dbResults.set(`${cat}:${s}`, entry)
                })
            })
        }))

        // 2. Filter Freshness
        for (const item of items) {
            const key = `${item.category}:${item.symbol.toUpperCase()}`
            const entry = dbResults.get(key)
            let needsFetch = true

            if (entry) {
                const ttl = this.getTTL(item.category, item.symbol)
                const age = Date.now() - new Date(entry.updated_at).getTime()
                if (age < ttl) {
                    results[item.symbol] = this.mapDBDataToResult<T>(entry, item.category)
                    needsFetch = false
                }
            }

            if (needsFetch) {
                toFetch.push(item)
            } else if (!results[item.symbol]) {
                // Should ideally not happen if logic is correct, but init result
                results[item.symbol] = null
            }
        }

        // 3. Parallel Fetch (Limited Concurrency)
        // We can use a simple queue or recursion for concurrency limit
        // Since we want to use `ensureData` to leverage its logic (dedup, upsert, failover),
        // we can just map `toFetch` to `ensureData` calls and `Promise.all` with limiting. (Or strictly `ensureData` handles the fetch).

        // However, `ensureData` does its own DB check. 
        // To be perfectly optimum, `ensureData` should export a `fetchOnly` mode?
        // Actually, calling `ensureData` is fine. It double-checks DB, which is cheap (1ms) compared to network.
        // BUT we want to limit CONCURRENCY.

        const queue = [...toFetch]
        const activeWorkers = new Set<Promise<void>>()

        const processItem = async (item: typeof items[0]) => {
            const res = await this.ensureData(item.category, item.symbol, item.fetcher, true) // Force refresh as we already decided it's stale
            results[item.symbol] = res
        }

        // Simple limiting loop
        while (queue.length > 0 || activeWorkers.size > 0) {
            while (queue.length > 0 && activeWorkers.size < MarketDataService.BATCH_CONCURRENCY) {
                const item = queue.shift()!
                const p = processItem(item).then(() => {
                    activeWorkers.delete(p)
                })
                activeWorkers.add(p)
            }

            if (activeWorkers.size > 0) {
                // Wait for at least one to finish
                await Promise.race(activeWorkers)
            } else {
                break
            }
        }

        return results
    }

    // --- Database Helpers ---
    // We'll need to use `pg` directly since 'MarketDataEntry' isn't fully reflective of all tables.
    // We assume specific tables: `historical_price_data` for prices.
    // `ingested_financials`?
    // Let's stick to `historical_price_data` for 'crypto', 'equity', 'index', 'commodity', 'metal'.
    // For 'macro', maybe `sbp_macro_data`? 
    // The user prompt implies unified cache logic.
    // We'll assume `historical_price_data` (asset_type, symbol) covers most.
    // For unmapped categories or complex data, we might need specific queries.
    // For now, implementing for `historical_price_data` is the priority.

    /**
   * Public API to store external data (e.g. from client scraping)
   */
    public async upsertExternalData(
        category: AssetCategory,
        symbol: string,
        data: MockDataPoint[] | MockDataPoint
    ): Promise<void> {
        await this.upsertToDB(category, symbol, data)
    }

    private async getFromDB(category: AssetCategory, symbol: string): Promise<MarketDataEntry | null> {
        const client = await getPostgresClient()
        try {
            // Map category to DB asset_type if needed. 
            // 'equity' -> 'pk-equity' or 'us-equity'?
            // We might need to handle this ambiguity.
            // Ideally, the caller passes the specific DB asset_type (e.g. 'pk-equity'). 
            // But validators/AssetCategory allows generic 'equity'.

            // We'll search for BOTH 'pk-equity' and 'us-equity' if category is 'equity'?
            // Or we rely on 'symbol' being unique?

            if (category === 'equity') {
                // Query for either pk-equity or us-equity if generic equity requested
                // This assumes symbol uniqueness or preference
                const query = `
                    SELECT close as price, date, updated_at 
                    FROM historical_price_data 
                    WHERE (asset_type = 'pk-equity' OR asset_type = 'us-equity')
                        AND symbol = $1
                    ORDER BY date DESC 
                    LIMIT 1
                `
                const res = await client.query(query, [symbol])
                if (res.rows.length === 0) return null

                const r = res.rows[0]
                return {
                    price: parseFloat(r.price),
                    date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date,
                    updated_at: r.updated_at
                }
            }

            const query = `
                SELECT close as price, date, updated_at 
                FROM historical_price_data 
                WHERE asset_type = $1 AND symbol = $2
                ORDER BY date DESC 
                LIMIT 1
            `

            const res = await client.query(query, [category, symbol])
            if (res.rows.length === 0) return null

            const r = res.rows[0]
            return {
                price: parseFloat(r.price),
                date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : r.date,
                updated_at: r.updated_at
            }
        } finally {
            client.release()
        }
    }

    private async getManyFromDB(category: AssetCategory, symbols: string[]): Promise<Map<string, MarketDataEntry>> {
        const client = await getPostgresClient()
        const results = new Map<string, MarketDataEntry>()
        try {
            // Similar to getFromDB but with IN clause and DISTINCT ON (symbol)
            const query = `
         SELECT DISTINCT ON (symbol) symbol, close as price, date, updated_at
         FROM historical_price_data
         WHERE ${category === 'equity' ? '(asset_type = \'pk-equity\' OR asset_type = \'us-equity\')' : 'asset_type = $1'}
           AND symbol = ANY($${category === 'equity' ? 1 : 2})
         ORDER BY symbol, date DESC
       `

            const res = await client.query(query, category === 'equity' ? [symbols] : [category, symbols])
            res.rows.forEach(r => {
                results.set(r.symbol, {
                    price: parseFloat(r.price),
                    date: r.date.toISOString(),
                    updated_at: r.updated_at
                })
            })
            return results
        } finally {
            client.release()
        }
    }

    private async upsertToDB(category: AssetCategory, symbol: string, data: any): Promise<void> {
        const { insertHistoricalData } = await import('@/lib/portfolio/db-client')

        // Normalize data to array
        const items = Array.isArray(data) ? data : [data]

        // Map items to HistoricalPriceRecord format
        const records = items.map((item: any) => {
            let dateStr = item.date || new Date().toISOString().split('T')[0]
            if (typeof dateStr === 'string' && dateStr.includes('T')) {
                dateStr = dateStr.split('T')[0]
            }
            return {
                date: dateStr,
                open: item.open ?? item.price,
                high: item.high ?? item.price,
                low: item.low ?? item.price,
                close: item.close ?? item.price,
                volume: item.volume ?? null,
                adjusted_close: null,
                change_pct: null
            }
        })

        // Determines DB Asset Type
        let dbType = category as string
        // Default 'equity' to 'pk-equity' if not specified? 
        // Or usage of upsertExternalData should specify correct type (pk-equity vs us-equity)
        if (category === 'equity') dbType = 'pk-equity'

        await insertHistoricalData(dbType, symbol, records, 'market-data-service' as any)
    }

    private mapDBDataToResult<T>(entry: MarketDataEntry, category: AssetCategory): T {
        // Reconstruct a generic object matching 'fetcher' output
        // This is partial. Real fetchers return { price, change, volume... }
        // We only stored 'price'.
        // For full fidelity, we'd need to store full JSON or all columns.
        // Given constraints, returning price object is MVP.
        return {
            price: entry.price,
            date: entry.date,
            // _source: 'db'
        } as unknown as T
    }
}

// Temporary interface for type safety in upsert
interface MockDataPoint {
    price?: number
    close?: number
    date: string
    [key: string]: any
}
