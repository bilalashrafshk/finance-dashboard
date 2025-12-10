
import { insertLipiData, getLipiData, shouldRefreshLipiData, LipiRecord } from './lipi-db-client'

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
 * Fetch and Store Liquidity Map Data for a date range
 * If startDate == endDate, it will cache the result in DB.
 * If range, it fetches aggregate directly from API (no caching).
 */
export async function fetchLipiData(startDate: string, endDate: string) {
    const isSingleDay = startDate === endDate

    // 1. Single Day: Check Cache
    if (isSingleDay) {
        // Check if we have fresh data
        const needsRefresh = await shouldRefreshLipiData(startDate)

        // Check if we have ANY data
        let existingData = await getLipiData(startDate, startDate)

        if (!needsRefresh && existingData.length > 0) {
            return existingData
        }
    }

    // 2. Fetch from API (Single or Range)
    console.log(`[Lipi] Fetching data for ${startDate} to ${endDate}`)

    // Convert YYYY-MM-DD to MM/DD/YYYY for API
    const formatForApi = (d: string) => {
        const [y, m, day] = d.split('-')
        return `${m}/${day}/${y}`
    }

    const apiPayload = {
        date1: formatForApi(startDate),
        date2: formatForApi(endDate),
        _search: false,
        nd: Date.now(),
        rows: 1000,
        page: 1
    }

    try {
        const sectorData = await fetchFromSCSTrade('loadfipisector', {
            ...apiPayload,
            sidx: "FLSectorName asc, FLTypeNew",
            sord: "desc"
        })

        if (!Array.isArray(sectorData)) {
            throw new Error("Invalid sector data format")
        }

        const records: LipiRecord[] = sectorData.map((item: any) => ({
            date: startDate, // For range, this date is nominal.
            client_type: item.FLTypeNew,
            sector_name: item.FLSectorName,
            buy_value: parseFloat(item.FLBuyValue) || 0,
            sell_value: parseFloat(item.FLSellValue) || 0,
            net_value: (parseFloat(item.FLBuyValue) || 0) + (parseFloat(item.FLSellValue) || 0), // Calculate net from buy/sell
            source: 'scstrade'
        }))

        // 3. Single Day: Store in DB
        if (isSingleDay) {
            await insertLipiData(records)
        }

        return records

    } catch (error) {
        console.error(`[Lipi] Failed to fetch data:`, error)
        // Fallback for single day only
        if (isSingleDay) {
            let existingData = await getLipiData(startDate, startDate)
            if (existingData.length > 0) return existingData
        }
        throw error
    }
}
