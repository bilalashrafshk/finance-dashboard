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
}

export function MarketSectorSidebar({ sectors, onSelectSector, selectedSector }: MarketSectorSidebarProps) {
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
