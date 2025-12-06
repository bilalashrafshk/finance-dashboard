import { useState, useCallback } from 'react'

export function useVideoMode() {
    const [isVideoMode, setIsVideoMode] = useState(false)

    const toggleVideoMode = useCallback(() => {
        setIsVideoMode((prev) => !prev)
    }, [])

    // Bright green color for chroma keying
    const containerClassName = isVideoMode ? "bg-[#00b140] border-[#00b140]" : ""

    const videoModeColors = {
        text: isVideoMode ? '#000000' : undefined,
        grid: isVideoMode ? 'rgba(0,0,0,0.2)' : undefined,
        stroke: isVideoMode ? '#000000' : undefined,
        background: isVideoMode ? '#00b140' : undefined,
    }

    return {
        isVideoMode,
        toggleVideoMode,
        containerClassName,
        videoModeColors
    }
}
