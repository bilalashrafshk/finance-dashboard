import { getPool } from '@/lib/db'

export interface MarketHeatmapStock {
    symbol: string
    name: string
    marketCap: number
    price: number
    previousPrice: number | null
    changePercent: number | null
    sector: string | null
    industry: string | null
}

export interface MarketHeatmapResult {
    stocks: MarketHeatmapStock[]
    sectors: MarketSectorPerformance[]
    indices: MarketIndexData[]
    date: string
    timeframe: string
}

export interface MarketSectorPerformance {
    name: string
    change: number
    volume: string | number
}

export interface MarketIndexData {
    name: string
    price: number
    change: number
    changePercent: number
    history: number[]
}

export class MarketHeatmapService {
    /**
     * Get heatmap and index data for a specific date
     */
    static async getHeatmapData(
        date: string,
        limit: number = 100,
        timeframe: string = '1D',
        startDateParam?: string
    ): Promise<MarketHeatmapResult> {
        // Calculate Start Date based on timeframe or param
        const targetDateObj = new Date(date)
        let startDate = ''

        if (startDateParam && /^\d{4}-\d{2}-\d{2}$/.test(startDateParam)) {
            startDate = startDateParam
        } else if (timeframe === '1D') {
            // For 1D, we want the *strictly previous* data point
            targetDateObj.setDate(targetDateObj.getDate() - 1)
            startDate = targetDateObj.toISOString().split('T')[0]
        } else if (timeframe === '1W') {
            targetDateObj.setDate(targetDateObj.getDate() - 7)
            startDate = targetDateObj.toISOString().split('T')[0]
        } else if (timeframe === '1M') {
            targetDateObj.setMonth(targetDateObj.getMonth() - 1)
            startDate = targetDateObj.toISOString().split('T')[0]
        } else if (timeframe === 'YTD') {
            startDate = `${targetDateObj.getFullYear()}-01-01`
        } else if (timeframe.match(/^(\d+)Y$/)) {
            // Dynamic Years (e.g. 3Y, 5Y)
            const years = parseInt(timeframe.match(/^(\d+)Y$/)![1], 10)
            targetDateObj.setFullYear(targetDateObj.getFullYear() - years)
            startDate = targetDateObj.toISOString().split('T')[0]
        } else if (timeframe.match(/^(\d+)M$/)) {
            // Dynamic Months (e.g. 6M)
            const months = parseInt(timeframe.match(/^(\d+)M$/)![1], 10)
            targetDateObj.setMonth(targetDateObj.getMonth() - months)
            startDate = targetDateObj.toISOString().split('T')[0]
        } else {
            // Fallback or custom
            startDate = timeframe // Assume timeframe IS the start date if not keyword
        }

        const pool = getPool()
        // Note: We use pool directly, similar to getDbClient().connect() but simpler for one-off
        // route.ts used client.query within a transaction-like block (though it was just parallel queries)

        // 1. Fetch Heatmap Data (Stocks) using CTEs
        // Modified to handle specific symbol/sector filtering
        let filterClause = "WHERE asset_type = 'pk-equity' AND market_cap > 0"
        const queryParams = [limit, date, startDate]
        let paramIndex = 4

        // If specific symbols are requested, prioritize them or filter by them
        // For simplicity and efficiency, if specific filter is set, we might append to the WHERE clause
        // But we must be careful about the LIMIT. If we filter by sector, LIMIT is fine.
        // If we filter by symbol, we might not need LIMIT.

        const heatmapQuery = `
            WITH top_stocks AS (
                SELECT symbol, name, market_cap, sector, industry
                FROM company_profiles
                ${filterClause}
                ORDER BY market_cap DESC
                -- We apply limit generally, but if filtering via JS later, we might get more. 
                -- Ideally for "specific stock" requests we should probably fetch them explicitly if not in top N.
                -- For now, let's bump the limit if specific filters are used in the service wrapper, but here we keep it standard.
                LIMIT $1
            ),
            -- If specific symbols are needed that might be outside top N, we could union them here.
            -- But effectively, the "Heatmap" is usually for the "Market". 
            -- "Specific Stock" data is better handled by getCompanyProfile usually.
            -- However, the user wants "daily movement context". 
            
            target_prices AS (
                SELECT symbol, close as price
                FROM historical_price_data
                WHERE asset_type = 'pk-equity' AND date = $2
            ),
            start_prices AS (
                SELECT DISTINCT ON (symbol) symbol, close as price
                FROM historical_price_data
                WHERE asset_type = 'pk-equity' AND date <= $3
                ORDER BY symbol, date DESC
            )
            SELECT 
                ts.symbol,
                COALESCE(ts.name, ts.symbol) as name,
                ts.market_cap,
                ts.sector,
                ts.industry,
                tp.price as current_price,
                sp.price as start_price
            FROM top_stocks ts
            LEFT JOIN target_prices tp ON ts.symbol = tp.symbol
            LEFT JOIN start_prices sp ON ts.symbol = sp.symbol
            WHERE tp.price IS NOT NULL -- Must have current data
            ORDER BY ts.market_cap DESC
        `

        // 2. Fetch Indices (KSE-100, KSE-30, etc.)
        const indexQuery = `
            WITH current_idx AS (
                SELECT close as price, date FROM historical_price_data 
                WHERE symbol = 'KSE100' AND date = $1
            ),
            prev_idx AS (
                SELECT JSON_AGG(close ORDER BY date ASC) as history 
                FROM (
                    SELECT close, date FROM historical_price_data 
                    WHERE symbol = 'KSE100' AND date <= $1 
                    ORDER BY date DESC LIMIT 7
                ) sub
            )
            SELECT 
                c.price, 
                p.price as prev_close,
                (SELECT history FROM prev_idx) as history
            FROM current_idx c, (SELECT close as price FROM historical_price_data WHERE symbol = 'KSE100' AND date <= $2 ORDER BY date DESC LIMIT 1) p
        `

        const sectorQuery = `
            WITH top_stocks AS (
                SELECT symbol, market_cap, sector
                FROM company_profiles
                ${filterClause}
            ),
            target_prices AS (
                SELECT symbol, close as price
                FROM historical_price_data
                WHERE asset_type = 'pk-equity' AND date = $1
            ),
            start_prices AS (
                SELECT DISTINCT ON (symbol) symbol, close as price
                FROM historical_price_data
                WHERE asset_type = 'pk-equity' AND date <= $2
                ORDER BY symbol, date DESC
            ),
            base_data AS (
                SELECT
                    ts.sector,
                    ts.market_cap as current_mc,
                    -- Estimate Previous MC: (Current MC / Current Price) * Start Price
                    (ts.market_cap / NULLIF(tp.price, 0)) * sp.price as prev_mc
                FROM top_stocks ts
                JOIN target_prices tp ON ts.symbol = tp.symbol
                JOIN start_prices sp ON ts.symbol = sp.symbol
                WHERE tp.price > 0
            )
            SELECT 
                sector as name,
                SUM(current_mc) as current_mc_sum,
                SUM(prev_mc) as prev_mc_sum
            FROM base_data
            GROUP BY sector
            ORDER BY 
                CASE WHEN SUM(prev_mc) > 0 
                     THEN ((SUM(current_mc) - SUM(prev_mc)) / SUM(prev_mc)) * 100 
                     ELSE 0 
                END DESC
        `

        const [heatmapRes, indexRes, sectorRes] = await Promise.all([
            pool.query(heatmapQuery, [limit, date, startDate]),
            pool.query(indexQuery, [date, startDate]),
            pool.query(sectorQuery, [date, startDate])
        ])

        // Process Stocks
        const stocks: MarketHeatmapStock[] = heatmapRes.rows.map((row: any) => {
            const price = parseFloat(row.current_price)
            const previousPrice = row.start_price ? parseFloat(row.start_price) : null
            const changePercent = previousPrice && previousPrice > 0
                ? ((price - previousPrice) / previousPrice) * 100
                : 0 // If 0 or null, change is 0

            return {
                symbol: row.symbol,
                name: row.name,
                marketCap: parseFloat(row.market_cap),
                price,
                previousPrice,
                changePercent,
                sector: row.sector || 'Others',
                industry: row.industry
            }
        })

        // Process Sectors (From dedicated query)
        const sectors: MarketSectorPerformance[] = sectorRes.rows.map((row: any) => {
            const currentSum = parseFloat(row.current_mc_sum)
            const prevSum = parseFloat(row.prev_mc_sum)
            const change = prevSum > 0 ? ((currentSum - prevSum) / prevSum) * 100 : 0

            return {
                name: row.name || 'Others',
                change,
                volume: 'N/A'
            }
        })

        // Process Indices
        const indices: MarketIndexData[] = indexRes.rows.length > 0 ? [{
            name: 'KSE-100', // Changed symbol to name
            price: parseFloat(indexRes.rows[0].price), // Return number
            change: parseFloat(indexRes.rows[0].price) - parseFloat(indexRes.rows[0].prev_close),
            changePercent: ((parseFloat(indexRes.rows[0].price) - parseFloat(indexRes.rows[0].prev_close)) / parseFloat(indexRes.rows[0].prev_close) * 100),
            history: indexRes.rows[0].history || []
        }] : []

        return {
            stocks,
            sectors,
            indices,
            date,
            timeframe
        }
    }

    /**
     * Helper to get the latest available market date
     */
    static async getLatestMarketDate(): Promise<string> {
        const pool = getPool()
        const res = await pool.query(`
      SELECT date 
      FROM historical_price_data 
      WHERE symbol = 'KSE100' 
      AND EXTRACT(ISODOW FROM date) < 6
      ORDER BY date DESC 
      LIMIT 1
    `)
        if (res.rows.length > 0) {
            const d = new Date(res.rows[0].date)
            // Use local time to avoid UTC rollback (e.g., midnight PKT -> prev day UTC)
            const year = d.getFullYear()
            const month = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            return `${year}-${month}-${day}`
        }
        return new Date().toISOString().split('T')[0] // Fallback to today
    }
}
