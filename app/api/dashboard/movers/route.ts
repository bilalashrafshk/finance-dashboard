import { NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
})

export const revalidate = 300 // 5 minutes cache

export async function GET() {
    const client = await pool.connect()
    try {
        // Optimized query to get top movers based on latest 2 available days
        // 1. Find the last 2 distinct trading dates effectively
        // 2. Get prices for all stocks on these dates
        // 3. Calculate change

        // Note: We perform a simplified approach: fetch last 3000 price records (approx 500 stocks * 5 days)
        // and process in memory for flexibility.

        const { rows } = await client.query(`
      SELECT symbol, date, close, asset_type 
      FROM historical_price_data 
      WHERE asset_type = 'pk-equity' 
      AND date >= (CURRENT_DATE - INTERVAL '7 days')
      ORDER BY date DESC
    `)

        if (rows.length === 0) {
            return NextResponse.json({ success: true, movers: [] })
        }

        // Group by symbol
        const pricesBySymbol: Record<string, { date: string, close: number }[]> = {}
        rows.forEach(row => {
            if (!pricesBySymbol[row.symbol]) pricesBySymbol[row.symbol] = []
            pricesBySymbol[row.symbol].push({
                date: new Date(row.date).toISOString().split('T')[0],
                close: parseFloat(row.close)
            })
        })

        const movers = []

        for (const [symbol, prices] of Object.entries(pricesBySymbol)) {
            // prices are already sorted DESC by date from query
            if (prices.length >= 2) {
                const current = prices[0]
                const prev = prices[1] // The previous trading day

                // Basic sanity check to ensure dates are different (though query implies it)
                if (current.date === prev.date) continue;

                const change = current.close - prev.close
                const changePercent = (change / prev.close) * 100

                movers.push({
                    symbol,
                    price: current.close,
                    change: changePercent,
                    changeValue: change,
                    date: current.date,
                    volume: 'Medium' // Placeholder or need to fetch volume
                })
            }
        }

        // Sort by absolute change percent to find "Top Movers" (gainers and losers)
        // Or just Gainers? Usually "Movers" implies both.
        // Let's return Top 5 Gainers and Top 5 Losers combined or just absolute movers.
        // The UI shows "Top Movers" in one list.

        movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))

        return NextResponse.json({
            success: true,
            movers: movers.slice(0, 10).map(m => ({
                sym: m.symbol,
                price: m.price.toFixed(2),
                change: `${m.change > 0 ? '+' : ''}${m.change.toFixed(2)}%`,
                isUp: m.change >= 0,
                vol: 'High' // static for now
            }))
        })

    } catch (error: any) {
        console.error('Error fetching movers:', error)
        return NextResponse.json({ error: 'Failed to fetch movers' }, { status: 500 })
    } finally {
        client.release()
    }
}
