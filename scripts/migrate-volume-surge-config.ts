import { getPool } from '../lib/db';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

async function migrate() {
    const pool = getPool();
    console.log('🚀 Running migration: Add Volume Surge Settings...');

    try {
        await pool.query(`
            INSERT INTO alert_configs (key, value, description) 
            VALUES (
                'volume_surge_settings', 
                '{"multiplier": 2.0, "period": 10, "min_volume": 1000}', 
                'Technical Alert: Threshold for Volume Surge detection (multiplier x average, over N periods, with min daily volume)'
            )
            ON CONFLICT (key) DO NOTHING;
        `);
        console.log('✅ Migration complete.');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        await pool.end();
    }
}

migrate();
