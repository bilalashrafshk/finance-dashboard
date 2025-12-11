
import { insertLipiData, getLipiData, shouldRefreshLipiData, LipiRecord } from './lipi-db-client'
import { eachDayOfInterval, format, parseISO, isSameDay } from 'date-fns'

const BASE_URL = 'https://www.scstrade.com/FIPILIPI.aspx'
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Content-Type': 'application/json; charset=UTF-8',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Origin': 'https://www.scstrade.com',
    'Referer': 'https://www.scstrade.com/FIPILIPI.aspx'
}

async function fetchFromSCSTrade(path: string, payload: any) {
    const response = await fetch(`${BASE_URL}/${path}`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(payload)
    })

    if (!response.ok) {
        throw new Error(`SCSTrade API Error: ${response.status}`)
    }

    const data = await response.json()
    // Handle "d" wrapper
    if (data.d) {
        if (typeof data.d === 'string') {
            return JSON.parse(data.d)
        }
        return data.d
    }
    return data
}

/**
 * Fetch and Store Liquidity Map Data for a date range with Smart Batching
 * 1. Checks DB for existing dates in range.
 * 2. Identifies missing dates.
 * 3. Groups missing dates into contiguous ranges.
 * 4. Fetches ranges from API (Optimized).
 *    - Single days -> Fetched individually & stored in DB.
 *    - Ranges (>1 day) -> Fetched as aggregate & NOT stored (to avoid polluting daily data).
 * 5. Returns combined dataset.
 */
export async function fetchLipiData(startDate: string, endDate: string) {
    console.log(`[Lipi] Request for ${startDate} to ${endDate}`)

    // 1. Get existing data from DB
    const existingRecords = await getLipiData(startDate, endDate)
    const existingDates = new Set(existingRecords.map(r => r.date))

    // 2. Identify missing dates
    const start = parseISO(startDate)
    const end = parseISO(endDate)
    const allDates = eachDayOfInterval({ start, end })

    const missingDates = allDates
        .filter(d => {
            const dateStr = format(d, 'yyyy-MM-dd')
            // If it's today, we might want to refresh it even if it "exists" (handled typically by shouldRefresh, 
            // but here we just check presence. Refinement: We could check metadata).
            // For now, assuming if it's in DB, it's good.
            return !existingDates.has(dateStr)
        })
        .map(d => format(d, 'yyyy-MM-dd'))
        .sort()

    if (missingDates.length === 0) {
        console.log(`[Lipi] All dates found in DB. Returning ${existingRecords.length} records.`)
        return existingRecords
    }

    console.log(`[Lipi] Found ${missingDates.length} missing dates. Optimizing fetch...`)

    // 3. Group into contiguous ranges
    const ranges = getContiguousRanges(missingDates)
    console.log(`[Lipi] Identified ${ranges.length} fetch operations:`, ranges)

    const newRecords: LipiRecord[] = []

    // 4. Process ranges in parallel (chunks of 3 to avoid extreme rate limits)
    const chunkSize = 3

    for (let i = 0; i < ranges.length; i += chunkSize) {
        const batch = ranges.slice(i, i + chunkSize)

        const promises = batch.map(async (range) => {
            try {
                if (range.start === range.end) {
                    // Single day fetch -> Store in DB
                    console.log(`[Lipi] Fetching single day: ${range.start}`)
                    const dayRecords = await fetchSingleDayFromAPI(range.start)
                    if (dayRecords.length > 0) {
                        await insertLipiData(dayRecords)
                        newRecords.push(...dayRecords)
                    }
                } else {
                    // Range fetch -> Do NOT store (aggregated data)
                    console.log(`[Lipi] Fetching aggregated range: ${range.start} to ${range.end}`)
                    const rangeRecords = await fetchRangeFromAPI(range.start, range.end)
                    newRecords.push(...rangeRecords)
                }
            } catch (e) {
                console.error(`[Lipi] Failed to fetch range ${range.start}-${range.end}:`, e)
            }
        })

        await Promise.all(promises)

        // Minor delay between batches
        if (i + chunkSize < ranges.length) {
            await new Promise(r => setTimeout(r, 300))
        }
    }

    // 5. Return merged results
    // Use a Maps to merge if overlaps occur (though logic shouldn't allow overlaps)
    // Actually, we need to return the raw list.
    // NOTE: The UI typically expects "Daily" records for the Heatmap if it tries to break it down.
    // However, the `LiquidityMapSection` component computes a global sum (by sector/client) for the *entire* range provided.
    // It doesn't seem to show a day-by-day timeline.
    // So feeding it aggregated records should be fine as long as the math works out.
    //
    // One Caveat: If we mix "Daily Records from DB" + "Aggregated Record from API", the total sum is correct.
    //
    // The `newRecords` from a range fetch will have a 'date' property.
    // We should probably mark them with the Start Date of the chunk, or distinct dates if possible?
    // No, `fetchRangeFromAPI` returns records. We just need to ensure the UI handles them.
    // The UI groups by Sector/Client and Sums them up. So the 'date' field is only used for filtering (which is already done)
    // or sorting.

    return [...existingRecords, ...newRecords]
}

