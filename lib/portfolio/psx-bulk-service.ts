import { Pool } from 'pg';

// Lazy pool initialization
let pool: Pool | null = null;
function getPool() {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
        if (!connectionString) throw new Error('DATABASE_URL or POSTGRES_URL required');
        pool = new Pool({
            connectionString,
            ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
        });
    }
    return pool;
}

export interface PSXBulkPrice {
    symbol: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    date: string;
    adjusted_close: number | null;
    change_pct: number | null;
}

/**
 * Scrapes SCS Trade Index View for live index values (KSE100, etc.)
 */
async function fetchLiveIndices(): Promise<PSXBulkPrice[]> {
    try {
        const response = await fetch('https://scstrade.com/MarketStatistics/MS_IndexView.aspx', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            next: { revalidate: 0 }
        });

        if (!response.ok) return [];

        const html = await response.text();
        const today = new Date().toISOString().split('T')[0];

        // Extract KSE100
        const codeMatch = html.match(/id="ContentPlaceHolder1_lblIndexCode">([^<]+)<\/span>/);
        const valueMatch = html.match(/id="ContentPlaceHolder1_lblCurrentIndex">([\d,.]+)<\/span>/);

        if (codeMatch && valueMatch) {
            const symbol = codeMatch[1].trim();
            const close = parseFloat(valueMatch[1].replace(/,/g, ''));

            if (!isNaN(close) && close > 0) {
                return [{
                    symbol,
                    open: close,
                    high: close,
                    low: close,
                    close,
                    volume: 0,
                    date: today,
                    adjusted_close: null,
                    change_pct: null
                }];
            }
        }
    } catch (e) {
        console.error('[PSX Bulk] Index Scrape Error:', e);
    }
    return [];
}

/**
 * Scrapes PSX Market Watch and updates multiple stocks in one bulk operation.
 * Returns the count of updated stocks.
 */
export async function syncAllPSXLivePrices(): Promise<number> {
    try {
        const [psxResponse, liveIndices] = await Promise.all([
            fetch('https://dps.psx.com.pk/market-watch', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                next: { revalidate: 0 }
            }),
            fetchLiveIndices()
        ]);

        if (!psxResponse.ok) {
            throw new Error(`PSX Market Watch fetch failed: ${psxResponse.status}`);
        }

        const html = await psxResponse.text();
        const today = new Date().toISOString().split('T')[0];

        const rows: PSXBulkPrice[] = [];
        const symbolMatches = html.matchAll(/<tr><td data-search="([A-Z0-9]+)"[^>]*>.*?<\/tr>/gs);

        for (const match of symbolMatches) {
            const symbol = match[1];
            const rowHtml = match[0];

            const tdMatches = rowHtml.matchAll(/<td[^>]*data-order="([\d.+-]+)"[^>]*>/g);
            const values: string[] = [];
            for (const tm of tdMatches) {
                values.push(tm[1]);
            }

            if (values.length >= 8) {
                const open = parseFloat(values[1]);
                const high = parseFloat(values[2]);
                const low = parseFloat(values[3]);
                const close = parseFloat(values[4]);
                const volume = parseInt(values[7]);

                if (!isNaN(close) && close > 0) {
                    rows.push({
                        symbol,
                        open,
                        high,
                        low,
                        close,
                        volume,
                        date: today,
                        adjusted_close: null,
                        change_pct: null
                    });
                }
            }
        }

        if (rows.length === 0 && liveIndices.length === 0) {
            console.warn('[PSX Bulk] No prices extracted from HTML.');
            return 0;
        }

        let totalUpdated = 0;

        // 1. Update Equities (Bulk logic kept for performance)
        if (rows.length > 0) {
            const client = await getPool().connect();
            try {
                await client.query('BEGIN');

                const query = `
                    INSERT INTO historical_price_data 
                    (symbol, asset_type, date, open, high, low, close, volume, source)
                    VALUES ${rows.map((_, i) => `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9})`).join(',')}
                    ON CONFLICT (asset_type, symbol, date) 
                    DO UPDATE SET 
                      open = EXCLUDED.open,
                      high = EXCLUDED.high,
                      low = EXCLUDED.low,
                      close = EXCLUDED.close, 
                      volume = EXCLUDED.volume,
                      source = EXCLUDED.source,
                      updated_at = NOW()
                `;

                const values = rows.flatMap(r => [
                    r.symbol,
                    'pk-equity',
                    r.date,
                    r.open || r.close,
                    r.high || r.close,
                    r.low || r.close,
                    r.close,
                    r.volume,
                    'psx-bulk-sync'
                ]);

                await client.query(query, values);

                // Update metadata for equities (Batch update)
                await client.query(`
                    INSERT INTO historical_data_metadata (asset_type, symbol, last_stored_date, source, last_updated)
                    SELECT 'pk-equity', symbol, date::date, 'psx-bulk-sync', NOW()
                    FROM (SELECT unnest($1::text[]) as symbol, $2::text as date) data
                    ON CONFLICT (asset_type, symbol) 
                    DO UPDATE SET 
                        last_stored_date = EXCLUDED.last_stored_date,
                        last_updated = NOW()
                `, [rows.map(r => r.symbol), today]);

                await client.query('COMMIT');
                totalUpdated += rows.length;

                // 3. Check for Breakouts / Events (Async)
                // Use the scraped data to detect new ATHs immediately
                try {
                    const { processBreakouts } = await import('@/lib/events/event-processor');
                    const candidates = rows.map(r => ({
                        symbol: r.symbol,
                        price: r.close,
                        dayHigh: r.high > 0 ? r.high : r.close // Use Close if High is 0/missing
                    }));

                    // Run event processing (Awaited to ensure completion within serverless timeout)
                    await processBreakouts(candidates);
                } catch (eventErr) {
                    console.error('[PSX Bulk] Event processing failed:', eventErr);
                }

            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        }

        // 2. Update Indices (Using centralized logic)
        if (liveIndices.length > 0) {
            const { insertHistoricalData } = await import('./db-client');
            for (const idx of liveIndices) {
                const idxAssetType = idx.symbol === 'KSE100' ? 'kse100' : 'indices';
                await insertHistoricalData(idxAssetType as any, idx.symbol, [idx], 'scstrade-live-sync' as any);
                totalUpdated++;
            }
        }

        return totalUpdated;
    } catch (e) {
        console.error('[PSX Bulk] Fatal Sync Error:', e);
        return 0;
    }
}
