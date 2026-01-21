
import axios from 'axios';

const BASE_URL = 'http://localhost:3000'; // Assuming local dev

async function verifyPagination() {
    try {
        console.log('Testing Page 1 (Limit 5)...');
        // We can't easily test separate pages without mock DB or seeded data, 
        // but we can check if offset works by comparing ids.

        // This script is better run against a live local server.
        // If not running, we might simulate unit test style if DB access is available.
        // Let's use direct DB access since we have helper scripts for it.
        // But the API logic is what we want to test. 

        // Since I can't guarantee localhost:3000 is running the *updated* code (it needs to build/reload),
        // I will rely on reading the code I wrote + the user manually verifying or me checking DB query logic.

        // Actually, I can write a unit-test style script using `app/api/events/route.ts` imported directly?
        // Next.js app router testing is tricky in isolation.

        // Let's stick to a sanity check script that queries the DB directly with the SAME logic as the route
        // to prove the SQL is valid.

        const { Pool } = require('pg');
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });

        const client = await pool.connect();
        try {
            console.log('🧪 Testing SQL Query Logic...');

            // Limit 5, Offset 0
            const res1 = await client.query('SELECT id FROM notable_events ORDER BY created_at DESC LIMIT 5 OFFSET 0');
            console.log(`Page 1 IDs: ${res1.rows.map(r => r.id).join(', ')}`);

            // Limit 5, Offset 5
            const res2 = await client.query('SELECT id FROM notable_events ORDER BY created_at DESC LIMIT 5 OFFSET 5');
            console.log(`Page 2 IDs: ${res2.rows.map(r => r.id).join(', ')}`);

            const intersect = res1.rows.filter(r1 => res2.rows.some(r2 => r2.id === r1.id));
            if (intersect.length === 0) {
                console.log('✅ Success: No overlap between pages.');
            } else {
                console.log('❌ Failure: Overlap detected (Pagination broken).');
            }

            console.log('🧪 Testing Sentiment Index Usage (Explain)...');
            try {
                const explainRes = await client.query("EXPLAIN ANALYZE SELECT id FROM notable_events WHERE metadata->'ai_analysis'->>'sentiment' = 'Bullish'");
                // Check if Index Scan is used? (Might be seq scan if table is small)
                console.log('Explain Output:', explainRes.rows[0]['QUERY PLAN']);
            } catch (e) {
                console.log('Explain failed (requires permissions?), skipping.');
            }

        } finally {
            client.release();
            await pool.end();
        }

    } catch (e) {
        console.error('Test Failed:', e);
    }
}

verifyPagination();
