import { getSBPEconomicData, insertSBPEconomicData, shouldRefreshSBPEconomicData } from '@/lib/portfolio/db-client'

const SBP_API_BASE_URL = 'https://easydata.sbp.org.pk/api/v1/series'

interface SBPAPIResponse {
    columns: string[]
    rows: Array<Array<string | number>>
}

interface SBPDataPoint {
    date: string
    value: number
    unit: string
    observation_status: string
    status_comments: string
    series_name: string
}

export const MACRO_KEYS = [
    'TS_GP_PT_CPI_M.P00011516', // CPI
    'TS_GP_RLS_PAKGDP15_Y.GDP00160000', // GDP
    'TS_GP_ER_FAERPKR_M.E00220', // Exchange Rate
    'TS_GP_BAM_SIRKIBOR_D.KIBOR0030', // KIBOR
    'TS_GP_BAM_M2_W.M000030', // Deposits
    'TS_GP_BOP_BPM6SUM_M.P00730', // Reserves
    'TS_GP_BAM_M2_W.M000070', // M2
    'TS_GP_RLS_POLSALE_M.P_001000', // POL Sales
    'TS_GP_RLS_ELECGEN_M.E_001000', // Electricity Gen
    'TS_GP_BOP_WR_M.WR0340', // Remittances
    'TS_GP_FI_SUMFIPK_M.FI00030', // FDI
    'TS_GP_RLS_PSAUTO_M.TAS_001000', // Vehicle Sales
    'TS_GP_RLS_CEMSEC_M.C_001000', // Cement Sales
    'TS_GP_IR_SIRPR_AH.SBPOL0030', // Target Rate
    'TS_GP_IR_SIRPR_AH.SBPOL0010', // Reverse Repo
    'TS_GP_IR_SIRPR_AH.SBPOL0020', // Repo
]

async function fetchSBPEconomicDataFromAPI(
    seriesKey: string,
    startDate?: string,
    endDate?: string
): Promise<SBPDataPoint[]> {
    const apiKey = process.env.SBP_API_KEY

    if (!apiKey) {
        throw new Error('SBP_API_KEY environment variable is not set')
    }

    const params = new URLSearchParams({
        api_key: apiKey,
        format: 'json'
    })

    if (startDate) {
        params.append('start_date', startDate)
    }
    if (endDate) {
        params.append('end_date', endDate)
    }

    const url = `${SBP_API_BASE_URL}/${seriesKey}/data?${params.toString()}`

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
        },
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`SBP API error (${response.status}): ${errorText.substring(0, 200)}`)
    }

    const data: SBPAPIResponse = await response.json()

    if (!data.rows || data.rows.length === 0) {
        return []
    }

    // Find column indices
    const dateColIdx = data.columns.findIndex(col =>
        col.toLowerCase().includes('date') || col.toLowerCase().includes('observation date')
    )
    const valueColIdx = data.columns.findIndex(col =>
        col.toLowerCase().includes('value') || col.toLowerCase().includes('observation value')
    )
    const seriesNameColIdx = data.columns.findIndex(col =>
        col.toLowerCase().includes('series name')
    )
    const unitColIdx = data.columns.findIndex(col =>
        col.toLowerCase().includes('unit')
    )
    const statusColIdx = data.columns.findIndex(col =>
        col.toLowerCase().includes('status') && !col.toLowerCase().includes('comment')
    )
    const commentsColIdx = data.columns.findIndex(col =>
        col.toLowerCase().includes('comment')
    )

    // Validate that required columns were found
    if (dateColIdx === -1 || valueColIdx === -1) {
        throw new Error(`Invalid API response: missing required columns. Expected 'date' and 'value' columns, got: ${data.columns.join(', ')}`)
    }

    return data.rows.map(row => ({
        date: String(row[dateColIdx] || ''),
        value: parseFloat(String(row[valueColIdx] || 0)),
        unit: unitColIdx !== -1 ? String(row[unitColIdx] || 'Percent') : 'Percent',
        observation_status: statusColIdx !== -1 ? String(row[statusColIdx] || 'Normal') : 'Normal',
        status_comments: commentsColIdx !== -1 ? String(row[commentsColIdx] || '') : '',
        series_name: seriesNameColIdx !== -1 ? String(row[seriesNameColIdx] || '') : ''
    }))
}

