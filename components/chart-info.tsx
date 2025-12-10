"use client"

import { Info } from "lucide-react"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

interface ChartInfoProps {
    title?: string
    explanation?: string
    className?: string
}

export function ChartInfo({ title, explanation, className }: ChartInfoProps) {
    if (!explanation) return null

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={`h-6 w-6 rounded-full opacity-50 hover:opacity-100 transition-opacity ${className}`}
                >
                    <Info className="h-4 w-4" />
                    <span className="sr-only">About this chart</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 text-sm p-4" align="start">
                {title && <h4 className="font-semibold mb-2">{title}</h4>}
                <p className="text-muted-foreground leading-relaxed">
                    {explanation}
                </p>
            </PopoverContent>
        </Popover>
    )
}
