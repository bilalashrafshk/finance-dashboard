import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getHistoricalDataWithMetadata } from './lib/portfolio/db-client';
import { detectMarketCycles } from './lib/algorithms/market-cycle-detection';

async function run() {
    console.log("Fetching historical data for KSE100...");
    try {
        const { data } = await getHistoricalDataWithMetadata('kse100', 'KSE100');
        console.log(`Fetched ${data?.length} data points.`);

        if (!data || data.length === 0) {
            console.error("No data fetched!");
            return;
        }

        const priceData = data.map(d => ({
            date: d.date,
            close: d.close
        })).sort((a, b) => a.date.localeCompare(b.date));

        console.log("First data point:", priceData[0]);
        console.log("Last data point:", priceData[priceData.length - 1]);

        console.log("Detecting market cycles...");
        const cycles = detectMarketCycles(priceData);
        console.log(`Detected ${cycles.length} cycles.`);

        if (cycles.length > 0) {
            console.log("First cycle:", cycles[0]);
            console.log("Last cycle:", cycles[cycles.length - 1]);
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

run();
