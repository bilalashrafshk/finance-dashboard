
import { getPool } from '../lib/db';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function runMigration() {
    const pool = getPool();

    const settings = [
        {
            key: 'enable_multimodal_analysis',
            value: false,
            description: 'Disable PDF/Image analysis for non-priority fundamental alerts to save costs (90% cheaper).'
        },
        {
            key: 'ai_triage_mid_small_caps',
            value: false,
            description: 'Enable AI-powered semantic triage for mid/small-cap companies. If disabled, alerts only trigger on exact keyword matches for non-top-ranked stocks.'
        },
        {
            key: 'fundamental_alert_model',
            value: 'gemini-2.5-flash-lite',
            description: 'AI Model used for fundamental alert triage and analysis. Default: gemini-2.5-flash-lite (Multimodal & Low Cost).'
        }
    ];

    for (const setting of settings) {
        await pool.query(
            `INSERT INTO alert_configs (key, value, description) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (key) DO NOTHING`,
            [setting.key, JSON.stringify(setting.value), setting.description]
        );
    }

    console.log('Database migration for cost settings completed.');
}

runMigration().catch(console.error);
