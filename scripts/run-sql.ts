import { getPool } from '../lib/db';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function runSql() {
    const sql = process.stdin.fd === 0 ? require('fs').readFileSync(0, 'utf8') : '';
    if (!sql) return;

    const pool = getPool();
    try {
        const res = await pool.query(sql);
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
runSql();
