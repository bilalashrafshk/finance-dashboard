
import { getPool } from '../lib/db';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    const pool = getPool();
    const docId = '268852';

    console.log(`Searching for document ID: ${docId}`);

    const queries = [
        {
            name: 'notable_events',
            sql: "SELECT symbol, metadata FROM notable_events WHERE metadata->>'attachments' LIKE $1 OR metadata->>'psx_title' LIKE $2 LIMIT 5"
        },
        {
            name: 'event_queue',
            sql: "SELECT symbol, metadata FROM event_queue WHERE metadata->>'attachments' LIKE $1 OR metadata->>'psx_title' LIKE $2 LIMIT 5"
        }
    ];

    for (const q of queries) {
        try {
            const res = await pool.query(q.sql, [`%${docId}%`, `%${docId}%`]);
            if (res.rows.length > 0) {
                console.log(`\nFound in ${q.name}:`);
                res.rows.forEach((row: any) => {
                    console.log(`Symbol: ${row.symbol}`);
                    console.log(`Title: ${row.metadata?.psx_title}`);
                    console.log(`Attachments: ${JSON.stringify(row.metadata?.attachments)}`);
                });
            } else {
                console.log(`\nNo results in ${q.name}`);
            }
        } catch (err: any) {
            console.error(`Error querying ${q.name}:`, err.message);
        }
    }

    await pool.end();
}

main().catch(err => console.error(err));
