
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

async function resetAndEnable() {
    const client = await pool.connect();
    try {
        console.log('🧹 Clearing Pending Fundamental Alerts (Cutoff)...');

        // 1. Mark all currently PENDING fundamental alerts as SKIPPED
        const result = await client.query(`
            UPDATE event_queue 
            SET status = 'SKIPPED', 
                processed_at = NOW(),
                metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{skipped_reason}', '"Manual Cutoff on Enable"')
            WHERE event_type = 'fundamental_alert' 
            AND status = 'PENDING'
        `);

        console.log(`✅ Skipped ${result.rowCount} pending alerts.`);

        // 2. Enable Fundamental Alerts in Config
        console.log('🔌 Enabling Fundamental Alerts...');
        await client.query(`
            INSERT INTO alert_configs (key, description, value)
            VALUES ('enable_fundamental_alerts', 'Enable Fundamental Alerts (Master Switch)', 'true')
            ON CONFLICT (key) 
            DO UPDATE SET value = 'true'
        `);

        console.log('✅ Fundamental Alerts ENABLED. System is clean and ready for NEW events.');

    } catch (e) {
        console.error(e);
        process.exit(1);
    } finally {
        client.release();
        pool.end();
    }
}

resetAndEnable();
