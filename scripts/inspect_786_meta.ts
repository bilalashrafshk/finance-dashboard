
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function inspect786Meta() {
    const client = await pool.connect();
    try {
        console.log('🔍 Inspecting 786 Metadata in notable_events...');
        const res = await client.query(`
            SELECT id, headline, metadata, created_at
            FROM notable_events 
            WHERE symbol LIKE '%786%'
            ORDER BY created_at DESC
            LIMIT 2
        `);

        res.rows.forEach(r => {
            console.log(`\nID: ${r.id}`);
            console.log(`Headline: "${r.headline}"`);
            console.log(`Created: ${r.created_at}`);
            console.log('Metadata Keys:', Object.keys(r.metadata));
            // Check for title variations
            console.log('Meta.psx_title:', r.metadata.psx_title);
            console.log('Meta.title:', r.metadata.title);
        });

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

inspect786Meta();
