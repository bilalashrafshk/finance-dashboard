import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth/middleware';
import { getUserById } from '@/lib/auth/db-auth';

// GET: Fetch analyses for a symbol
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol');

    if (!symbol) {
        return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    const pool = getPool();
    try {
        const result = await pool.query(
            `SELECT * FROM asset_analyses WHERE symbol = $1 ORDER BY analysis_date DESC, created_at DESC`,
            [symbol]
        );
        return NextResponse.json({ analyses: result.rows });
    } catch (error) {
        console.error('Error fetching asset analyses:', error);
        return NextResponse.json({ error: 'Failed to fetch analyses' }, { status: 500 });
    }
}

// POST: Create a new analysis (Admin only)
export async function POST(req: NextRequest) {
    try {
        // Auth check
        const authUser = await getAuthenticatedUser(req);
        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await getUserById(authUser.id);
        if (!user || user.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const body = await req.json();
        const { symbol, url, title, type, thought, remarks, analysis_date } = body;

        // Basic validation
        if (!symbol || !url || !title || !type || !thought) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const pool = getPool();
        const result = await pool.query(
            `INSERT INTO asset_analyses (symbol, url, title, type, thought, remarks, analysis_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [symbol, url, title, type, thought, remarks || null, analysis_date || new Date()]
        );

        return NextResponse.json({ success: true, analysis: result.rows[0] });

    } catch (error) {
        console.error('Error creating asset analysis:', error);
        return NextResponse.json({ error: 'Failed to create analysis' }, { status: 500 });
    }
}
