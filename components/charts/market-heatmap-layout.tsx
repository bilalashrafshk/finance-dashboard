"use client"

import React, { useState, useEffect, useRef } from "react"
import { MarketHeatmapTreemap, type MarketHeatmapStock, type SizeMode } from "@/components/market-heatmap/treemap"
import { MarketTickerStrip, type MarketIndex } from "./market-ticker-strip"
import { MarketSectorSidebar, type SectorPerformance } from "./market-sector-sidebar"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Loader2, RefreshCw, Maximize2, Minimize2, Calendar } from "lucide-react"
import { getTodayInMarketTimezone } from "@/lib/portfolio/market-hours"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type Timeframe = '1D' | '1W' | '1M' | 'YTD' | 'Custom'

export function MarketHeatmapLayout() {
    const [timeframe, setTimeframe] = useState<Timeframe>('1D')
    const [selectedDate, setSelectedDate] = useState<string>("") // End Date
    const [startDate, setStartDate] = useState<string>("") // Start Date (for Custom)
    const [selectedSector, setSelectedSector] = useState<string>('all')
    const [sizeMode, setSizeMode] = useState<SizeMode>('marketCap')

    const [data, setData] = useState<{
        stocks: MarketHeatmapStock[],
        indices: MarketIndex[],
        sectors: SectorPerformance[],
        lastUpdated: string | null,
        count: number
    } | null>(null)

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isFullscreen, setIsFullscreen] = useState(false)

    const containerRef = useRef<HTMLDivElement>(null)
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

    // Initialize Date
    useEffect(() => {
        const today = getTodayInMarketTimezone('PSX')
        setSelectedDate(today)
    }, [])

    // Fetch Data
    const fetchData = async () => {
        if (!selectedDate) return

        setLoading(true)
        setError(null)

        try {
            const params = new URLSearchParams({
                date: selectedDate,
                limit: '100' // Top 100
            })

            if (timeframe === 'Custom') {
                if (startDate) {
                    params.append('startDate', startDate)
                    params.append('timeframe', 'Custom')
                } else {
                    // If custom but no start date, maybe default to 1M or warn? 
                    // Let's default to logic handled by API if missing, or don't append.
                    // But API needs startDate if timeframe is not standard.
                    // We'll enforce it in UI? Or duplicate end date (0 change).
                    params.append('startDate', selectedDate)
                }
            } else {
                params.append('timeframe', timeframe)
            }

            const response = await fetch(`/api/market-heatmap?${params.toString()}`)
            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.error || 'Failed to fetch data')
            }

            if (result.success) {
                setData({
                    stocks: result.stocks || [],
                    indices: result.indices || [],
                    sectors: result.sectors || [],
                    lastUpdated: new Date().toLocaleTimeString(),
                    count: result.count || 0
                })
            } else {
                throw new Error(result.error || 'Unknown error')
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [selectedDate, timeframe, startDate]) // Refetch on start date change too

    // Handle Resize for Treemap
    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                const { width, height } = containerRef.current.getBoundingClientRect()
                setDimensions({
                    width: Math.max(width - 32, 400), // Account for padding
                    height: Math.max(height - 240, 400) // Account for headers/sidebar
                })
            }
        }

        const timeout = setTimeout(updateSize, 100)
        window.addEventListener('resize', updateSize)

        return () => {
            clearTimeout(timeout)
            window.removeEventListener('resize', updateSize)
        }
    }, [data, isFullscreen])

    const filteredStocks = React.useMemo(() => {
        if (!data?.stocks) return []
        if (selectedSector === 'all') return data.stocks
        return data.stocks.filter(s => s.sector === selectedSector)
    }, [data?.stocks, selectedSector])

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
            setIsFullscreen(true)
        } else {
            document.exitFullscreen();
            setIsFullscreen(false)
        }
    }

    return (
        <div className={`flex flex-col gap-4 font-sans ${isFullscreen ? 'bg-background p-4' : ''}`} ref={containerRef}>

            {/* 1. Header & Controls */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Market Heatmap</h2>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>PSX Top 100 Companies</span>
                        {data?.count !== undefined && (
                            <>
                                <span>•</span>
                                <span>Showing {data.count} Stocks</span>
                            </>
                        )}
                        <span>•</span>
                        <span>Market Cap Weighted</span>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)} className="w-auto">
                        <TabsList>
                            <TabsTrigger value="1D">1D</TabsTrigger>
                            <TabsTrigger value="1W">1W</TabsTrigger>
                            <TabsTrigger value="1M">1M</TabsTrigger>
                            <TabsTrigger value="YTD">YTD</TabsTrigger>
                            <TabsTrigger value="Custom">Custom</TabsTrigger>
                        </TabsList>
                    </Tabs>

                    {timeframe === 'Custom' && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="relative">
                                <span className="absolute -top-3 left-0 text-[10px] text-muted-foreground">Start</span>
                                <Input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    max={selectedDate}
                                    className="w-36 h-9 text-sm"
                                />
                            </div>
                            <span className="text-muted-foreground">-</span>
                        </div>
                    )}

                    <div className="relative">
                        <span className="absolute -top-3 left-0 text-[10px] text-muted-foreground">
                            {timeframe === 'Custom' ? 'End' : 'Date'}
                        </span>
                        <Input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                            className="w-36 h-9 text-sm"
                        />
                    </div>

                    <Button variant="outline" size="icon" onClick={fetchData} disabled={loading} title="Refresh Data" className="mt-2">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>

                    <Button variant="ghost" size="icon" onClick={toggleFullscreen} title="Toggle Fullscreen" className="mt-2">
                        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            {/* 2. Ticker Strip */}
            {data?.indices && data.indices.length > 0 && (
                <MarketTickerStrip indices={data.indices} />
            )}

            {/* 3. Main Content Stack */}
            <div className="flex flex-col gap-4 h-[900px]">
                {/* Top: Sector Sidebar (Horizontal) */}
                <div className="w-full flex-shrink-0">
                    {loading && !data ? (
                        <div className="h-[60px] w-full rounded-lg border bg-muted/10 animate-pulse" />
                    ) : (
                        <MarketSectorSidebar
                            sectors={data?.sectors || []}
                            selectedSector={selectedSector}
                            onSelectSector={setSelectedSector}
                            orientation="horizontal"
                        />
                    )}
                </div>

                {/* Bottom: Heatmap (Full Width) */}
                <Card className="flex-1 flex flex-col min-h-0 overflow-hidden border-none shadow-none bg-transparent">
                    {/* Heatmap Controls */}
                    <div className="flex items-center justify-between mb-2 px-1">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                                Map Size:
                            </span>
                            <ToggleGroup type="single" value={sizeMode} onValueChange={(v) => v && setSizeMode(v as SizeMode)} size="sm">
                                <ToggleGroupItem value="marketCap" className="text-xs h-7 px-2">Market Cap</ToggleGroupItem>
                                <ToggleGroupItem value="marketCapChange" className="text-xs h-7 px-2">Market Cap Change</ToggleGroupItem>
                                <ToggleGroupItem value="absoluteChange" className="text-xs h-7 px-2">Absolute Price Change</ToggleGroupItem>
                            </ToggleGroup>
                        </div>

                        <div className="flex items-center gap-3 text-xs">
                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-green-500 rounded-sm"></div>Gainers</div>
                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-red-500 rounded-sm"></div>Losers</div>
                            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-gray-400 rounded-sm"></div>Neutral</div>
                        </div>
                    </div>

                    <div className="flex-1 rounded-xl border bg-card overflow-hidden relative">
                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
                                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            </div>
                        ) : null}

                        {error ? (
                            <div className="flex items-center justify-center h-full text-destructive">
                                <p>{error}</p>
                            </div>
                        ) : (
                            <div style={{ width: '100%', height: '100%' }}>
                                <MarketHeatmapTreemap
                                    stocks={filteredStocks}
                                    width={dimensions.width}
                                    height={dimensions.height}
                                    sizeMode={sizeMode}
                                    sectorPerformance={data?.sectors || []}
                                />
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    )
}
