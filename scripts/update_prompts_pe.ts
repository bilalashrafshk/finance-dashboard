
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function updatePrompts() {
    const client = await pool.connect();
    try {
        console.log('📝 Updating AI Prompts with Negative PE Logic...');

        const negativePEInstruction = `
3. **Valuation Context (CRITICAL):**
   - If PE is NEGATIVE (e.g. -0.93), it means the company is making LOSSES.
   - Do NOT say "Undervalued" for negative PE.
   - Instead, say: "Negative PE indicates recent losses, signaling financial distress or turnaround phase." or "Trading below sector average but earnings are negative."
        `;

        // 1. Fetch current content
        const slugs = ['financial-analyst', 'event-analyst'];

        for (const slug of slugs) {
            const res = await client.query("SELECT content FROM ai_prompts WHERE slug = $1", [slug]);
            if (res.rows.length === 0) continue;

            let content = res.rows[0].content;

            // Avoid double insertion
            if (content.includes("If PE is NEGATIVE")) {
                console.log(`Skipping ${slug}, already updated.`);
                continue;
            }

            // Insert before OUTPUT FORMAT
            if (content.includes("**OUTPUT FORMAT")) {
                content = content.replace("**OUTPUT FORMAT", `${negativePEInstruction}\n\n**OUTPUT FORMAT`);
            } else {
                content += `\n\n${negativePEInstruction}`;
            }

            // Update DB
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

updatePrompts();
