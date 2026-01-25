
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

async function disableFundamentalAlerts() {
    const client = await pool.connect();
    try {
        console.log('🔌 Disabling Fundamental Alerts...');

        await client.query(`
            INSERT INTO alert_configs (key, description, value)
            VALUES ('enable_fundamental_alerts', 'Enable Fundamental Alerts (Master Switch)', 'false')
            ON CONFLICT (key) 
            DO UPDATE SET value = 'false'
        `);

        console.log('✅ Fundamental Alerts DISABLED.');

    } catch (e) {
        console.error(e);
        process.exit(1);
    } finally {
        client.release();
        pool.end();
    }
}

disableFundamentalAlerts();
