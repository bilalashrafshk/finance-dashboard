import { useState, useCallback, useEffect } from 'react'

const VIDEO_MODE_VARIABLES = {
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
    '--muted': '#e5e5e5',
    '--muted-foreground': '#000000',
    '--accent': '#ffffff',
    '--accent-foreground': '#000000',
    '--destructive': '#ff0000',
    '--destructive-foreground': '#ffffff',
    '--border': '#000000',
    '--input': '#000000',
    '--ring': '#000000',
    '--radius': '0px',
    '--chart-1': '#000000',
    '--chart-2': '#0000FF',
    '--chart-3': '#FF0000',
    '--chart-4': '#008000',
    '--chart-5': '#FFA500',
}

export function useVideoMode() {
    const [isVideoMode, setIsVideoMode] = useState(false)

    const toggleVideoMode = useCallback(() => {
        setIsVideoMode((prev) => !prev)
    }, [])

    // Global override effect
    useEffect(() => {
        if (isVideoMode) {
            // Apply overrides to :root (html)
            Object.entries(VIDEO_MODE_VARIABLES).forEach(([key, value]) => {
                document.documentElement.style.setProperty(key, value)
            })
            // Force clear shadows
            document.documentElement.style.setProperty('--ring-shadow', 'none')
            document.documentElement.style.setProperty('--ring-offset-shadow', 'none')
            document.documentElement.style.setProperty('box-shadow', 'none')
        } else {
            // Cleanup: Remove inline styles to fall back to stylesheets
            Object.keys(VIDEO_MODE_VARIABLES).forEach((key) => {
                document.documentElement.style.removeProperty(key)
            })
            document.documentElement.style.removeProperty('--ring-shadow')
            document.documentElement.style.removeProperty('--ring-offset-shadow')
            document.documentElement.style.removeProperty('box-shadow')
        }

        return () => {
            // Cleanup on unmount
            Object.keys(VIDEO_MODE_VARIABLES).forEach((key) => {
                document.documentElement.style.removeProperty(key)
            })
            document.documentElement.style.removeProperty('--ring-shadow')
            document.documentElement.style.removeProperty('--ring-offset-shadow')
            document.documentElement.style.removeProperty('box-shadow')
        }
    }, [isVideoMode])

    // Bright green color for chroma keying
    const containerClassName = isVideoMode ? "bg-[#00b140] border-[#00b140]" : ""

    // CSS variable overrides as inline style (redundant but safe for specific container)
    const videoModeStyle = isVideoMode ? {
        ...VIDEO_MODE_VARIABLES
    } as React.CSSProperties : undefined

    const videoModeColors = {
        text: isVideoMode ? '#000000' : undefined,
        grid: isVideoMode ? '#e5e5e5' : undefined,
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
