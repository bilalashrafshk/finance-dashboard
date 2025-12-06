import { NextRequest, NextResponse } from 'next/server'
import { ensureLipiData } from '@/lib/portfolio/scstrade-lipi-service'
import { getLipiData } from '@/lib/portfolio/lipi-db-client'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const startDate = searchParams.get('startDate') // YYYY-MM-DD
    const endDate = searchParams.get('endDate')     // YYYY-MM-DD

    if (!startDate || !endDate) {
        return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })
    }

    try {
        // For range queries, we might need to iterate or just check start/end?
        // Simplicity: Check ensure for BOTH start and end date if they are close, or just get from DB
        // If the range is small (e.g. 1 day), ensure it.

        if (startDate === endDate) {
            await ensureLipiData(startDate)
        } else {
            // For ranges, maybe just get what we have? Or ensure just the end date (latest)?
            // Let's ensure the end date is fresh at least.
            await ensureLipiData(endDate)
        }

        const data = await getLipiData(startDate, endDate)
        return NextResponse.json(data)
    } catch (error: any) {
        console.error('[API] Error fetching Lipi data:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
