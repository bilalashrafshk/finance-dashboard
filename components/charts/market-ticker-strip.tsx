"use client"

import React from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Card } from "@/components/ui/card"

export interface MarketIndex {
    name: string
    price: number
    change: number
    changePercent: number
    volume?: string
}

interface MarketTickerStripProps {
    indices: MarketIndex[]
}

export function MarketTickerStrip({ indices }: MarketTickerStripProps) {
    if (!indices || indices.length === 0) {
        return null
    }

    return (
        <div className="w-full bg-background border-b mb-1">
            <div className="flex overflow-x-auto py-2 px-4 gap-6 items-center no-scrollbar">
                {indices.map((index) => {
                    const isPositive = index.change > 0
                    const isNegative = index.change < 0
                    const isNeutral = index.change === 0

                    return (
                        <div key={index.name} className="flex items-center gap-3 min-w-fit pr-4 border-r last:border-0 border-border/50">
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                    {index.name}
                                </span>
                                <span className="text-lg font-bold tabular-nums font-mono">
                                    {index.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>

                            <div className={`flex flex-col items-end ${isPositive ? "text-green-500" : isNegative ? "text-red-500" : "text-muted-foreground"
                                }`}>
                                <div className="flex items-center gap-1">
                                    {isPositive && <TrendingUp className="h-3 w-3" />}
                                    {isNegative && <TrendingDown className="h-3 w-3" />}
                                    {isNeutral && <Minus className="h-3 w-3" />}
                                    <span className="text-sm font-bold tabular-nums">
                                        {index.change > 0 ? "+" : ""}{index.change.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <span className="text-xs font-medium tabular-nums bg-opacity-10 rounded px-1">
                                    {index.changePercent > 0 ? "+" : ""}{index.changePercent.toFixed(2)}%
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
