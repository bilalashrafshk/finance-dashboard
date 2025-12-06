import { useState, useCallback } from 'react'

export function useVideoMode() {
    const [isVideoMode, setIsVideoMode] = useState(false)

    const toggleVideoMode = useCallback(() => {
        setIsVideoMode((prev) => !prev)
    }, [])

    // Bright green color for chroma keying
    const containerClassName = isVideoMode ? "bg-[#00b140] border-[#00b140]" : ""

    // CSS variable overrides to force Hex colors (avoiding oklch/lab errors in html2canvas)
    const videoModeStyle = isVideoMode ? {
        '--background': '#00b140',
        '--foreground': '#000000',
        '--card': '#00b140',
        '--card-foreground': '#000000',
        '--primary': '#000000',
        '--primary-foreground': '#ffffff',
        '--secondary': '#ffffff',
        '--secondary-foreground': '#000000',
        '--muted': 'rgba(255,255,255,0.2)',
        '--muted-foreground': '#000000',
        '--accent': '#ffffff',
        '--accent-foreground': '#000000',
        '--border': '#000000',
        '--input': '#000000',
        '--ring': '#000000',
    } as React.CSSProperties : undefined

    const videoModeColors = {
        text: isVideoMode ? '#000000' : undefined,
        grid: isVideoMode ? 'rgba(0,0,0,0.2)' : undefined,
        stroke: isVideoMode ? '#000000' : undefined,
        background: isVideoMode ? '#00b140' : undefined,
        // High contrast graph colors
        chart1: isVideoMode ? '#000000' : undefined, // Primary line (Black)
        chart2: isVideoMode ? '#0000FF' : undefined, // Secondary line (Blue)
        chart3: isVideoMode ? '#FF0000' : undefined, // Tertiary line (Red)
        chart4: isVideoMode ? '#FFFFFF' : undefined, // White
        chart5: isVideoMode ? '#FFFF00' : undefined, // Yellow
    }

    return {
        isVideoMode,
        toggleVideoMode,
        containerClassName,
        videoModeColors,
        videoModeStyle
    }
}
