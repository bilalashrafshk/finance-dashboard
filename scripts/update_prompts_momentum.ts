
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function updateMomentumPrompt() {
    const client = await pool.connect();
    try {
        console.log('📝 Updating AI Prompts with Momentum Context Logic...');

        const momentumInstruction = `
4. **Momentum Context (NEW):**
   - Check 'momentum_context' in provided data.
   - If **RSI** is available, interpret it (e.g. "RSI at 75 suggests overbought conditions").
   - If **YTD Return** is available, mention it (e.g. "Stock is up 15% YTD").
   - If these are missing, fallback to comparing Current Price vs 52-Week High.
   - ONLY return "N/A" if absolutely no price data exists.
        `;

        const slugs = ['financial-analyst', 'event-analyst'];

        for (const slug of slugs) {
            const res = await client.query("SELECT content FROM ai_prompts WHERE slug = $1", [slug]);
            if (res.rows.length === 0) continue;

            let content = res.rows[0].content;

            if (content.includes("Check 'momentum_context'")) {
                console.log(`Skipping ${slug}, already updated.`);
                continue;
            }

            // Append after Valuation Context logic we added earlier
            // or just append to end of instructions before OUTPUT FORMAT
            if (content.includes("**OUTPUT FORMAT")) {
                content = content.replace("**OUTPUT FORMAT", `${momentumInstruction}\n\n**OUTPUT FORMAT`);
            } else {
                content += `\n\n${momentumInstruction}`;
            }

            await client.query("UPDATE ai_prompts SET content = $1 WHERE slug = $2", [content, slug]);
            console.log(`✅ Updated ${slug}.`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

updateMomentumPrompt();
