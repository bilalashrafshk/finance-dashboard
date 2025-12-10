
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
 * Fetch and Store Liquidity Map Data for a date range with Smart Backfill
 * 1. Checks DB for existing dates in range.
 * 2. Identifies missing dates.
 * 3. Fetches missing dates from API in parallel.
 * 4. Stores new data.
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

    const missingDates = allDates.filter(d => {
        const dateStr = format(d, 'yyyy-MM-dd')
        return !existingDates.has(dateStr)
    })

    if (missingDates.length === 0) {
        console.log(`[Lipi] All dates found in DB. Returning ${existingRecords.length} records.`)
        return existingRecords
    }

    console.log(`[Lipi] Found ${missingDates.length} missing dates. Fetching in parallel...`)

    // 3. Fetch missing dates in parallel (chunks of 5 to avoid rate limits)
    const chunkSize = 5
    const newRecords: LipiRecord[] = []

    // Sort missing dates to process sequentially if needed or just chunks
    // Convert to string for processing
    const missingDateStrs = missingDates.map(d => format(d, 'yyyy-MM-dd'))

    for (let i = 0; i < missingDateStrs.length; i += chunkSize) {
        const chunk = missingDateStrs.slice(i, i + chunkSize)
        console.log(`[Lipi] Processing chunk: ${chunk.join(', ')}`)

        const promises = chunk.map(async (dateStr) => {
            try {
                return await fetchSingleDayFromAPI(dateStr)
            } catch (e) {
                console.error(`[Lipi] Failed to fetch ${dateStr}:`, e)
                return []
            }
        })

        const chunkResults = await Promise.all(promises)
        chunkResults.forEach(records => newRecords.push(...records))

        // Minor delay to be nice to API
        if (i + chunkSize < missingDateStrs.length) {
            await new Promise(r => setTimeout(r, 500))
        }
    }

    // 4. Store new data
    if (newRecords.length > 0) {
        console.log(`[Lipi] Inserting ${newRecords.length} new records into DB`)
        await insertLipiData(newRecords)
    }

    // 5. Return merged results
    return [...existingRecords, ...newRecords]
}

/**
 * Helper to fetch a single day from API
 */
async function fetchSingleDayFromAPI(date: string): Promise<LipiRecord[]> {
    const formattedDate = format(parseISO(date), 'MM/dd/yyyy')

    const apiPayload = {
        date1: formattedDate,
        date2: formattedDate,
        _search: false,
        nd: Date.now(),
        rows: 1000,
        page: 1
    }

    const sectorData = await fetchFromSCSTrade('loadfipisector', {
        ...apiPayload,
        sidx: "FLSectorName asc, FLTypeNew",
        sord: "desc"
    })

    if (!Array.isArray(sectorData)) {
        return []
    }

    return sectorData.map((item: any) => ({
        date: date,
        client_type: item.FLTypeNew,
        sector_name: item.FLSectorName,
        buy_value: parseFloat(item.FLBuyValue) || 0,
        sell_value: parseFloat(item.FLSellValue) || 0,
        net_value: (parseFloat(item.FLBuyValue) || 0) + (parseFloat(item.FLSellValue) || 0),
        source: 'scstrade'
    }))
}
