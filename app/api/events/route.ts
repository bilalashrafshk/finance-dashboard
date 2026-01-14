
import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Create a pool link - normally we'd export this from lib/db.ts
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export const revalidate = 60; // Revalidate every minute

export async function GET() {
    const client = await pool.connect();
    try {
        // Fetch latest 20 events
        const result = await client.query(`
      SELECT * FROM notable_events 
      ORDER BY created_at DESC 
      LIMIT 20
    `);

        return NextResponse.json({ events: result.rows });
    } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    } finally {
        client.release();
    }
}
