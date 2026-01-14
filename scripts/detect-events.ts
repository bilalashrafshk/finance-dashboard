import { fetchPSXQuote } from '../lib/portfolio/psx-api';
// We need to access DB directly for scripts usually, or use the client if it works in node
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import { generateHeadline } from '../lib/ai-service';
import { getEventHeadlinePrompt } from '../lib/ai-prompts';

// Load env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// List of stocks to watch (simplified for now, could be dynamic)
const WATCHLIST = ['OGDC', 'PPL', 'MARI', 'HBL', 'UBL', 'MCB', 'LUCK', 'ENGRO', 'SYS', 'TRG'];


async function getHistoricalStats(client: any, symbol: string) {
    // Get stats from company_profiles (efficient cache)
    const query = `
    SELECT all_time_high, fifty_two_week_high as year_high
    FROM company_profiles 
    WHERE symbol = $1
  `;
    const res = await client.query(query, [symbol]);

    // If not found in profiles, fallback to checking history directly
    // This handles cases where a new stock hasn't been cached yet
    if (!res.rows[0] || !res.rows[0].all_time_high) {
        console.log(`Cache miss for ${symbol}, fetching from history...`);
        const histQuery = `
        SELECT 
          MAX(high) as all_time_high,
          MAX(CASE WHEN date > NOW() - INTERVAL '1 year' THEN high ELSE 0 END) as year_high
        FROM historical_price_data 
        WHERE symbol = $1 AND asset_type = 'pk-equity'
      `;
        const histRes = await client.query(histQuery, [symbol]);
        return histRes.rows[0];
    }

    return res.rows[0];
}


async function checkAndLogEvent(client: any, symbol: string, currentPrice: number, closePrice: number, stats: any) {
    const { all_time_high, year_high } = stats;
    // Fallback if no history
    const ATH = parseFloat(all_time_high) || 0;
    const YH = parseFloat(year_high) || 0;

    let eventType = null;
    let previousValue = 0;

    // Simple logic: Check if current price is higher than stored ATH or 52W High
    // Note: ideally we check if we ALREADY triggered this today so we don't spam

    if (ATH > 0 && currentPrice > ATH) {
        eventType = 'ATH';
        previousValue = ATH;
    } else if (YH > 0 && currentPrice > YH) {
        eventType = '52W_HIGH';
        previousValue = YH;
    }

    if (eventType) {
        // Check if we already logged this event type for this symbol TODAY
        // This avoids spamming "New ATH" every minute as price goes up 0.01
        const checkQuery = `
      SELECT id FROM notable_events 
      WHERE symbol = $1 AND event_type = $2 
      AND created_at > CURRENT_DATE
    `;
        const existing = await client.query(checkQuery, [symbol, eventType]);

        if (existing.rowCount === 0) {
            console.log(`🚀 Event Detected: ${symbol} ${eventType} (Price: ${currentPrice}, Prev: ${previousValue})`);

            // Generate Headline
            const prompt = getEventHeadlinePrompt(symbol, eventType, currentPrice, previousValue, closePrice);
            const headline = await generateHeadline(prompt);

            console.log(`📰 Headline: ${headline}`);

            // Save to DB
            await client.query(`
        INSERT INTO notable_events (symbol, event_type, headline, description, metadata)
        VALUES ($1, $2, $3, $4, $5)
      `, [
                symbol,
                eventType,
                headline,
                `Price reached ${currentPrice}, surpassing previous ${eventType} of ${previousValue}`,
                { currentPrice, previousValue, time: new Date().toISOString() }
            ]);
        } else {
            console.log(`ℹ️  Event ${eventType} for ${symbol} already logged today.`);
        }
    }
}

async function main() {
    const client = await pool.connect();
    try {
        console.log('Starting Market Watcher...');

        for (const symbol of WATCHLIST) {
            try {
                // 1. Fetch live quote
                const quote = await fetchPSXQuote(symbol);
                if (!quote || !quote.lastPrice) {
                    console.log(`Skipping ${symbol}: No quote data`);
                    continue;
                }

                // Check both Last Price AND Intraday High for breakouts
                let priceToCheck = quote.lastPrice;
                if (quote.high && quote.high > priceToCheck) {
                    priceToCheck = quote.high;
                }

                // 2. Get Stats
                const stats = await getHistoricalStats(client, symbol);

                // 3. Check for events
                await checkAndLogEvent(client, symbol, priceToCheck, quote.lastPrice, stats);

            } catch (err) {
                console.error(`Error processing ${symbol}:`, err);
            }
        }

        console.log('Market Watcher finished.');

    } catch (err) {
        console.error('Fatal error:', err);
    } finally {
        client.release();
        await pool.end();
        // Allow process to exit
        process.exit(0);
    }
}

main();
