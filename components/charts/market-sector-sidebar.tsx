"use client"

import React from "react"
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface SectorPerformance {
    name: string
    change: number
    volume?: string | number
}

interface MarketSectorSidebarProps {
    sectors: SectorPerformance[]
    onSelectSector?: (sector: string) => void
    selectedSector?: string
    orientation?: 'vertical' | 'horizontal'
}

export function MarketSectorSidebar({ sectors, onSelectSector, selectedSector, orientation = 'vertical' }: MarketSectorSidebarProps) {
    const isHorizontal = orientation === 'horizontal'

    if (isHorizontal) {
        return (
            <div className="w-full bg-card rounded-lg border shadow-sm overflow-hidden flex flex-col mb-4">
                <div className="px-3 py-2 border-b bg-muted/40 backdrop-blur flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm tracking-tight">Sector Performance</span>
                        <span className="text-[10px] text-muted-foreground">(M-Cap Weighted)</span>
                    </div>
                </div>
                <div className="w-full overflow-x-auto pb-2">
                    <div className="flex w-max px-3 pt-2 gap-2">
                        {/* 'All' Option */}
                        <button
                            onClick={() => onSelectSector && onSelectSector('all')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs border transition-all duration-200 ${selectedSector === 'all'
                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                : "bg-background hover:bg-muted text-foreground border-transparent hover:border-border"
                                }`}
                        >
                            <span className="font-medium">All</span>
                        </button>

                        {sectors.map((sector) => {
                            const isPositive = sector.change > 0
                            const isNegative = sector.change < 0
                            const isSelected = selectedSector === sector.name

                            return (
                                <button
                                    key={sector.name}
                                    onClick={() => onSelectSector && onSelectSector(sector.name)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs border transition-all duration-200 ${isSelected
                                        ? "bg-primary/10 ring-1 ring-primary/20 border-primary/20"
                                        : "bg-background hover:bg-muted/50 border-border/40 hover:border-border"
                                        }`}
                                >
                                    <span className={`font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                                        {sector.name}
                                    </span>

                                    <div className={`flex items-center gap-1 font-semibold tabular-nums ${isPositive ? "text-green-500" : isNegative ? "text-red-500" : "text-muted-foreground"
                                        }`}>
                                        <span>
                                            {sector.change > 0 ? "+" : ""}{sector.change.toFixed(2)}%
                                        </span>
                                        {isPositive && <ArrowUpRight className="h-3 w-3" />}
                                        {isNegative && <ArrowDownRight className="h-3 w-3" />}
                                        {!isPositive && !isNegative && <Minus className="h-3 w-3" />}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full bg-card rounded-lg border shadow-sm overflow-hidden">
            <div className="p-4 border-b bg-muted/40 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <h3 className="font-semibold tracking-tight">Sector Performance</h3>
                <p className="text-xs text-muted-foreground mt-1">Market-cap weighted change</p>
            </div>

            <ScrollArea className="flex-1">
                <div className="flex flex-col p-2 gap-1">
                    {/* 'All' Option */}
                    <button
                        onClick={() => onSelectSector && onSelectSector('all')}
                        className={`flex items-center justify-between p-3 rounded-md text-sm transition-all duration-200 ${selectedSector === 'all'
                            ? "bg-primary text-primary-foreground shadow-md"
                            : "hover:bg-muted text-foreground"
                            }`}
                    >
                        <span className="font-medium">All Sectors</span>
                    </button>

                    {sectors.map((sector) => {
                        const isPositive = sector.change > 0
                        const isNegative = sector.change < 0
                        const isSelected = selectedSector === sector.name

                        return (
                            <button
                                key={sector.name}
                                onClick={() => onSelectSector && onSelectSector(sector.name)}
                                className={`flex items-center justify-between p-3 rounded-md text-sm transition-all duration-200 group ${isSelected
                                    ? "bg-primary/10 ring-1 ring-primary/20"
                                    : "hover:bg-muted/50"
                                    }`}
                            >
                                <div className="flex flex-col items-start gap-0.5 overflow-hidden">
                                    <span className={`font-medium truncate max-w-[140px] ${isSelected ? "text-primary" : "text-foreground"}`}>
                                        {sector.name}
                                    </span>
                                </div>

                                <div className={`flex items-center gap-1.5 font-semibold tabular-nums ${isPositive ? "text-green-500" : isNegative ? "text-red-500" : "text-muted-foreground"
                                    }`}>
                                    <span className="text-xs">
                                        {sector.change > 0 ? "+" : ""}{sector.change.toFixed(2)}%
                                    </span>
                                    {isPositive && <ArrowUpRight className="h-3.5 w-3.5" />}
                                    {isNegative && <ArrowDownRight className="h-3.5 w-3.5" />}
                                    {!isPositive && !isNegative && <Minus className="h-3.5 w-3.5" />}
                                </div>
                            </button>
                        )
                    })}
                </div>
            </ScrollArea>
        </div>
    )
}