export async function ensureSBPEconomicData(
    seriesKey: string,
    startDate?: string,
    endDate?: string,
    forceRefresh: boolean = false
) {
    // Check if we need to refresh (3-day cache)
    const needsRefresh = forceRefresh || await shouldRefreshSBPEconomicData(seriesKey)

    // Get data from database first
    let { data, latestStoredDate, earliestStoredDate } = await getSBPEconomicData(
        seriesKey,
        startDate,
        endDate
    )

    // If no data in database or needs refresh, fetch from API
    if (needsRefresh || data.length === 0) {
        try {
            // Determine default start date based on series key logic
            let fetchStartDate = startDate
            let fetchEndDate = endDate

            if (!fetchStartDate) {
                // Set default start dates based on series key patterns
                if (seriesKey.includes('CPI')) {
                    fetchStartDate = '2016-07-01'
                } else if (seriesKey.includes('GDP')) {
                    fetchStartDate = '2001-01-01'
                } else if (seriesKey.includes('ER_FAERPKR')) {
                    fetchStartDate = '1947-08-01'
                } else if (seriesKey.includes('BOP_WR')) {
                    fetchStartDate = '1972-07-01'
                } else if (seriesKey.includes('KIBOR')) {
                    fetchStartDate = '2005-06-09'
                } else if (seriesKey.includes('BOP_BPM6SUM')) {
                    fetchStartDate = '2013-07-01'
                } else if (seriesKey.includes('FI_SUMFIPK')) {
                    fetchStartDate = '1997-07-01'
                } else if (seriesKey.includes('BAM_M2_W')) {
                    fetchStartDate = '2014-07-04'
                } else if (seriesKey.includes('PSAUTO_M')) {
                    fetchStartDate = '2004-07-01'
                } else if (seriesKey.includes('CEMSEC_M')) {
                    fetchStartDate = '1991-07-01'
                } else if (seriesKey.includes('ELECGEN_M')) {
                    fetchStartDate = '2012-07-01'
                } else if (seriesKey.includes('POLSALE_M')) {
                    fetchStartDate = '2013-07-01'
                } else if (seriesKey.includes('BOP_SCRA_W')) {
                    fetchStartDate = '2007-07-07'
                }
            }

            if (!fetchEndDate) {
                // Default end date: today
                fetchEndDate = new Date().toISOString().split('T')[0]
            }

            const apiData = await fetchSBPEconomicDataFromAPI(seriesKey, fetchStartDate, fetchEndDate)

            if (apiData.length > 0) {
                // Store in database
                const seriesName = apiData[0].series_name
                await insertSBPEconomicData(
                    seriesKey,
                    seriesName,
                    apiData.map(d => ({
                        date: d.date,
                        value: d.value,
                        unit: d.unit,
                        observation_status: d.observation_status,
                        status_comments: d.status_comments
                    }))
                )

                // Re-fetch from database to get the stored data
                const dbResult = await getSBPEconomicData(seriesKey, startDate, endDate)
                data = dbResult.data
                latestStoredDate = dbResult.latestStoredDate
                earliestStoredDate = dbResult.earliestStoredDate
            }
        } catch (apiError: any) {
            // If API fails but we have data in DB, use that
            if (data.length === 0) {
                throw apiError // Only throw if we have no data at all
            }
            console.error(`[SBP Service] API fetch failed for ${seriesKey}, using cached data:`, apiError.message)
        }
    }

    return {
        data,
        latestStoredDate,
        earliestStoredDate,
        source: needsRefresh ? 'api' : 'database',
        cached: !needsRefresh
    }
}
