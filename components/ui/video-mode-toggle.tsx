import { Button } from "@/components/ui/button"
import { Video, MonitorPlay, CircleDot, Square, Loader2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface VideoModeToggleProps {
    isVideoMode: boolean
    onToggle: () => void
    isRecording?: boolean
    isEncoding?: boolean
    onRecordStart?: () => void
    onRecordStop?: () => void
}

export function VideoModeToggle({
    isVideoMode,
    onToggle,
    isRecording,
    isEncoding,
    onRecordStart,
    onRecordStop
}: VideoModeToggleProps) {
    return (
        <div className="flex items-center gap-2">
            {isVideoMode && onRecordStart && onRecordStop && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant={isRecording ? "secondary" : "secondary"}
                                size="icon"
                                onClick={isRecording ? undefined : onRecordStart}
                                disabled={isRecording || isEncoding}
                                className={isRecording ? "animate-pulse cursor-wait" : "hover:bg-red-100"}
                            >
                                {isEncoding ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : isRecording ? (
                                    <CircleDot className="h-4 w-4 text-red-500 animate-ping" />
                                ) : (
                                    <CircleDot className="h-4 w-4 text-red-500" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{isEncoding ? "Encoding GIF..." : isRecording ? "Recording in progress..." : "Record High-Quality GIF"}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}

            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant={isVideoMode ? "default" : "outline"}
                            size="icon"
                            onClick={onToggle}
                            className={isVideoMode ? "bg-red-500 hover:bg-red-600 border-red-500" : ""}
                        >
                            {isVideoMode ? (
                                <MonitorPlay className="h-4 w-4" />
                            ) : (
                                <Video className="h-4 w-4" />
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{isVideoMode ? "Exit Video Mode" : "Enter Video Mode"}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    )
}
