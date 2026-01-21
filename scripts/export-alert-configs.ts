
import { getPool } from '../lib/db';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runExport() {
    const pool = getPool();
    const res = await pool.query('SELECT * FROM alert_configs');
    console.log(JSON.stringify(res.rows, null, 2));
}

runExport().catch(console.error);
