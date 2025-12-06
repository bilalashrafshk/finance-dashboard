
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
 * Fetch and Store Liquidity Map Data for a specific date
 */
export async function ensureLipiData(date: string) {
    // Check if we have fresh data
    const needsRefresh = await shouldRefreshLipiData(date)

    // Check if we have ANY data
    let existingData = await getLipiData(date, date)

    if (!needsRefresh && existingData.length > 0) {
        return existingData
    }

    // Need to fetch
    console.log(`[Lipi] Fetching data for ${date}`)
    const payloadBase = {
        date1: date, // Format: MM/DD/YYYY? User used 12/04/2025. 
        date2: date,
        _search: false,
        nd: Date.now(),
        rows: 1000,
        page: 1,
    }

    // Convert YYYY-MM-DD to MM/DD/YYYY for API
    const [y, m, d] = date.split('-')
    const formattedDate = `${m}/${d}/${y}`

    const apiPayload = {
        ...payloadBase,
        date1: formattedDate,
        date2: formattedDate
    }

    try {
        // 1. Fetch Summary (loadmain) - Net Value by Client
        // Note: loadmain gives us Net Value. loadfipisector gives detailed Buy/Sell but separated by sector?
        // Actually, let's look at the implementation plan again. 
        // We want the Sector matrix. `loadfipisector` gives sector-wise details.

        const sectorData = await fetchFromSCSTrade('loadfipisector', {
            ...apiPayload,
            sidx: "FLSectorName asc, FLTypeNew",
            sord: "desc"
        })

        if (!Array.isArray(sectorData)) {
            throw new Error("Invalid sector data format")
        }

        const records: LipiRecord[] = sectorData.map((item: any) => ({
            date: date,
            client_type: item.FLTypeNew,
            sector_name: item.FLSectorName,
            buy_value: parseFloat(item.FLBuyValue) || 0,
            sell_value: parseFloat(item.FLSellValue) || 0,
            net_value: (parseFloat(item.FLBuyValue) || 0) + (parseFloat(item.FLSellValue) || 0), // Calculate net from buy/sell
            source: 'scstrade'
        }))

        // Insert into DB
        await insertLipiData(records)

        return records

    } catch (error) {
        console.error(`[Lipi] Failed to fetch data:`, error)
        if (existingData.length > 0) return existingData // Fallback
        throw error
    }
}
