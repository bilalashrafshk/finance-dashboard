
import { TwitterAgentService } from '../lib/ai/twitter-agent';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testBriefing() {
    console.log('--- TESTING NEWS BRIEFING MODE ---');
    try {
        const symbol = 'PPL';
        const notes = `PPL Announces Hydrocarbon Discovery at Bilitang-1 Well, De-risking TAL Block Exploration
        (OIL & GAS EXPLORATION COMPANIES)
        
        This significant gas discovery is expected to trigger a strong positive market reaction for PPL, potentially driving its stock higher given its current valuation relative to the sector. However, the absence of reserve estimates or commercial viability details might temper long-term speculative buying initially.
        
        The Intelligence Scoop
        • Pakistan Petroleum Limited (PPL), with a 30% working interest in the TAL Joint Venture, has discovered gas at the exploratory Bilitang-1 well in the Lockhart formation.
        
        • The Bilitang-1 well, spudded on August 10, 2025, successfully tested gas at a rate of 1.37 Million Standard Cubic Feet Per Day (MMSCFD).
        
        • This discovery de-risks further exploration within the TAL Block, opening new upside opportunities for the company.
        
        Valuation Insight
        "The company's P/E of 7.64 is below the sector average of 8.85, suggesting undervaluation. This discovery could help close that gap, indicating significant upside potential."
        
        Momentum Pulse
        "The positive news is likely to generate upward momentum; however, the stock is already trading at 245.17, close to its 52-week high of 269.99, indicating potential for increased volatility."`;

        console.log('\nCalling TwitterAgentService.generate with mode="briefing"...');
        const result = await TwitterAgentService.generate(symbol, notes, 'briefing', '', 'long');

        console.log('\n✅ SUCCESS!');

        console.log('\n--- DRAFT OUTPUT ---');
        console.log(result.draft);

        // Validation
        const hasScoop = result.draft.includes('The Intelligence Scoop');
        const hasPulse = result.draft.includes('Momentum Pulse');

        if (hasScoop && hasPulse) {
            console.log('\n✅ Verified: Output contains required headers.');
        } else {
            console.warn('\n⚠️ Warning: Output might be missing structured headers.');
        }

    } catch (error: any) {
        console.error('\n❌ FAILED:', error.message);
    }
}

testBriefing();
