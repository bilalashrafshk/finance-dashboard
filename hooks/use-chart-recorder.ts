import { useState, useRef, useCallback } from 'react'
import { toCanvas } from 'html-to-image'
import GIF from 'gif.js'

interface UseChartRecorderOptions {
    width?: number
    height?: number
    quality?: number
    delay?: number // ms between frames
    workerScript?: string
}

export function useChartRecorder(ref: React.RefObject<HTMLElement>, options: UseChartRecorderOptions = {}) {
    const [isRecording, setIsRecording] = useState(false)
    const [isEncoding, setIsEncoding] = useState(false)
    const [progress, setProgress] = useState(0)

    const recorderRef = useRef<{
        gif: GIF | null
        intervalId: NodeJS.Timeout | null
        isStopping: boolean
    }>({
        gif: null,
        intervalId: null,
        isStopping: false
    })

    const startRecording = useCallback(async (onStart?: () => Promise<void> | void) => {
        if (!ref.current || isRecording) return

        if (onStart) {
            await onStart()
        }

        setIsRecording(true)
        setProgress(0)
        recorderRef.current.isStopping = false

        const gif = new GIF({
            workers: 2,
            quality: options.quality || 10,
            width: ref.current.offsetWidth,
            height: ref.current.offsetHeight,
            workerScript: options.workerScript || '/gif.worker.js',
            background: '#00b140' // Match video mode background or transparent
        })

        recorderRef.current.gif = gif

        // Setup encoding events
        gif.on('progress', (p: number) => {
            setProgress(p)
        })

        gif.on('finished', (blob: Blob) => {
            setIsEncoding(false)
            setIsRecording(false)
            recorderRef.current.gif = null

            // Trigger download
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `chart-recording-${new Date().toISOString()}.gif`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        })

        // Determine recording strategy based on content
        const canvasElement = ref.current.querySelector('canvas')
        const isCanvasBased = !!canvasElement

        const captureFrame = async () => {
            if (!ref.current || recorderRef.current.isStopping) return

            try {
                if (isCanvasBased && canvasElement) {
                    // Canvas capture is synchronous and fast
                    gif.addFrame(canvasElement, { copy: true, delay: options.delay || 100 })
                } else {
                    // HTML/SVG capture using html-to-image (Supports modern CSS/oklch better than html2canvas)
                    // Skip fonts to speed up and avoid CORS issues, as we use system fonts mostly
                    const canvas = await toCanvas(ref.current, {
                        backgroundColor: undefined,
                        skipAutoScale: true,
                        // Manually filter out problematic elements if needed
                        filter: (node) => {
                            return true
                        }
                    })

                    if (!recorderRef.current.isStopping) {
                        gif.addFrame(canvas, { copy: true, delay: options.delay || 100 })
                    }
                }
            } catch (err) {
                console.error("Frame capture error:", err)
            }
        }

        // Start capture loop
        recorderRef.current.intervalId = setInterval(captureFrame, options.delay || 100)


        // Auto-stop after 4 seconds (captures 40 frames at 100ms)
        setTimeout(() => {
            stopRecording()
        }, 4000)

    }, [ref, options.delay, options.quality, options.workerScript, isRecording])

    const stopRecording = useCallback(() => {
        // Rely on ref existence, not state variable (which might be stale in closure)
        if (!recorderRef.current.gif) return

        recorderRef.current.isStopping = true
        if (recorderRef.current.intervalId) {
            clearInterval(recorderRef.current.intervalId)
            recorderRef.current.intervalId = null
        }

        setIsEncoding(true)
        recorderRef.current.gif.render()
    }, [])

    return {
        isRecording,
        isEncoding,
        progress,
        startRecording,
        stopRecording
    }
}
