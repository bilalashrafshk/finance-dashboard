import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';


// Lazy load pool to prevent top-level init errors if env vars are missing
let pool: Pool | null = null;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
            ssl: (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
            max: 1 // Keep connections low for serverless
        });
    }
    return pool;
}

// Mock data generator for fallback
function generateMockData() {
    const points = [];
    let price = 100;
    for (let i = 0; i < 50; i++) {
        price = price * (1 + (Math.random() * 0.04 - 0.015)); // Upward trend
        points.push(price);
    }
    return points;
}

// Font loader
async function loadGoogleFont(font: string, text: string) {
    const url = `https://fonts.googleapis.com/css2?family=${font}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url)).text();
    const resource = css.match(/src: url\((.+?)\)/);

    if (resource) {
        const response = await fetch(resource[1]);
        if (response.status == 200) {
            return await response.arrayBuffer();
        }
    }

    throw new Error('failed to load font data');
}

export async function GET(req: NextRequest) {
    let dbErrorMsg = '';
    try {
        const { searchParams } = new URL(req.url);
        const symbol = searchParams.get('symbol') || 'LUCK';
        const price = searchParams.get('price') || '850.5';
        const name = searchParams.get('name') || '';
        const title = (searchParams.get('title') || 'CHART ALERT').toUpperCase();

        // Load Font (Inter 700 - Bold) using dynamic loader
        // This is robust against 404s on static files because it queries the API for a valid URL.
        const fontData = await loadGoogleFont('Inter', symbol + title + name + price + '$');

        // Fetch Real Data
        let data: number[] = [];
        try {
            const client = await getPool().connect();
            const res = await client.query(`
                SELECT close as price
                FROM historical_price_data 
                WHERE symbol = $1 
                ORDER BY date DESC
                LIMIT 90
            `, [symbol]);
            client.release();

            if (res.rows.length > 10) {
                // DB returns DESC (latest first), but chart needs ASC (oldest first)
                data = res.rows.map(r => parseFloat(r.price)).reverse();
            }
        } catch (dbError: any) {
            console.error('DB Fetch Error for Chart:', dbError);
            dbErrorMsg = dbError.message;
        }

        // Fallback to mock if no data found
        if (data.length === 0) {
            console.log('Using Mock Data for Chart');
            data = generateMockData();
        }

        // SVG Logic
        const width = 1200;
        const height = 630;
        const padding = 60;

        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min;

        // Create Polyline Points
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
                        backgroundColor: '#09090b', // zinc-950
                        fontFamily: '"Inter"',
                        position: 'relative',
                    }}
                >
                    {/* Background Gradient (Blue) */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '400px', background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.1) 0%, transparent 100%)' }} />

                    {/* Main Content Container (Top Left) */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        position: 'absolute',
                        top: 60,
                        left: 60,
                        zIndex: 10
                    }}>
                        {/* Symbol & Badge Row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '30px', marginBottom: '10px' }}>
                            <div style={{ fontSize: 90, fontWeight: 900, color: 'white', letterSpacing: '-2px' }}>${symbol}</div>
                            <div style={{
                                backgroundColor: '#3b82f6', // blue-500
                                color: 'white',
                                padding: '12px 24px',
                                borderRadius: '50px',
                                fontSize: 32,
                                fontWeight: 'bold',
                                textTransform: 'uppercase'
                            }}>
                                {title}
                            </div>
                        </div>

                        {/* Full Company Name */}
                        {name && (
                            <div style={{ fontSize: 36, color: '#94a3b8', marginBottom: '30px', fontWeight: 500 }}>
                                {name}
                            </div>
                        )}

                        {/* Price */}
                        <div style={{ fontSize: 130, fontWeight: 'bold', color: '#22d3ee' }}>
                            Rs {price}
                        </div>
                    </div>

                    {/* Chart SVG */}
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
                            stroke="#22d3ee" // cyan-400
                            strokeWidth="6"
                            points={points}
                        />
                    </svg>

                    {/* Footer Logo with Icon */}
                    <div style={{ position: 'absolute', bottom: 40, right: 50, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Icon Container mimicking the logo.tsx gradient */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 40,
                            height: 40,
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #2563eb, #06b6d4)', // blue-600 to cyan-500
                            boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)'
                        }}>
                            {/* TrendingUp Icon SVG */}
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                                <polyline points="17 6 23 6 23 12" />
                            </svg>
                        </div>

                        <div style={{ fontSize: 32, fontWeight: 'bold', color: 'white', display: 'flex' }}>
                            Conviction<span style={{ color: '#22d3ee' }}>Pays</span>
                        </div>
                    </div>
                </div>
            ),
            {
                width: 1200,
                height: 630,
                fonts: [
                    {
                        name: 'Inter',
                        data: fontData,
                        style: 'normal',
                        weight: 700,
                    },
                ],
            },
        );
    } catch (e: any) {
        console.log(`${e.message}`);
        // Return detailed error for debugging
        return new Response(`Error: ${e.message}`, {
            status: 500,
        });
    }
}
