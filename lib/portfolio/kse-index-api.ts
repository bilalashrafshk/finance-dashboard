/**
 * KSE Index API Client
 * Fetches historical indices data (KSE100) directly from KSE Source API
 * This is a server-side API client.
 */

export interface IndexSourceDataPoint {
    kse_index_id: number
    kse_index_type_id: number
    kse_index_date: string // Format: "/Date(1704049200000)/"
    kse_index_open: number
    kse_index_high: number
    kse_index_low: number
    kse_index_close: number
    kse_index_value: number
    kse_index_change: number
    kse_index_changep: number
}

export interface HistoricalPriceRecord {
    date: string
    open: number
    high: number
    low: number
    close: number
    volume: number | null
    adjusted_close: number | null
    change_pct: number | null
}

/**
 * Parse ASP.NET JSON date format "/Date(1704049200000)/" to ISO string "YYYY-MM-DD"
 */
function parseAspDate(aspDate: string): string {
    try {
        const timestamp = parseInt(aspDate.replace(/\/Date\((-?\d+)\)\//, '$1'))
        if (isNaN(timestamp)) return ''
        return new Date(timestamp).toISOString().split('T')[0]
    } catch (e) {
        console.error('Error parsing ASP date:', aspDate, e)
        return ''
    }
}

/**
 * Fetch historical KSE100 data from KSE Source
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 */
export async function fetchKSE100Data(
    startDate: string,
    endDate: string
): Promise<HistoricalPriceRecord[] | null> {
    try {
        const url = 'https://scstrade.com/MarketStatistics/MS_HistoricalIndices.aspx/chart'

        // Convert YYYY-MM-DD to MM/DD/YYYY for Source
        const formatDateForApi = (dateStr: string) => {
            const [y, m, d] = dateStr.split('-')
            return `${m}/${d}/${y}`
        }

        const payload = {
            par: "KSE 100",
            date1: formatDateForApi(startDate),
            date2: formatDateForApi(endDate),
            _search: false,
            nd: Date.now(),
            rows: 10000, // Fetch enough rows for the range
            page: 1,
            sidx: "kse_index_date",
            sord: "asc" // Oldest first
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: JSON.stringify(payload)
        })

        if (!response.ok) {
            console.error(`KSE Source API error: ${response.status} ${response.statusText}`)
            return null
        }

        const data = await response.json()

        if (!data.d || !Array.isArray(data.d)) {
            console.error('Unexpected KSE Source API response format:', data)
            return null
        }

        const records: HistoricalPriceRecord[] = data.d.map((item: IndexSourceDataPoint) => ({
            date: parseAspDate(item.kse_index_date),
            open: item.kse_index_open,
            high: item.kse_index_high,
            low: item.kse_index_low,
            close: item.kse_index_close,
            volume: item.kse_index_value, // Using value as volume proxy or actual volume if available
            adjusted_close: null,
            change_pct: item.kse_index_changep
        })).filter((r: HistoricalPriceRecord) => r.date !== '') // Filter out invalid dates

        return records
    } catch (error) {
        console.error('Error fetching KSE100 data from KSE Source:', error)
        return null
    }
}
