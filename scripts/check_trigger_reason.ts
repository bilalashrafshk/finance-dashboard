
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load envs
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
    console.error('No DATABASE_URL or POSTGRES_URL found in env');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
});

async function checkTrigger() {
    const client = await pool.connect();
    try {
        console.log('Checking company_profiles schema...');

        const schemaRes = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'company_profiles' AND column_name = 'market_cap'
        `);

        if (schemaRes.rows.length > 0) {
            console.log(`Column 'market_cap' type: ${schemaRes.rows[0].data_type}`);
        } else {
            console.log("Column 'market_cap' not found in company_profiles");
        }

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

checkTrigger();