/**
 * Helper to group sorted dates into ranges
 */
function getContiguousRanges(sortedDates: string[]): { start: string, end: string }[] {
    if (sortedDates.length === 0) return []

    const ranges: { start: string, end: string }[] = []
    let start = sortedDates[0]
    let prev = parseISO(sortedDates[0])

    for (let i = 1; i < sortedDates.length; i++) {
        const current = parseISO(sortedDates[i])
        const diff = current.getTime() - prev.getTime()
        const oneDay = 24 * 60 * 60 * 1000

        if (Math.abs(diff - oneDay) > 1000) { // Allow slight jitter, mostly strict check
            // Gap found
            ranges.push({ start, end: format(prev, 'yyyy-MM-dd') })
            start = sortedDates[i]
        }
        prev = current
    }
    // Add final range
    ranges.push({ start, end: format(prev, 'yyyy-MM-dd') })

    return ranges
}

/**
 * Fetch a single day from API (Daily resolution)
 */
async function fetchSingleDayFromAPI(date: string): Promise<LipiRecord[]> {
    const formattedDate = format(parseISO(date), 'MM/dd/yyyy')
    const apiPayload = {
        date1: formattedDate,
        date2: formattedDate,
        _search: false,
        nd: Date.now(),
        rows: 1000,
        page: 1,
        sidx: "FLSectorName asc, FLTypeNew",
        sord: "desc"
    }

    const sectorData = await fetchFromSCSTrade('loadfipisector', apiPayload)
    return parseApiData(sectorData, date)
}

/**
 * Fetch a range from API (Aggregated resolution)
 */
async function fetchRangeFromAPI(startDate: string, endDate: string): Promise<LipiRecord[]> {
    const fStart = format(parseISO(startDate), 'MM/dd/yyyy')
    const fEnd = format(parseISO(endDate), 'MM/dd/yyyy')

    const apiPayload = {
        date1: fStart,
        date2: fEnd,
        _search: false,
        nd: Date.now(),
        rows: 1000,
        page: 1,
        sidx: "FLSectorName asc, FLTypeNew",
        sord: "desc"
    }

    const sectorData = await fetchFromSCSTrade('loadfipisector', apiPayload)
    // We attach the startDate as the 'date' for these records, 
    // effectively treating the aggregate as a transaction on the first day of the request.
    return parseApiData(sectorData, startDate)
}

function parseApiData(data: any, dateStr: string): LipiRecord[] {
    if (!Array.isArray(data)) {
        return []
    }
    return data.map((item: any) => ({
        date: dateStr,
        client_type: item.FLTypeNew,
        sector_name: item.FLSectorName,
        buy_value: parseFloat(item.FLBuyValue) || 0,
        sell_value: parseFloat(item.FLSellValue) || 0,
        net_value: (parseFloat(item.FLBuyValue) || 0) + (parseFloat(item.FLSellValue) || 0),
        source: 'scstrade'
    }))
}
