
import type { Trade } from './types'
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
    // Track cash balances by currency
    const cashBalances = new Map<string, number>()
    const buyLotsMap = new Map<string, BuyLot[]>()

    // Sort trades by date to process chronologically
    const sortedTrades = [...trades].sort((a, b) => {
        const dateDiff = new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime()
        if (dateDiff !== 0) return dateDiff
        return a.id - b.id
    })

    for (const trade of sortedTrades) {
        const key = `${trade.assetType}:${trade.symbol.toUpperCase()}:${trade.currency}`
        const cashKey = `cash:CASH:${trade.currency}`

        // Initialize structures if needed
        if (!buyLotsMap.has(key)) {
            buyLotsMap.set(key, [])
        }
        const buyLots = buyLotsMap.get(key)!

        if (!realizedPnLMap.has(key)) {
            realizedPnLMap.set(key, 0)
        }

        // Initialize cash balance if needed
        if (!cashBalances.has(cashKey)) {
            cashBalances.set(cashKey, 0)
        }

        if (trade.assetType === 'cash') {
            // Direct Cash Transactions (Deposit/Withdrawal)
            const currentCash = cashBalances.get(cashKey)!
            if (trade.tradeType === 'add' || trade.tradeType === 'buy') {
                cashBalances.set(cashKey, currentCash + trade.quantity)
            } else if (trade.tradeType === 'remove' || trade.tradeType === 'sell') {
                cashBalances.set(cashKey, currentCash - trade.quantity)
            }
        } else {
            // Asset Transactions - Impact on Cash
            const currentCash = cashBalances.get(cashKey)!

            if (trade.tradeType === 'buy') {
                // Buy Asset -> Deduct Cash
                cashBalances.set(cashKey, currentCash - trade.totalAmount)

                // Add new lot
                buyLots.push({
                    date: trade.tradeDate,
                    quantity: trade.quantity,
                    price: trade.price,
                    remaining: trade.quantity
                })

            } else if (trade.tradeType === 'add') {
                // Add Asset (e.g. Gift/Transfer) -> No Cash Impact (usually)
                // If totalAmount > 0, we could deduct cash, but 'add' usually implies external inflow without cash spend from portfolio
                // For now, assuming 'add' does NOT cost cash unless specified. 
                // However, looking at user's "ADD Cash", 'add' is used for deposits.
                // For assets, 'add' might be stock dividend or transfer.
                // Let's assume NO cash impact for 'add' of non-cash assets for now.

                buyLots.push({
                    date: trade.tradeDate,
                    quantity: trade.quantity,
                    price: trade.price,
                    remaining: trade.quantity
                })

            } else if (trade.tradeType === 'sell') {
                // Sell Asset -> Add Cash
                cashBalances.set(cashKey, currentCash + trade.totalAmount)

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
                    if (lot.remaining <= 0.000001) {
                        buyLots.shift()
                    }
                }

                // Update Total Realized P&L for this asset
                const currentPnL = realizedPnLMap.get(key) || 0
                realizedPnLMap.set(key, currentPnL + tradePnL)

            } else if (trade.tradeType === 'remove') {
                // Remove Asset -> No Cash Impact (usually)
                // Just reduce holdings
                let qtyToRemove = trade.quantity

                while (qtyToRemove > 0 && buyLots.length > 0) {
                    const lot = buyLots[0]
                    const qtyFromLot = Math.min(qtyToRemove, lot.remaining)

                    lot.remaining -= qtyFromLot
                    qtyToRemove -= qtyFromLot

                    if (lot.remaining <= 0.000001) {
                        buyLots.shift()
                    }
                }
            }
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
                assetType: assetType as any,
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

    // Add Cash Holdings
    cashBalances.forEach((balance, key) => {
        if (Math.abs(balance) > 0.01) { // Filter out near-zero balances
            const [assetType, symbol, currency] = key.split(':')
            const holding: Holding = {
                id: key,
                assetType: 'cash',
                symbol: 'CASH',
                name: 'Cash',
                currency,
                quantity: balance,
                purchasePrice: 1,
                purchaseDate: new Date().toISOString(),
                currentPrice: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                notes: 'Calculated from transactions'
            }
            holdingsMap.set(key, holding)
        }
    })

    return {
        holdings: holdingsMap,
        realizedPnL: realizedPnLMap
    }
}
