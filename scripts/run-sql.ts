import { getPool } from '../lib/db';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function runSql() {
    let sql = process.argv[2];
    if (!sql && process.stdin.fd === 0) {
        try {
            sql = require('fs').readFileSync(0, 'utf8');
        } catch (e) {
            // No stdin
        }
    }

    if (!sql) {
        console.error('Usage: npx tsx scripts/run-sql.ts "SQL QUERY" or pipe SQL into stdin');
        return;
    }

    const pool = getPool();
    try {
        const res = await pool.query(sql);
        if (res.rows.length > 0) {
            console.table(res.rows);
        } else {
            console.log('Query successful, no rows returned.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
runSql();
