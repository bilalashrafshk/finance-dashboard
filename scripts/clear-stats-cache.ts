
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('🧹 Clearing ATH and 52W High cache from company_profiles...');

        // Resetting to NULL forces update_high_low_stats.ts to do a full historical scan
        const res = await client.query(`
            UPDATE company_profiles 
            SET all_time_high = NULL, 
                fifty_two_week_high = NULL
        `);

        console.log(`✅ Cleared stats for ${res.rowCount} profiles.`);
        console.log('Now run "npx tsx scripts/update_high_low_stats.ts" to recalculate correctly.');

    } catch (err) {
        console.error('❌ Error clearing stats:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
