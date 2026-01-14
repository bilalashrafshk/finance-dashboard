
import { fetchPSXQuote } from '../lib/portfolio/psx-api';

async function main() {
    try {
        const symbol = 'OGDC';
        console.log(`Fetching live quote for ${symbol}...`);
        const quote = await fetchPSXQuote(symbol);
        console.log('Quote:', JSON.stringify(quote, null, 2));
    } catch (err) {
        console.error('Error:', err);
    }
}

main();
