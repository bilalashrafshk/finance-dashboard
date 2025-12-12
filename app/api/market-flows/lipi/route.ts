
import { NextRequest, NextResponse } from 'next/server'
import { fetchLipiData } from '@/lib/portfolio/market-liquidity-service'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate') // YYYY-MM-DD
    const endDate = searchParams.get('endDate')     // YYYY-MM-DD

    if (!startDate || !endDate) {
        return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })
    }

    try {
        // Fetch data (handles caching for single day, or direct fetch for range)
        const data = await fetchLipiData(startDate, endDate)
        return NextResponse.json(data)
    } catch (error: any) {
        console.error('[API] Error fetching Lipi data:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
