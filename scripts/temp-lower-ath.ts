
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function main() {
    try {
        console.log('Temporarily lowering ATH for OGDC to 300...');
        await pool.query(`
            UPDATE company_profiles 
            SET all_time_high = 300 
            WHERE symbol = 'OGDC' AND asset_type = 'pk-equity'
        `);
        console.log('Done.');
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
main();
