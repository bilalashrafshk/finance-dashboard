
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

async function finalizeKeywords() {
    const client = await pool.connect();
    try {
        console.log('🔄 Finalizing Keywords in DB...');

        // --- PRIORITY KEYWORDS ---
        // Goal: Remove "Board Meeting", Add "Discovery", "Production"
        const currentPriority = [
            'Financial Results',
            // 'Board Meeting', // REMOVED
            'Material Information',
            'Discovery', // ADDED
            'Production', // ADDED
            'Dividend',
            'Bonus',
            'Right Shares',
            'Appointment of CEO',
            'Appointment of Chief Executive',
            'Appointment of Chairman',
            'Appointment of CFO',
            'Appointment of Chief Financial Officer',
            'Change of CEO',
            'Change of Chief Executive',
            'Change of CFO',
            'Change of Chief Financial Officer'
        ];

        console.log('Setting Priority Keywords:', currentPriority);
        await client.query(`
            UPDATE alert_configs 
            SET value = $1 
            WHERE key = 'priority_keywords'
        `, [JSON.stringify(currentPriority)]);


        // --- IGNORE KEYWORDS ---
        // Goal: Add generic "Registrar"
        const ignoreRes = await client.query("SELECT value FROM alert_configs WHERE key = 'ignore_keywords'");
        let currentIgnore = Array.isArray(ignoreRes.rows[0].value) ? ignoreRes.rows[0].value : JSON.parse(ignoreRes.rows[0].value || '[]');

        if (!currentIgnore.includes('Registrar')) {
            currentIgnore.push('Registrar');
            console.log('Added "Registrar" to Ignore list.');
        }

        await client.query(`
            UPDATE alert_configs 
            SET value = $1 
            WHERE key = 'ignore_keywords'
        `, [JSON.stringify(currentIgnore)]);

        console.log('✅ DB Updated.');

    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        pool.end();
    }
}

finalizeKeywords();
