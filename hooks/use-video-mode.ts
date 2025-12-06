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
        '--popover': '#00b140',
        '--popover-foreground': '#000000',
        '--primary': '#000000',
        '--primary-foreground': '#ffffff',
        '--secondary': '#ffffff',
        '--secondary-foreground': '#000000',
        '--muted': '#e5e5e5', // Hex equivalent roughly
        '--muted-foreground': '#000000',
        '--accent': '#ffffff',
        '--accent-foreground': '#000000',
        '--destructive': '#ff0000',
        '--destructive-foreground': '#ffffff',
        '--border': '#000000',
        '--input': '#000000',
        '--ring': '#000000',
        '--radius': '0px',
        // Charts
        '--chart-1': '#000000',
        '--chart-2': '#0000FF',
        '--chart-3': '#FF0000',
        '--chart-4': '#008000',
        '--chart-5': '#FFA500',
    } as React.CSSProperties : undefined

    const videoModeColors = {
        text: isVideoMode ? '#000000' : undefined,
        grid: isVideoMode ? '#e5e5e5' : undefined, // Use Hex
        stroke: isVideoMode ? '#000000' : undefined,
        background: isVideoMode ? '#00b140' : undefined,
        // High contrast graph colors
        chart1: isVideoMode ? '#000000' : undefined,
        chart2: isVideoMode ? '#0000FF' : undefined,
        chart3: isVideoMode ? '#FF0000' : undefined,
        chart4: isVideoMode ? '#008000' : undefined,
        chart5: isVideoMode ? '#FFA500' : undefined,
    }

    return {
        isVideoMode,
        toggleVideoMode,
        containerClassName,
        videoModeColors,
        videoModeStyle
    }
}
