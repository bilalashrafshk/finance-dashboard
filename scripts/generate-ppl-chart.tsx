
import { ImageResponse } from '@vercel/og';
import React from 'react';
import fs from 'fs';
import path from 'path';

async function main() {
    console.log("Generatign OG Image for PPL (Refined + Top Left + Bottom Graph)...");

    // Inputs
    const symbol = 'PPL';
    const name = 'Pakistan Petroleum Limited';
    const price = '124.50';
    const eventType = 'ALL TIME HIGH';

    // Build Data
    const data: number[] = [];
    let current = 110;
    for (let i = 0; i < 50; i++) {
        const move = (Math.random() - 0.4) * 2;
        current += move;
        if (i === 49) current = 124.50;
        data.push(current);
    }

    const width = 1200;
    const height = 630;
    const padding = 60;

    // Define Chart Area (Bottom Half)
    const graphHeight = 250;
    const graphBottom = height - 40;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;

    const points = data.map((val, index) => {
        const x = padding + (index / (data.length - 1)) * (width - padding * 2);
        // Map Value to Y range [graphBottom, graphTop] (Top is smaller Y)
        const y = graphBottom - ((val - min) / range) * graphHeight;
        return `${x},${y}`;
    }).join(' ');

    const element = (
        <div
            style={{
                height: '100%',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#09090b', // zinc-950
                fontFamily: 'sans-serif',
                position: 'relative',
            }}
        >
            {/* Background Gradient (Blue) */}
            <div style={{
                display: 'flex',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '400px',
                background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.1) 0%, transparent 100%)'
            }} />

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
                    <div style={{ display: 'flex', fontSize: 90, fontWeight: 900, color: 'white', letterSpacing: '-2px' }}>${symbol}</div>
                    <div style={{
                        display: 'flex',
                        backgroundColor: '#3b82f6', // blue-500
                        color: 'white',
                        padding: '12px 24px',
                        borderRadius: '50px',
                        fontSize: 32,
                        fontWeight: 'bold'
                    }}>
                        {eventType}
                    </div>
                </div>

                {/* Full Company Name */}
                <div style={{ display: 'flex', fontSize: 36, color: '#94a3b8', marginBottom: '30px', fontWeight: 500 }}>
                    {name}
                </div>

                {/* Price */}
                <div style={{ display: 'flex', fontSize: 130, fontWeight: 'bold', color: '#22d3ee' }}>
                    Rs {price}
                </div>
            </div>

            {/* Chart SVG Container */}
            <div style={{ display: 'flex', position: 'absolute', bottom: 0, left: 0, right: 0, height: height, width: width }}>
                <svg
                    width={width}
                    height={height}
                    viewBox={`0 0 ${width} ${height}`}
                >
                    <defs>
                        <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    {/* Fill Area */}
                    <path
                        d={`M ${padding},${graphBottom} L ${points.split(' ')[0]} L ${points.replaceAll(' ', ' L ')} L ${width - padding},${graphBottom} Z`}
                        fill="url(#gradient)"
                    />
                    {/* Stroke Line */}
                    <polyline
                        fill="none"
                        stroke="#22d3ee" // cyan-400
                        strokeWidth="6"
                        points={points}
                    />
                </svg>
            </div>

            {/* Footer Logo with Icon */}
            <div style={{ display: 'flex', position: 'absolute', bottom: 40, right: 50, alignItems: 'center', gap: '12px' }}>
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
    );

    try {
        const response = new ImageResponse(element, { width, height });
        const buffer = await response.arrayBuffer();
        const outputPath = path.resolve(process.cwd(), 'ppl-chart.png');
        fs.writeFileSync(outputPath, Buffer.from(buffer));

        console.log(`✅ Success! Data generated for PPL: Rs ${price}`);
        console.log(`🖼️ Image saved to: ${outputPath}`);
    } catch (e) {
        console.error("Error generating image:", e);
    }
}

main();
