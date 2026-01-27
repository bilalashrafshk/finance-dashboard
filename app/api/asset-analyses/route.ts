import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth/middleware';
import { getUserById } from '@/lib/auth/db-auth';

// GET: Fetch analyses for a symbol
// GET: Fetch analyses (by symbol or all)
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol');
    // Pagination params
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const pool = getPool();
    try {
        let query = `SELECT * FROM asset_analyses`;
        const params: any[] = [];
        const conditions: string[] = [];

        if (symbol) {
            conditions.push(`symbol = $${params.length + 1}`);
            params.push(symbol);
        }

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        query += ` ORDER BY analysis_date DESC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Get total count for pagination
        let countQuery = `SELECT COUNT(*) FROM asset_analyses`;
        if (conditions.length > 0) {
            countQuery += ` WHERE ${conditions.join(' AND ')}`;
        }
        // Reuse params for conditions, slice off limit/offset
        const countResult = await pool.query(countQuery, params.slice(0, conditions.length));

        return NextResponse.json({
            analyses: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].count),
                limit,
                offset
            }
        });
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
        const { symbol, url, title, type, thought, remarks, analysis_date, analyst } = body;

        // Basic validation
        if (!symbol || !url || !title || !type || !thought) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const pool = getPool();
        const result = await pool.query(
            `INSERT INTO asset_analyses (symbol, url, title, type, thought, remarks, analysis_date, analyst)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [symbol, url, title, type, thought, remarks || null, analysis_date || new Date(), analyst || 'Bilal Ashraf']
        );

        return NextResponse.json({ success: true, analysis: result.rows[0] });

    } catch (error) {
        console.error('Error creating asset analysis:', error);
        return NextResponse.json({ error: 'Failed to create analysis' }, { status: 500 });
    }
}
