
import { ImageResponse } from '@vercel/og';
import React from 'react';

// Font loader (CDN)
async function loadGoogleFont(font: string, text: string) {
    // Inter-Bold (700) from reliable CDN
    const url = 'https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-700-normal.woff';
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to load font');
    return await response.arrayBuffer();
}

// Simplified version of the API logic to test font loading and ImageResponse
async function test() {
    console.log("Starting debug test...");
    try {
        // Use the helper instead of direct URL
        const fontData = await loadGoogleFont('Inter', 'Test Image $850.50LUCK');
        console.log(`Font fetched. Size: ${fontData.byteLength} bytes`);

        const element = (
            <div style={{
                display: 'flex',
                fontSize: 60,
                color: 'black',
                background: 'white',
                width: '100%',
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: '"Inter"'
            }
            }>
                Test Image
            </div>
        );

        console.log("Generating ImageResponse...");
        const imageResponse = new ImageResponse(element, {
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
        });

        const arrayBuffer = await imageResponse.arrayBuffer();
        console.log(`Image generated successfully. Size: ${arrayBuffer.byteLength} bytes`);

    } catch (e: any) {
        console.error("CRITICAL ERROR:", e);
    }
}

test();
