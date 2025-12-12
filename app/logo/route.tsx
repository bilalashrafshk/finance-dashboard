import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
    return new ImageResponse(
        (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#020617', // Dark slate background matching navbar
                    width: '100%',
                    height: '100%',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    {/* Icon Box */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, #2563eb, #06b6d4)', // blue-600 to cyan-500
                            padding: '16px',
                            borderRadius: '16px',
                            width: '80px',
                            height: '80px',
                            boxShadow: '0 0 30px -5px rgba(59, 130, 246, 0.5)',
                        }}
                    >
                        <svg
                            width="48"
                            height="48"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                            <polyline points="17 6 23 6 23 12" />
                        </svg>
                    </div>

                    {/* Text */}
                    <div
                        style={{
                            display: 'flex',
                            fontSize: '48px',
                            fontWeight: 800,
                            letterSpacing: '-0.02em',
                            fontFamily: 'sans-serif',
                            gap: '10px',
                        }}
                    >
                        <span style={{ color: 'white' }}>CONVICTION</span>
                        <span style={{ color: '#22d3ee' }}>PAYS</span> {/* Cyan-400 */}
                    </div>
                </div>
            </div>
        ),
        {
            width: 800,
            height: 300,
        }
    )
}
