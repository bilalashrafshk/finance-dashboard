import { useState, useRef, useCallback } from 'react'
import html2canvas from 'html2canvas'
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
        canvas: HTMLCanvasElement | null
        isStopping: boolean
    }>({
        gif: null,
        intervalId: null,
        canvas: null,
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
                    // HTML/SVG capture using html2canvas
                    const canvas = await html2canvas(ref.current, {
                        useCORS: true,
                        scale: 1,
                        backgroundColor: null,
                        logging: false,
                        onclone: (clonedDoc) => {
                            // NUCLEAR FIX: Injected style to forcibly override ALL variables to Hex
                            // This prevents html2canvas from ever parsing 'oklch'/'lab' values
                            const style = clonedDoc.createElement('style');
                            style.innerHTML = `
                                *, *:before, *:after {
                                    --background: #00b140 !important;
                                    --foreground: #000000 !important;
                                    --card: #00b140 !important;
                                    --card-foreground: #000000 !important;
                                    --popover: #00b140 !important;
                                    --popover-foreground: #000000 !important;
                                    --primary: #000000 !important;
                                    --primary-foreground: #ffffff !important;
                                    --secondary: #ffffff !important;
                                    --secondary-foreground: #000000 !important;
                                    --muted: #e5e5e5 !important;
                                    --muted-foreground: #000000 !important;
                                    --accent: #ffffff !important;
                                    --accent-foreground: #000000 !important;
                                    --destructive: #ff0000 !important;
                                    --destructive-foreground: #ffffff !important;
                                    --border: #000000 !important;
                                    --input: #000000 !important;
                                    --ring: #000000 !important;
                                    --radius: 0px !important;
                                    --chart-1: #000000 !important;
                                    --chart-2: #0000FF !important;
                                    --chart-3: #FF0000 !important;
                                    --chart-4: #008000 !important;
                                    --chart-5: #FFA500 !important;
                                    --sidebar: #00b140 !important;
                                    --sidebar-foreground: #000000 !important;
                                    --sidebar-primary: #000000 !important;
                                    --sidebar-primary-foreground: #ffffff !important;
                                    --sidebar-accent: #ffffff !important;
                                    --sidebar-accent-foreground: #000000 !important;
                                    --sidebar-border: #000000 !important;
                                    --sidebar-ring: #000000 !important;
                                    box-shadow: none !important;
                                }
                            `;
                            clonedDoc.body.appendChild(style);
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
        if (!recorderRef.current.gif || !isRecording) return

        recorderRef.current.isStopping = true
        if (recorderRef.current.intervalId) {
            clearInterval(recorderRef.current.intervalId)
            recorderRef.current.intervalId = null
        }

        setIsEncoding(true)
        recorderRef.current.gif.render()
    }, [isRecording])

    return {
        isRecording,
        isEncoding,
        progress,
        startRecording,
        stopRecording
    }
}
