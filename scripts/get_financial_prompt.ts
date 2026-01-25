
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function getPrompt() {
    const client = await pool.connect();
    try {
        const res = await client.query("SELECT content FROM ai_prompts WHERE slug = 'financial-analyst'");
        if (res.rows.length > 0) {
            console.log(res.rows[0].content);
        } else {
            console.log('Prompt not found');
        }
    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

getPrompt();
