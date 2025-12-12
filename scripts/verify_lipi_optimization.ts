
import { fetchLipiData } from '../lib/portfolio/market-liquidity-service';
import { format, subDays } from 'date-fns';

async function run() {
    // Pick a range unlikely to be fully in DB (or just rely on the fact that I haven't run this for a while)
    // Or I can pick a range specifically.
    // Let's pick the last 15 days.
    const end = new Date();
    const start = subDays(end, 15);

    const startDate = format(start, 'yyyy-MM-dd');
    const endDate = format(end, 'yyyy-MM-dd');

    console.log(`Testing fetchLipiData for ${startDate} to ${endDate}...`);

    const startTime = Date.now();
    try {
        const results = await fetchLipiData(startDate, endDate);
        const duration = Date.now() - startTime;

        console.log(`\nSuccess! Fetched ${results.length} records in ${duration}ms`);
        console.log(`Average time per day: ${duration / 15}ms`);

        // Validation
        if (duration > 5000) {
            console.warn('WARNING: Operation took longer than 5s. Optimization might not be working or network is very slow.');
        } else {
            console.log('PERFORMANCE: Excellent (< 5s).');
        }

    } catch (error) {
        console.error('Error executing fetchLipiData:', error);
    }
}

run();
