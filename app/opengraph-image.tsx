import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = 'Conviction Pays - Risk Metric Dashboard'
export const size = {
    width: 1200,
    height: 630,
}

export const contentType = 'image/png'

export default async function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: 'black',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'sans-serif',
                    color: 'white',
                }}
            >
                <svg
                    width="256"
                    height="256"
                    viewBox="0 0 180 180"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <g clipPath="url(#clip0_7960_43945)">
                        <rect width="180" height="180" rx="37" fill="black" />
                        <g style={{ transform: 'scale(0.95)', transformOrigin: 'center' }}>
                            <path
                                fill="white"
                                d="M101.141 53H136.632C151.023 53 162.689 64.6662 162.689 79.0573V112.904H148.112V79.0573C148.112 78.7105 148.098 78.3662 148.072 78.0251L112.581 112.898C112.701 112.902 112.821 112.904 112.941 112.904H148.112V126.672H112.941C98.5504 126.672 86.5638 114.891 86.5638 100.5V66.7434H101.141V100.5C101.141 101.15 101.191 101.792 101.289 102.422L137.56 66.7816C137.255 66.7563 136.945 66.7434 136.632 66.7434H101.141V53Z"
                            />
                            <path
                                fill="white"
                                d="M65.2926 124.136L14 66.7372H34.6355L64.7495 100.436V66.7372H80.1365V118.47C80.1365 126.278 70.4953 129.958 65.2926 124.136Z"
                            />
                        </g>
                    </g>
                    <defs>
                        <clipPath id="clip0_7960_43945">
                            <rect width="180" height="180" fill="white" />
                        </clipPath>
                    </defs>
                </svg>
                <div style={{ marginTop: 40, fontSize: 60, fontWeight: 'bold' }}>
                    Conviction Pays
                </div>
                <div style={{ marginTop: 10, fontSize: 30, opacity: 0.8 }}>
                    Risk Analytics & Portfolio Management
                </div>
            </div>
        ),
        {
            ...size,
        }
    )
}
