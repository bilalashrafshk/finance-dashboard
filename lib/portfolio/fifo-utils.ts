
import type { Trade } from './transaction-utils'
import type { Holding } from './types'

interface BuyLot {
    date: string
    quantity: number
    price: number
    remaining: number
}

interface FifoResult {
    holdings: Map<string, Holding>
    realizedPnL: Map<string, number>
}

/**
 * Calculate holdings and realized P&L using Strict FIFO (First-In, First-Out) logic.
 * 
 * Logic:
 * 1. Sort all trades by Date (and ID for stability).
 * 2. Maintain a queue of "Buy Lots" for each asset.
 * 3. On Sell: Consume from the oldest Buy Lot (FIFO).
 *    - Calculate Realized P&L = (Sell Price - Buy Price) * Quantity
 * 4. Remaining Buy Lots determine the current Holdings and Cost Basis.
 */
export function calculateFifoMetrics(
    trades: Trade[],
    currentPrices: Map<string, number> = new Map()
): FifoResult {
    const holdingsMap = new Map<string, Holding>()
    const realizedPnLMap = new Map<string, number>()
    const buyLotsMap = new Map<string, BuyLot[]>()

    // Sort trades by date to process chronologically
    const sortedTrades = [...trades].sort((a, b) => {
        const dateDiff = new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime()
        if (dateDiff !== 0) return dateDiff
        return a.id - b.id
    })

    for (const trade of sortedTrades) {
        const key = `${trade.assetType}:${trade.symbol.toUpperCase()}:${trade.currency}`

        // Initialize structures if needed
        if (!buyLotsMap.has(key)) {
            buyLotsMap.set(key, [])
        }
        const buyLots = buyLotsMap.get(key)!

        if (!realizedPnLMap.has(key)) {
            realizedPnLMap.set(key, 0)
        }

        if (trade.tradeType === 'buy' || trade.tradeType === 'add') {
            // Add new lot
            buyLots.push({
                date: trade.tradeDate,
                quantity: trade.quantity,
                price: trade.price,
                remaining: trade.quantity
            })

            // Handle Cash deduction for non-cash buys (optional, for cash tracking)
            if (trade.assetType !== 'cash') {
                const cashKey = `cash:CASH:${trade.currency}`
                // We don't strictly track cash lots for P&L, just balance
                // Implementation omitted for brevity as focus is on Asset P&L
            }

        } else if (trade.tradeType === 'sell' || trade.tradeType === 'remove') {
            let qtyToSell = trade.quantity
            let tradePnL = 0

            // Consume lots FIFO
            while (qtyToSell > 0 && buyLots.length > 0) {
                const lot = buyLots[0] // Oldest lot

                const qtyFromLot = Math.min(qtyToSell, lot.remaining)

                // Calculate P&L for this chunk
                const chunkPnL = (trade.price - lot.price) * qtyFromLot
                tradePnL += chunkPnL

                // Update lot and sell qty
                lot.remaining -= qtyFromLot
                qtyToSell -= qtyFromLot

                // Remove empty lot
                if (lot.remaining <= 0.000001) { // Epsilon for float precision
                    buyLots.shift()
                }
            }

            // Update Total Realized P&L for this asset
            const currentPnL = realizedPnLMap.get(key) || 0
            realizedPnLMap.set(key, currentPnL + tradePnL)
        }
    }

    // Convert remaining Buy Lots to Holdings
    buyLotsMap.forEach((lots, key) => {
        const [assetType, symbol, currency] = key.split(':')

        const totalQuantity = lots.reduce((sum, lot) => sum + lot.remaining, 0)

        if (totalQuantity > 0.000001) {
            // Calculate weighted average cost basis of remaining lots
            const totalCost = lots.reduce((sum, lot) => sum + (lot.remaining * lot.price), 0)
            const averagePurchasePrice = totalCost / totalQuantity

            // Use earliest lot date as purchase date
            const firstPurchaseDate = lots.length > 0 ? lots[0].date : new Date().toISOString()
            const lastPurchaseDate = lots.length > 0 ? lots[lots.length - 1].date : new Date().toISOString()

            const currentPrice = currentPrices.get(key) || averagePurchasePrice

            const holding: Holding = {
                id: key,
                assetType,
                symbol,
                name: symbol, // Name might need to be fetched/stored elsewhere
                currency,
                quantity: totalQuantity,
                purchasePrice: averagePurchasePrice, // FIFO Cost Basis
                purchaseDate: firstPurchaseDate,
                currentPrice: currentPrice,
                createdAt: firstPurchaseDate,
                updatedAt: lastPurchaseDate,
                notes: `FIFO Calculated. ${lots.length} lots.`
            }

            holdingsMap.set(key, holding)
        }
    })

    return {
        holdings: holdingsMap,
        realizedPnL: realizedPnLMap
    }
}
