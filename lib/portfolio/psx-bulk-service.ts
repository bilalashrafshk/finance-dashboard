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
}

/**
 * Scrapes PSX Market Watch and updates multiple stocks in one bulk operation.
 * Returns the count of updated stocks.
 */
export async function syncAllPSXLivePrices(): Promise<number> {
    try {
        const response = await fetch('https://dps.psx.com.pk/market-watch', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            next: { revalidate: 0 } // Bypass any Next.js caching
        });

        if (!response.ok) {
            throw new Error(`PSX Market Watch fetch failed: ${response.status}`);
        }

        const html = await response.text();
        const today = new Date().toISOString().split('T')[0];

        // Regex explanation:
        // 1. Symbol: data-search="([A-Z0-9]+)"
        // 2. Skip Cols 2-7
        // 3. Price (Col 8): data-order="([\d.]+)"
        // 4. Skip Col 9 (Change), Col 10 (Change %)
        // 5. Volume (Col 11): data-order="(\d+)"
        const rowRegex = /<td\s+data-search="([A-Z0-9]+)"[^>]*>.*?<td[^>]*data-order="([\d.]+)"[^>]*>.*?<td[^>]*data-order="([\d.+-]+)"[^>]*>.*?<td[^>]*data-order="([\d.+-]+)"[^>]*>.*?<td[^>]*data-order="(\d+)"[^>]*>/gs;

        // Actually, let's use a simpler approach based on the HTML structure of rows
        // <tr>...</tr>
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
                    rows.push({ symbol, open, high, low, close, volume, date: today });
                }
            }
        }

        if (rows.length === 0) {
            console.warn('[PSX Bulk] No prices extracted from HTML.');
            return 0;
        }

        // Bulk Upsert to Database
        const client = await getPool().connect();
        try {
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
            return rows.length;

        } finally {
            client.release();
        }
    } catch (e) {
        console.error('[PSX Bulk] Fatal Sync Error:', e);
        return 0;
    }
}
