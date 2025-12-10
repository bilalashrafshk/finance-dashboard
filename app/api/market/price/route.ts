import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { FETCHER_REGISTRY } from '@/lib/market-data/fetcher-registry'
import { MarketDataService } from '@/lib/services/market-data'

const querySchema = z.object({
    symbol: z.string().min(1),
    type: z.enum(['crypto', 'pk-equity', 'us-equity']),
    refresh: z.string().optional().transform(val => val === 'true'),
})

export async function GET(request: NextRequest) {
    try {
        const searchParams = Object.fromEntries(request.nextUrl.searchParams)
        const validation = querySchema.safeParse(searchParams)

        if (!validation.success) {
            return NextResponse.json(
                { error: 'Invalid parameters', details: validation.error.format() },
                { status: 400 }
            )
        }

        const { symbol, type, refresh } = validation.data
        const symbolUpper = symbol.toUpperCase()
        const fetcher = FETCHER_REGISTRY[type]

        if (!fetcher) {
            // Should be caught by z.enum but extra safety
            return NextResponse.json({ error: 'Invalid asset type' }, { status: 400 })
        }

        const service = MarketDataService.getInstance()

        // We strictly adhere to existing fetcher signatures.
        // fetchBinancePrice(symbol)
        // fetchPKEquityPriceService(symbol)
        // getLatestPriceFromStockAnalysis(symbol, market: 'US') -> The Registry imports it directly. 
        // Wait, getLatestPriceFromStockAnalysis takes (ticker, market).
        // The registry just imports the function. 
        // If I map 'us-equity': getLatestPriceFromStockAnalysis, I need to ensure the arguments match.
        // ensureData calls fetcher().
        // Let's verify standard fetcher signature compatibility.

        const result = await service.ensureData(
            type,
            symbolUpper,
            async () => {
                // Adapt fetchers to return consistent shape if needed, or just pass calls
                if (type === 'us-equity') {
                    // @ts-ignore - Importing directly might need a wrapper if it requires 2 args
                    // Checking db-client.ts or stockanalysis-api.ts for signature
                    // getLatestPriceFromStockAnalysis(ticker: string, market: 'US' | 'PK' = 'US')
                    // So default is 'US', it's fine with 1 arg.
                    const { getLatestPriceFromStockAnalysis } = await import('@/lib/portfolio/stockanalysis-api')
                    const data = await getLatestPriceFromStockAnalysis(symbolUpper, 'US')
                    return data ? { price: data.price, date: data.date } : null
                }

                // For others, they might be simpler
                const data = await fetcher(symbolUpper)
                // Check return types. 
                // fetchBinancePrice -> number | null.
                // fetchPKEquityPriceService -> { price, date, ... } | null.
                // MarketDataService expects T. return { price, date } is best.

                if (typeof data === 'number') {
                    return { price: data, date: new Date().toISOString().split('T')[0] } // simplified
                }
                return data ? { price: data.price, date: data.date } : null
            },
            refresh
        )

        if (!result) {
            return NextResponse.json(
                { error: `Price not found for ${symbol}` },
                { status: 404 }
            )
        }

        return NextResponse.json({
            symbol: symbolUpper,
            price: result.price,
            date: result.date,
            type,
            source: 'market-data-service'
        })

    } catch (error) {
        console.error('[Market API] Error:', error)
        return NextResponse.json(
            { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        )
    }
}
