
import { getPool } from '../lib/db';
import * as dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

async function main() {
    const pool = getPool();
    try {
        const res = await pool.query("SELECT DISTINCT sector FROM company_profiles ORDER BY sector");
        console.log("--- SECTORS IN DB ---");
        res.rows.forEach(r => console.log(r.sector));
    } catch (e) {
        console.error(e);
    }
}

main();
