import { getBOPMetadata, insertBOPData } from './db-client';

const SBP_API_BASE_URL = 'https://easydata.sbp.org.pk/api/v1';

const BOP_DATASET_KEY = 'TS_GP_BOP_BPM6SUM_M';
const BOP_SERIES_KEYS = [
    'TS_GP_BOP_BPM6SUM_M.P00010',
    'TS_GP_BOP_BPM6SUM_M.P00030',
    'TS_GP_BOP_BPM6SUM_M.P00040',
    'TS_GP_BOP_BPM6SUM_M.P00050',
    'TS_GP_BOP_BPM6SUM_M.P00060',
    'TS_GP_BOP_BPM6SUM_M.P00070',
    'TS_GP_BOP_BPM6SUM_M.P00080',
    'TS_GP_BOP_BPM6SUM_M.P00140',
    'TS_GP_BOP_BPM6SUM_M.P00180',
    'TS_GP_BOP_BPM6SUM_M.P00330',
    'TS_GP_BOP_BPM6SUM_M.P00680',
    'TS_GP_BOP_BPM6SUM_M.P00730',
];

interface SBPDatasetMeta {
    columns: string[];
    rows: string[][];
}

interface SBPDataResponse {
    columns: string[];
    rows: string[][];
}

export class SBPMacroSyncService {
    /**
     * Check if BoP data has been updated on SBP servers
     * Returns the new SBP update date if a sync is needed, null otherwise.
     */
    static async checkBoPUpdateNeeded(): Promise<string | null> {
        const apiKey = process.env.SBP_API_KEY;
        if (!apiKey) throw new Error('SBP_API_KEY missing');

        try {
            // 1. Fetch Dataset Metadata
            const metaUrl = `${SBP_API_BASE_URL}/dataset/${BOP_DATASET_KEY}/meta?api_key=${apiKey}`;
            const response = await fetch(metaUrl);
            if (!response.ok) throw new Error(`SBP Meta API error: ${response.status}`);

            const meta: SBPDatasetMeta = await response.json();
            if (!meta.rows || meta.rows.length === 0) return null;

            // The last element in each row is the "Update Date" (e.g., 19-Jan-2026)
            // Pick the first series (P00010) to check
            const firstSeriesRow = meta.rows.find(row => row[1] === 'TS_GP_BOP_BPM6SUM_M.P00010') || meta.rows[0];
            const sbpUpdateDateStr = firstSeriesRow[firstSeriesRow.length - 1]; // "19-Jan-2026"

            // 2. Get local metadata
            const localMeta = await getBOPMetadata('TS_GP_BOP_BPM6SUM_M.P00010');

            if (!localMeta) {
                console.log(`[BOP Watcher] No local data for ${BOP_DATASET_KEY}. Initial sync needed.`);
                return sbpUpdateDateStr;
            }

            // 3. Compare dates
            // SBP date format is DD-Mon-YYYY (e.g. 19-Jan-2026)
            // Our local metadata last_updated is a timestamp
            const sbpUpdateDate = this.parseSBPDate(sbpUpdateDateStr);
            const localUpdateDate = new Date(localMeta.last_updated);

            if (sbpUpdateDate > localUpdateDate) {
                console.log(`[BOP Watcher] New data detected! SBP: ${sbpUpdateDateStr} > Local: ${localUpdateDate.toISOString()}`);
                return sbpUpdateDateStr;
            }

            console.log(`[BOP Watcher] Data up to date. SBP: ${sbpUpdateDateStr}, Local: ${localUpdateDate.toISOString()}`);
            return null;
        } catch (err) {
            console.error('[BOP Watcher] Check failed:', err);
            return null;
        }
    }

    /**
     * Sync all primary BoP series keys
     */
    static async syncBoPData() {
        console.log(`[BOP Watcher] Starting full sync of ${BOP_SERIES_KEYS.length} series...`);
        let totalInserted = 0;

        for (const seriesKey of BOP_SERIES_KEYS) {
            try {
                const data = await this.fetchSeriesFromAPI(seriesKey);
                if (data.length > 0) {
                    const { inserted } = await insertBOPData(seriesKey, data[0].series_name, data);
                    totalInserted += inserted;
                    console.log(`[BOP Watcher] Synced ${seriesKey}: ${inserted} new records.`);
                }
            } catch (err) {
                console.error(`[BOP Watcher] Failed to sync ${seriesKey}:`, err);
            }
        }

        return totalInserted;
    }

    private static async fetchSeriesFromAPI(seriesKey: string) {
        const apiKey = process.env.SBP_API_KEY;
        const url = `${SBP_API_BASE_URL}/series/${seriesKey}/data?api_key=${apiKey}&format=json`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`SBP Series API error: ${res.status}`);

        const data: SBPDataResponse = await res.json();
        if (!data.rows) return [];

        const dateIdx = data.columns.findIndex(c => c.toLowerCase().includes('date'));
        const valIdx = data.columns.findIndex(c => c.toLowerCase().includes('value'));
        const nameIdx = data.columns.findIndex(c => c.toLowerCase().includes('series name'));
        const unitIdx = data.columns.findIndex(c => c.toLowerCase().includes('unit'));

        return data.rows.map(row => ({
            date: row[dateIdx],
            value: parseFloat(row[valIdx] || '0'),
            series_name: row[nameIdx],
            unit: row[unitIdx]
        }));
    }

    private static parseSBPDate(dateStr: string): Date {
        // SBP format: 19-Jan-2026
        const parts = dateStr.split('-');
        if (parts.length !== 3) return new Date(0);

        const months: Record<string, number> = {
            Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
            Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
        };

        return new Date(parseInt(parts[2]), months[parts[1]] || 0, parseInt(parts[0]));
    }
}
