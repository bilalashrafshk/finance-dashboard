
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function check() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        const res = await client.query("SELECT humanizer_instructions FROM brand_personality WHERE slug = 'bilal-ashraf';");
        console.log('--- CURRENT HUMANIZER INSTRUCTIONS ---');
        console.log(res.rows[0]?.humanizer_instructions);
    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

check();
