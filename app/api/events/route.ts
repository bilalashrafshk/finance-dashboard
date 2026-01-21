
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// Create a pool link - normally we'd export this from lib/db.ts
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export const revalidate = 300; // Revalidate every 5 minutes (was 60s)

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const symbol = searchParams.get('symbol');
    const sentiment = searchParams.get('sentiment');
    const type = searchParams.get('type');
    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '20'); // Lower default to 20
    const offset = parseInt(searchParams.get('offset') || '0');

    const client = await pool.connect();
    try {
        // Select only necessary columns for the list view
        // We fetch full details (description etc) in a separate call or just rely on metadata if it's small enough.
        // Actually, the frontend uses describing/metadata for the card. 
        // We keep 'metadata' but we might exclude 'description' if it's huge? 
        // For now, let's just avoid "SELECT *" and select explicitly.
        let query = 'SELECT id, symbol, event_type, headline, metadata, created_at FROM notable_events';
        const conditions = [];
        const params = [];

        if (date) {
            params.push(date);
            conditions.push(`(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Karachi')::date = $${params.length}`);
        }

        if (symbol) {
            params.push(symbol.toUpperCase());
            conditions.push(`symbol = $${params.length}`);
        }

        if (sentiment && sentiment !== 'all') {
            params.push(sentiment);
            // Sentiment is stored in metadata -> ai_analysis -> sentiment for fundamental alerts
            // We now have an index on this path!
            conditions.push(`metadata->'ai_analysis'->>'sentiment' = $${params.length}`);
        }

        if (type && type !== 'all') {
            params.push(type);
            conditions.push(`event_type = $${params.length}`);
        }

        if (category === 'fundamental') {
            conditions.push(`event_type = 'fundamental_alert'`);
        } else if (category === 'technical') {
            conditions.push(`event_type != 'fundamental_alert'`);
        }
        // 'all' category doesn't add an event_type condition

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit);
        params.push(offset);

        // Parallelize queries
        const [result, typesResult] = await Promise.all([
            client.query(query, params),
            client.query('SELECT DISTINCT event_type FROM notable_events ORDER BY event_type')
        ]);

        const eventTypes = typesResult.rows.map(row => row.event_type);

        return NextResponse.json({
            events: result.rows,
            eventTypes: eventTypes,
            meta: {
                count: result.rows.length,
                offset,
                limit
            }
        });
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    } finally {
        client.release();
    }
}
