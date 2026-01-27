
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { AIContextService } from '../lib/ai/ai-context-service';

async function main() {
    const symbol = 'SAZEW';

    console.log(`Testing AIContextService for ${symbol}...`);

    const context = await AIContextService.getContext(symbol);

    console.log('\n--- Price & Valuation ---');
    console.log(`Current Price: ${context.price_context.current}`);
    console.log(`Dynamic PE: ${context.valuation_context.company_pe}`);
    console.log(`Sector Avg PE: ${context.valuation_context.sector_avg_pe}`);

    console.log('\n--- Growth Context ---');
    console.log(JSON.stringify(context.growth_context, null, 2));

    console.log('\n--- Quarterly Data Summary ---');
    console.log(`Total Quarters Found: ${context.earnings.quarterly.length}`);
    if (context.earnings.quarterly.length > 0) {
        console.log('Last Quarter:', context.earnings.quarterly[0]);
    }
}

main().catch(console.error).finally(() => process.exit());
