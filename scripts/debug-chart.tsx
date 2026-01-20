
import { ImageResponse } from '@vercel/og';
import React from 'react';

// Simplified version of the API logic to test font loading and ImageResponse
async function loadGoogleFont(font: string, text: string) {
    const url = `https://fonts.googleapis.com/css2?family=${font}&text=${encodeURIComponent(text)}`;
    console.log(`Fetching CSS from: ${url}`);
    const css = await (await fetch(url)).text();
    // console.log(`CSS: ${css}`); 
    const resource = css.match(/src: url\((.+?)\)/);

    if (resource) {
        const fontUrl = resource[1];
        console.log(`Fetching font resource from: ${fontUrl}`);
        const response = await fetch(fontUrl);
        if (response.status == 200) {
            return await response.arrayBuffer();
        } else {
            throw new Error(`Failed to fetch font resource: ${response.statusText}`);
        }
    }

    throw new Error('failed to load font data from CSS');
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
