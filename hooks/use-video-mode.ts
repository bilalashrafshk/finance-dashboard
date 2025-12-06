import { useState, useCallback } from 'react'

export function useVideoMode() {
    const [isVideoMode, setIsVideoMode] = useState(false)

    const toggleVideoMode = useCallback(() => {
        setIsVideoMode((prev) => !prev)
    }, [])

    // Bright green color for chroma keying
    const containerClassName = isVideoMode ? "bg-[#00b140] border-[#00b140]" : ""

    return {
        isVideoMode,
        toggleVideoMode,
        containerClassName
    }
}
