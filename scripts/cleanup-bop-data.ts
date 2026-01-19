import { getPool } from '../lib/db';
require('dotenv').config({ path: '.env.local' });

async function cleanup() {
    const pool = getPool();
    console.log('🧹 Truncating Balance of Payments tables...');
    try {
        await pool.query('TRUNCATE TABLE balance_of_payments, bop_metadata RESTART IDENTITY');
        console.log('✅ Tables truncated successfully.');
    } catch (err: any) {
        console.error('❌ Cleanup failed:', err.message);
    } finally {
        await pool.end();
    }
}

cleanup();
