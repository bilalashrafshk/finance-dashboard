import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';

// Lazy load pool
let pool: Pool | null = null;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
            ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
            max: 1, // Keep connections low
            connectionTimeoutMillis: 5000, // Fail fast
            idleTimeoutMillis: 5000,
        });
    }
    return pool;
}

// Mock data generator
function generateMockData() {
    const points = [];
    let price = 100;
    for (let i = 0; i < 50; i++) {
        price = price * (1 + (Math.random() * 0.04 - 0.015));
        points.push(price);
    }
    return points;
}

// Font loader (CDN)
async function loadGoogleFont() {
    try {
        const url = 'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-700-normal.woff';
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) }); // 5s timeout
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        return await response.arrayBuffer();
    } catch (e) {
        console.error('Font Load Failed:', e);
        return null; // Handle null gracefully
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const symbol = searchParams.get('symbol') || 'LUCK';
        let price = searchParams.get('price') || '850.5';
        const name = searchParams.get('name') || '';
        const title = (searchParams.get('title') || 'CHART ALERT').toUpperCase();

        // 1. Load Font
        const fontData = await loadGoogleFont();
        if (!fontData) {
            throw new Error("Critical: Could not load font from CDN.");
        }

        // 2. Fetch Data
        let data: number[] = [];
        try {
            const client = await getPool().connect();
            const res = await client.query({
                text: `
                SELECT close as price
                FROM historical_price_data 
                WHERE symbol = $1 
                ORDER BY date DESC
                LIMIT 90
            `,
                values: [symbol],
                // @ts-ignore - pg types might not have query timeout definition explicitly in all versions
                query_timeout: 5000
            });
            client.release();

            if (res.rows.length > 10) {
                data = res.rows.map(r => parseFloat(r.price)).reverse();
            }
        } catch (dbError: any) {
            console.error('DB Fetch Error:', dbError.message);
        }

        // 3. Fallback Mock Data
        if (data.length === 0) {
            console.log('Using Mock Data');
            data = generateMockData();
        }

        // 4. SVG Logic
        const width = 1200;
        const height = 630;
        const padding = 60;
        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min || 1;

        const points = data.map((val, index) => {
            const x = padding + (index / (data.length - 1)) * (width - padding * 2);
            const y = height - padding - ((val - min) / range) * (height - padding * 2);
            return `${x},${y}`;
        }).join(' ');

        return new ImageResponse(
            (
                <div
                    style={{
                        height: '100%',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#09090b',
                        fontFamily: '"Inter"',
                        position: 'relative',
                    }}
                >
                    {/* Background Gradient */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '400px', background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.1) 0%, transparent 100%)' }} />

                    {/* Content */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        position: 'absolute',
                        top: 60,
                        left: 60,
                        zIndex: 10
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '30px', marginBottom: '10px' }}>
                            <div style={{ fontSize: 90, fontWeight: 900, color: 'white', letterSpacing: '-2px', display: 'flex' }}>
                                {`$${symbol}`}
                            </div>
                            <div style={{
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                padding: '12px 24px',
                                borderRadius: '50px',
                                fontSize: 32,
                                fontWeight: 'bold',
                                textTransform: 'uppercase',
                                display: 'flex'
                            }}>
                                {title}
                            </div>
                        </div>

                        {name && (
                            <div style={{ fontSize: 36, color: '#94a3b8', marginBottom: '30px', fontWeight: 500, display: 'flex' }}>
                                {name}
                            </div>
                        )}

                        <div style={{ fontSize: 130, fontWeight: 'bold', color: '#22d3ee', display: 'flex' }}>
                            {`Rs ${price}`}
                        </div>
                    </div>

                    {/* Chart */}
                    <svg
                        width={width}
                        height={height}
                        viewBox={`0 0 ${width} ${height}`}
                        style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
                    >
                        <defs>
                            <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
                                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <path
                            d={`M ${padding},${height} L ${points.split(' ')[0]} L ${points.replaceAll(' ', ' L ')} L ${width - padding},${height} Z`}
                            fill="url(#gradient)"
                        />
                        <polyline
                            fill="none"
                            stroke="#22d3ee"
                            strokeWidth="6"
                            points={points}
                        />
                    </svg>

                    {/* Footer Logo */}
                    <div style={{ position: 'absolute', bottom: 40, right: 50, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 40,
                            height: 40,
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
                            boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)'
                        }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                                <polyline points="17 6 23 6 23 12" />
                            </svg>
                        </div>
                        <div style={{ fontSize: 32, fontWeight: 'bold', color: 'white', display: 'flex' }}>
                            <span>Conviction</span><span style={{ color: '#22d3ee' }}>Pays</span>
                        </div>
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
                fonts: [{
                    name: 'Inter',
                    data: fontData,
                    style: 'normal',
                    weight: 700,
                }],
            },
        );
    } catch (e: any) {
        console.error('API Error:', e);
        // Return JSON so the user can see the error in browser
        return NextResponse.json(
            { error: e.message, stack: e.stack },
            { status: 500 }
        );
    }
}
