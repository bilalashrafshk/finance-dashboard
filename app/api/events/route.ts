
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// Create a pool link - normally we'd export this from lib/db.ts
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export const revalidate = 60; // Revalidate every minute

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '50');

    const client = await pool.connect();
    try {
        let query = 'SELECT * FROM notable_events';
        const conditions = [];
        const params = [];

        if (date) {
            params.push(date);
            // Convert created_at to PKT (Asia/Karachi) before extracting the date for comparison
            conditions.push(`(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Karachi')::date = $${params.length}`);
        }

        if (type && type !== 'all') {
            params.push(type);
            conditions.push(`event_type = $${params.length}`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await client.query(query, params);

        // Also fetch unique event types for the filter
        const typesResult = await client.query('SELECT DISTINCT event_type FROM notable_events ORDER BY event_type');
        const eventTypes = typesResult.rows.map(row => row.event_type);

        return NextResponse.json({
            events: result.rows,
            eventTypes: eventTypes
        });
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    } finally {
        client.release();
    }
}
