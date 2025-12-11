import { getPostgresClient } from './db-client'
import { Trade } from './types'
import { getCurrentPrice } from './transaction-utils'
import { parseSymbolToBinance } from './binance-api'
import { getSBPEconomicData } from './db-client'

export interface PortfolioHistoryOptions {
    currency: string
    unified: boolean
    days: number | 'ALL'
}

export interface PortfolioHistoryResult {
    history: any[]
    isCached: boolean
    lastUpdated?: Date
}

/**
 * Get portfolio history with database caching
 */
export async function getPortfolioHistory(
    userId: number,
    options: PortfolioHistoryOptions,
    forceRefresh = false
): Promise<PortfolioHistoryResult> {
    const client = await getPostgresClient()

    try {
        // 1. Check if we have a valid cache
        const { currency, unified, days } = options

        // We always cache "ALL" history for the given currency/view
        // Then we slice it for the requested 'days'

        // Fetch latest trade time to validate cache
        // Note: user_trades table uses created_at. Edits might not update a timestamp, 
        // so this primarily invalidates on NEW trades. 
        // Ideally user_trades should have updated_at.
        const tradeTimeResult = await client.query(
            `SELECT MAX(created_at) as last_trade_create 
       FROM user_trades WHERE user_id = $1`,
            [userId]
        )

        let latestTradeTime: Date | null = null
        if (tradeTimeResult.rows.length > 0) {
            const { last_trade_create } = tradeTimeResult.rows[0]
            if (last_trade_create) {
                latestTradeTime = new Date(last_trade_create)
            }
        }


        // Try to get from cache
        let cachedRecord = null
        if (!forceRefresh) {
            const cacheResult = await client.query(
                `SELECT data, last_updated_at 
         FROM portfolio_history_cache 
         WHERE user_id = $1 AND currency = $2 AND is_unified = $3`,
                [userId, currency, unified]
            )

            if (cacheResult.rows.length > 0) {
                cachedRecord = cacheResult.rows[0]
            }
        }

        // Check staleness
        const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours
        const now = Date.now()
        let isStale = forceRefresh

        if (!cachedRecord) {
            isStale = true
        } else {
            const cacheTime = new Date(cachedRecord.last_updated_at).getTime()

            // 1. Time-based expiry (Market prices change)
            if (now - cacheTime > CACHE_TTL) {
                isStale = true
            }

            // 2. Trade-based expiry
            if (latestTradeTime && latestTradeTime.getTime() > cacheTime) {
                isStale = true
            }
        }

        // If fresh, return cached data
        if (!isStale && cachedRecord) {
            const fullHistory = cachedRecord.data
            const slicedHistory = sliceHistoryByDays(fullHistory, days)
            return {
                history: slicedHistory,
                isCached: true,
                lastUpdated: cachedRecord.last_updated_at
            }
        }

        // --- RECALCULATION LOGIC (Extracted from route.ts) ---
        // If stale or missing, recalculate everything

        // Get historical exchange rates if unified
        const exchangeRateMap = new Map<string, number>()
        let latestExchangeRate: number | null = null

        if (unified) {
            try {
                const exchangeResult = await getSBPEconomicData('TS_GP_ER_FAERPKR_M.E00220')
                if (exchangeResult && exchangeResult.data && exchangeResult.data.length > 0) {
                    const sorted = [...exchangeResult.data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    for (const item of sorted) {
                        const date = new Date(item.date)
                        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
                        exchangeRateMap.set(monthKey, item.value)
                    }
                    latestExchangeRate = sorted[sorted.length - 1].value
                }
            } catch (error) {
                console.error('Error fetching exchange rates', error)
            }
        }

        const getExchangeRateForDate = (dateStr: string): number | null => {
            if (exchangeRateMap.size === 0) return latestExchangeRate
            const date = new Date(dateStr)
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
            if (exchangeRateMap.has(monthKey)) return exchangeRateMap.get(monthKey)!

            // Look back logic... (simplified for brevity, main logic preserved)
            const keys = Array.from(exchangeRateMap.keys()).sort().reverse()
            const found = keys.find(k => k <= monthKey)
            return found ? exchangeRateMap.get(found)! : latestExchangeRate
        }

        // Fetch Trades
        const tradesResult = await client.query(
            `SELECT id, user_id, holding_id, trade_type, asset_type, symbol, name, quantity,
              price, total_amount, currency, trade_date, notes, created_at
       FROM user_trades
       WHERE user_id = $1
       ORDER BY trade_date ASC, created_at ASC`,
            [userId]
        )

        const trades: Trade[] = tradesResult.rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            holdingId: row.holding_id,
            tradeType: row.trade_type,
            assetType: row.asset_type,
            symbol: row.symbol || '',
            name: row.name || '',
            quantity: parseFloat(row.quantity) || 0,
            price: parseFloat(row.price) || 0,
            totalAmount: parseFloat(row.total_amount) || 0,
            currency: row.currency || 'USD',
            tradeDate: row.trade_date instanceof Date ? row.trade_date.toISOString().split('T')[0] : row.trade_date,
            notes: row.notes,
            createdAt: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
        })).filter(t => t.tradeDate)

        if (trades.length === 0) {
            return { history: [], isCached: false }
        }

        // Unique assets
        const uniqueAssets = new Map<string, { assetType: string; symbol: string; currency: string }>()
        trades.forEach(t => {
            if (t.assetType !== 'cash') {
                const key = `${t.assetType}:${t.symbol.toUpperCase()}:${t.currency}`
                if (!uniqueAssets.has(key)) {
                    uniqueAssets.set(key, { assetType: t.assetType, symbol: t.symbol.toUpperCase(), currency: t.currency || 'USD' })
                }
            }
        })

        // Fetch Prices (Reusing DB functions directly for better performance than API calls if possible, 
        // but preserving API logic for consistency. Actually simpler to query DB directly here since we have client.)

        // NOTE: ORIGINAL CODE CALLED API. To avoid self-referencing API calls inside a service (which is bad), 
        // we should query the DB tables directly. The 'historical_price_data' table is available.

        const historicalPriceMap = new Map<string, Map<string, number>>()
        const todayStr = new Date().toISOString().split('T')[0]

        // Bulk fetch all relevant price history
        const assetTypesToCheck = Array.from(new Set(Array.from(uniqueAssets.values()).map(a => a.assetType)))
            .filter(t => t !== 'commodities')

        // Optimized: Fetch all history for these assets in one go per type? Or strict per symbol.
        // Let's iterate symbols to be safe.

        for (const [key, asset] of uniqueAssets.entries()) {
            if (asset.assetType === 'commodities') continue

            const priceMap = new Map<string, number>()
            let symbolToFetch = asset.symbol
            if (asset.assetType === 'crypto') {
                symbolToFetch = parseSymbolToBinance(asset.symbol)
            }

            const priceParams = [asset.assetType, symbolToFetch]
            const priceQuery = `
        SELECT date, close, adjusted_close 
        FROM historical_price_data 
        WHERE asset_type = $1 AND symbol = $2
        ORDER BY date ASC
      `
            const priceRes = await client.query(priceQuery, priceParams)

            priceRes.rows.forEach(row => {
                const dateStr = row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date
                const price = parseFloat(row.adjusted_close || row.close)
                if (price > 0) priceMap.set(dateStr, price)
            })

            // Fallback for today if missing
            if (!priceMap.has(todayStr)) {
                try {
                    // If we have no price for today, try to get live price? 
                    // Or just use latest DB price. Re-implementing live fetch here might be too heavy.
                    // Let's use latest DB price as fallback.
                    let latestDate = ''
                    let latestPrice = 0
                    for (const [d, p] of priceMap.entries()) {
                        if (d > latestDate) { latestDate = d; latestPrice = p }
                    }
                    if (latestPrice > 0) priceMap.set(todayStr, latestPrice)
                } catch (e) { }
            }

            if (priceMap.size > 0) {
                historicalPriceMap.set(key, priceMap)
            }
        }

        // Helper to get price
        const getPriceForDate = (assetKey: string, dateStr: string, fallbackPrice: number): number => {
            const pMap = historicalPriceMap.get(assetKey)
            if (!pMap) return fallbackPrice
            if (pMap.has(dateStr)) return pMap.get(dateStr)!

            // Closest earlier date
            // Optimized: Since iterating keys is slow, maybe cache the sorted keys? 
            // For now keeping simple linear scan on sorted keys (or reverse sort)
            const dates = Array.from(pMap.keys()).sort().reverse()
            const found = dates.find(d => d <= dateStr)
            return found ? pMap.get(found)! : fallbackPrice
        }

        const hasValidPriceForDate = (assetKey: string, dateStr: string): boolean => {
            const pMap = historicalPriceMap.get(assetKey)
            return !!pMap && (pMap.has(dateStr) || Array.from(pMap.keys()).some(d => d <= dateStr))
        }

        // Prepare Daily Loop
        const dailyHoldings: Record<string, any> = {}
        const cashFlowsByDate = new Map<string, number>()

        for (const trade of trades) {
            if (trade.tradeType === 'add' || trade.tradeType === 'remove') {
                if (!unified && trade.currency.toUpperCase() !== currency.toUpperCase()) continue

                const dStr = trade.tradeDate
                const curr = cashFlowsByDate.get(dStr) || 0
                let amt = trade.tradeType === 'add' ? trade.totalAmount : -trade.totalAmount

                if (unified && trade.currency === 'PKR') {
                    const rate = getExchangeRateForDate(dStr)
                    if (rate) amt = amt / rate
                }
                cashFlowsByDate.set(dStr, curr + amt)
            }
        }

        // Filter trades for processing loop
        const relevantTrades = unified
            ? trades
            : trades.filter(t => t.currency.toUpperCase() === currency.toUpperCase())

        if (relevantTrades.length === 0) {
            return { history: [], isCached: false }
        }

        // Calculate Full History (from first trade ever)
        // We calc ALL history then cache it.
        const sortedTrades = [...relevantTrades].sort((a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime())
        const firstTradeDate = new Date(sortedTrades[0].tradeDate)
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        let currentDate = new Date(firstTradeDate)
        currentDate.setHours(0, 0, 0, 0)

        // State
        const currentQty = new Map<string, number>()
        const currentInvested = new Map<string, number>()
        const currentAvgPrice = new Map<string, number>()
        const currentCash = new Map<string, number>()

        let tradeIndex = 0
        let iterationCount = 0
        const maxIterations = 25000

        while (currentDate <= today && iterationCount < maxIterations) {
            iterationCount++
            const dateStr = currentDate.toISOString().split('T')[0]


            // Daily Liquid Flow Tracker
            let dailyLiquidFlowAdjustment = 0; // Net flow adjustment for liquid portfolio (Comm Buy = -, Comm Sell = +)

            // Apply trades
            while (tradeIndex < sortedTrades.length) {
                const t = sortedTrades[tradeIndex]
                if (t.tradeDate > dateStr) break
                if (t.tradeDate === dateStr) {
                    // Apply trade logic
                    const ccy = t.currency || 'USD'

                    // Track Liquid Flows caused by Commodity Trades
                    if (t.assetType === 'commodities') {
                        let flowAmt = t.totalAmount;
                        if (unified && t.currency === 'PKR') {
                            const r = getExchangeRateForDate(dateStr)
                            if (r) flowAmt = flowAmt / r
                        } else if (!unified && t.currency.toUpperCase() !== currency.toUpperCase()) {
                            flowAmt = 0 // Should not happen given filtered trades but safe check
                        }

                        if (t.tradeType === 'buy') {
                            dailyLiquidFlowAdjustment -= flowAmt; // Withdrawal from Liquid
                        } else if (t.tradeType === 'sell') {
                            dailyLiquidFlowAdjustment += flowAmt; // Deposit to Liquid
                        }
                    }

                    if (t.assetType === 'cash') {
                        const bal = currentCash.get(ccy) || 0
                        currentCash.set(ccy, bal + (t.tradeType === 'add' ? t.totalAmount : -t.totalAmount))
                    } else {
                        const k = `${t.assetType}:${t.symbol.toUpperCase()}:${ccy}`
                        const q = currentQty.get(k) || 0
                        const i = currentInvested.get(k) || 0
                        const cashBal = currentCash.get(ccy) || 0 // Cash balance in TRADE currency

                        if (t.tradeType === 'buy') {
                            currentQty.set(k, q + t.quantity)
                            currentInvested.set(k, i + t.totalAmount)
                            if (q + t.quantity > 0) currentAvgPrice.set(k, (i + t.totalAmount) / (q + t.quantity))
                            currentCash.set(ccy, cashBal - t.totalAmount)
                        } else if (t.tradeType === 'sell') {
                            const newQ = Math.max(0, q - t.quantity)
                            currentQty.set(k, newQ)
                            let costRemoved = 0
                            if (q > 0) costRemoved = i * (t.quantity / q)
                            currentInvested.set(k, Math.max(0, i - costRemoved))
                            currentCash.set(ccy, cashBal + t.totalAmount) // Proceeds added to cash
                        }
                    }
                }
                tradeIndex++
            }

            // Calculate Daily Value
            let dailyMarketVal = 0
            let dailyLiquidVal = 0 // Value of Non-Commodity Assets

            for (const [k, qty] of currentQty.entries()) {
                if (qty <= 0.000001) continue
                const [type, sym, ccyOfAsset] = k.split(':')
                const iAmt = currentInvested.get(k) || 0
                let val = 0
                let isLiquid = type !== 'commodities'

                if (type === 'commodities') {
                    val = qty * (currentAvgPrice.get(k) || 0)
                } else {
                    if (hasValidPriceForDate(k, dateStr)) {
                        const p = getPriceForDate(k, dateStr, 0)
                        val = p > 0 ? qty * p : iAmt
                    } else {
                        val = iAmt
                    }
                }

                // Convert to unified/target currency
                if (unified && ccyOfAsset === 'PKR') {
                    const r = getExchangeRateForDate(dateStr)
                    if (r) val = val / r
                } else if (!unified && ccyOfAsset.toUpperCase() !== currency.toUpperCase()) {
                    continue
                }

                dailyMarketVal += val
                if (isLiquid) {
                    dailyLiquidVal += val
                }
            }

            let dailyCashVal = 0
            if (unified) {
                for (const [c, amt] of currentCash.entries()) {
                    let uAmt = amt
                    if (c === 'PKR') {
                        const r = getExchangeRateForDate(dateStr)
                        if (r) uAmt = amt / r
                    }
                    dailyCashVal += uAmt
                }
            } else {
                dailyCashVal = currentCash.get(currency) || 0
            }

            // Cash is always Liquid
            const totalLiquidValue = dailyLiquidVal + dailyCashVal;
            const totalLiquidFlow = (cashFlowsByDate.get(dateStr) || 0) + dailyLiquidFlowAdjustment;

            dailyHoldings[dateStr] = {
                date: dateStr,
                cash: dailyCashVal,
                invested: dailyMarketVal + dailyCashVal, // This is Total Value
                cashFlow: cashFlowsByDate.get(dateStr) || 0, // Total External Flow
                marketValue: dailyMarketVal + dailyCashVal,
                value: dailyMarketVal + dailyCashVal,
                // Liquid Only Fields
                liquidValue: totalLiquidValue,
                liquidCashFlow: totalLiquidFlow
            }

            currentDate.setDate(currentDate.getDate() + 1)

        }

        // Sort
        const fullHistory = Object.values(dailyHoldings).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())

        // CACHE IT
        // Upsert cache
        await client.query(
            `INSERT INTO portfolio_history_cache (user_id, currency, is_unified, data, last_updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, currency, is_unified)
       DO UPDATE SET data = EXCLUDED.data, last_updated_at = NOW()`,
            [userId, currency, unified, JSON.stringify(fullHistory)]
        )

        return {
            history: sliceHistoryByDays(fullHistory, days),
            isCached: false, // It was fresh
            lastUpdated: new Date()
        }

    } finally {
        client.release()
    }
}

function sliceHistoryByDays(history: any[], days: number | 'ALL'): any[] {
    if (days === 'ALL') return history

    const now = new Date()
    const startDate = new Date()
    startDate.setDate(now.getDate() - days)
    const startStr = startDate.toISOString().split('T')[0]

    return history.filter(h => h.date >= startStr)
}
