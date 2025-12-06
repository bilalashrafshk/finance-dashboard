import { Button } from "@/components/ui/button"
import { Video, MonitorPlay } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface VideoModeToggleProps {
    isVideoMode: boolean
    onToggle: () => void
}

export function VideoModeToggle({ isVideoMode, onToggle }: VideoModeToggleProps) {
    return (
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
    )
}
