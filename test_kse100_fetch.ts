
import { fetchStockAnalysisData } from './lib/portfolio/stockanalysis-api';

async function run() {
    console.log("Fetching KSE100 data...");
    try {
        // Try as PSX market
        const data = await fetchStockAnalysisData('KSE100', 'PSX');
        if (data) {
            console.log(`Success! Fetched ${data.length} records.`);
            console.log("First:", data[0]);
            console.log("Last:", data[data.length - 1]);
        } else {
            console.log("Failed to fetch KSE100 data.");
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

run();
