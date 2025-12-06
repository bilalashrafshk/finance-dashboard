import { unstable_cache } from 'next/cache'
import { TrackedAsset } from '@/components/asset-screener/add-asset-dialog'
import { getPostgresClient } from '@/lib/portfolio/db-client'

export async function getAssetMetrics(asset: TrackedAsset, baseUrl?: string) {
    const client = await getPostgresClient()

    try {
        // Map frontend asset type to DB asset type
        let dbAssetType = 'us-equity'
        if (asset.assetType === 'pk-equity') dbAssetType = 'pk-equity'
        else if (asset.assetType === 'crypto') dbAssetType = 'crypto'
        else if (asset.assetType === 'metals') dbAssetType = 'metals'
        else if (asset.assetType === 'kse100' || asset.assetType === 'spx500') dbAssetType = 'indices'

        // Query the pre-calculated metrics from the database
        const query = `
            SELECT 
                price, 
                ytd_return, 
                beta_3y, 
                sharpe_3y, 
                sortino_3y, 
                max_drawdown_3y,
                rsi_14,
                pe_ratio,
                pb_ratio,
                ps_ratio,
                peg_ratio,
                dividend_yield,
                dividend_payout_ratio,
                roe,
                net_margin,
                debt_to_equity,
                current_ratio,
                revenue_growth,
                net_income_growth
            FROM screener_metrics 
            WHERE symbol = $1 AND asset_type = $2
        `

        const result = await client.query(query, [asset.symbol, dbAssetType])

        if (result.rows.length > 0) {
            const row = result.rows[0]
            return {
                price: row.price,
                ytdReturn: row.ytd_return,
                beta: row.beta_3y,
                sharpeRatio: row.sharpe_3y,
                sortinoRatio: row.sortino_3y,
                maxDrawdown: row.max_drawdown_3y,
                rsi: row.rsi_14,

                // Valuation
                peRatio: row.pe_ratio,
                pbRatio: row.pb_ratio,
                psRatio: row.ps_ratio,
                pegRatio: row.peg_ratio,

                // Dividends
                dividendYield: row.dividend_yield,
                payoutRatio: row.dividend_payout_ratio,

                // Profitability
                roe: row.roe,
                netMargin: row.net_margin,

                // Health
                debtToEquity: row.debt_to_equity,
                currentRatio: row.current_ratio,

                // Growth
                revenueGrowth: row.revenue_growth,
                netIncomeGrowth: row.net_income_growth,

                loading: false
            }
        }

        // Fallback: If not in DB, return nulls (or we could trigger a calc, but for now keep it simple)
        // The cron job should populate this.
        console.log(`[Server Metrics] No pre-calculated metrics found for ${asset.symbol}`)
        return {
            price: null,
            ytdReturn: null,
            beta: null,
            sharpeRatio: null,
            maxDrawdown: null,
            loading: false
        }

    } catch (error) {
        console.error(`Error fetching metrics for ${asset.symbol}:`, error)
        return {
            price: null,
            ytdReturn: null,
            beta: null,
            sharpeRatio: null,
            maxDrawdown: null,
            loading: false
        }
    } finally {
        client.release()
    }
}

// Cached version
// We use the asset ID and updated timestamp as part of the cache key if available, 
// or just revalidate every 60 seconds
export const getCachedAssetMetrics = unstable_cache(
    async (asset: TrackedAsset, baseUrl?: string) => getAssetMetrics(asset, baseUrl),
    ['asset-metrics-db-v1'], // Bump version to invalidate old cache
    { revalidate: 60, tags: ['asset-metrics'] }
)

