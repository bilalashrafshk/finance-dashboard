
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function update() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();

        // Fetch current instructions
        const res = await client.query("SELECT humanizer_instructions FROM brand_personality WHERE slug = 'bilal-ashraf';");
        let instructions = res.rows[0]?.humanizer_instructions;

        if (!instructions) {
            console.error("No instructions found for bilal-ashraf");
            return;
        }

        // Replace Rule 3
        const oldRule = '3. THE "I" RULE: If text involves an opinion, feeling, prediction, or hope, ALWAYS start with "i". (e.g., "i think", "i hope", "i believe"). Avoid passive voice like "this is good".';
        const newRule = '3. THE "DATA LEAD" RULE: Start with facts and metrics. Analysis should flow from the data. Use "i" only for high-conviction personal takes. Avoid starting every sentence with "i" as it dilutes the professional/analytical tone.';

        if (!instructions.includes(oldRule)) {
            console.error("Could not find the exact old rule string to replace.");
            console.log("Current instructions snippet:", instructions.substring(0, 500));
            return;
        }

        const updatedInstructions = instructions.replace(oldRule, newRule);

        // Update DB
        await client.query("UPDATE brand_personality SET humanizer_instructions = $1, updated_at = NOW() WHERE slug = 'bilal-ashraf';", [updatedInstructions]);

        console.log("✅ Successfully updated the 'I' rule in humanizer_instructions.");
    } catch (err) {
        console.error("❌ Error updating database:", err);
    } finally {
        await client.end();
    }
}

update();
